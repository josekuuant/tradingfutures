import { db, schema } from "@/lib/db";
import { desc, eq } from "drizzle-orm";
import { log } from "@/lib/logger";
import { getActiveStrategy } from "./strategies";
import { getMarketSnapshot } from "./market";
import { listPrompts } from "./prompts";
import { callClaude, ClaudeClientError } from "./claude/client";
import { assemblePrompt } from "./claude/prompt-assembler";
import { parseClaudeResponse } from "./claude/response-parser";
import { runPreFilters } from "./engine/pre-filters";
import {
  pushTrace,
  getTraces,
  getLastTrace,
  getEngineStats,
  getLastSuccessfulRunAt,
} from "./engine/trace-store";
import type {
  Signal,
  SignalEngineInput,
  SignalEngineResult,
  SignalErrorCode,
} from "@/types/signal";
import type { Instrument, Timeframe } from "@/types/market";
import { DEFAULT_ENGINE_CONFIG, type EngineConfig } from "@/types/engine";
import { checkRateLimit, recordEvent } from "@/lib/rate-limiter";

const MAX_SIGNALS_PER_HOUR = 30;

// ─── Engine state ────────────────────────────────────────────

let engineConfig: EngineConfig = { ...DEFAULT_ENGINE_CONFIG };

export function getEngineConfig(): EngineConfig {
  return { ...engineConfig };
}

export function updateEngineConfig(partial: Partial<EngineConfig>): void {
  engineConfig = { ...engineConfig, ...partial };
}

// ─── Main entry point ────────────────────────────────────────

export async function generateSignal(
  input: SignalEngineInput = {}
): Promise<SignalEngineResult> {
  const startTime = Date.now();

  // 0. Rate limit check
  const rateCheck = checkRateLimit("signal-generation", MAX_SIGNALS_PER_HOUR);
  if (!rateCheck.allowed) {
    log.engine.warn(
      `Rate limit reached: ${MAX_SIGNALS_PER_HOUR}/hr. Reset in ${rateCheck.resetInSeconds}s`
    );
    return fail(
      "FILTERED",
      `Rate limit: max ${MAX_SIGNALS_PER_HOUR} signals/hour. Try again in ${rateCheck.resetInSeconds}s.`
    );
  }

  // 1. Get active strategy
  const strategy = await getActiveStrategy();
  if (!strategy) {
    pushTrace({
      outcome: "error",
      instrument: input.instrument ?? "NQ",
      timeframe: input.timeframe ?? "5m",
      strategyName: null,
      promptName: null,
      filterReport: null,
      signalId: null,
      error: "No active strategy",
      durationMs: Date.now() - startTime,
    });
    return fail("NO_STRATEGY", "No active strategy. Activate one in Strategies.");
  }

  // 2. Get active prompt
  const allPrompts = await listPrompts();
  const activePrompt = allPrompts.find((p) => p.isActive);
  if (!activePrompt) {
    pushTrace({
      outcome: "error",
      instrument: input.instrument ?? "NQ",
      timeframe: input.timeframe ?? "5m",
      strategyName: strategy.name,
      promptName: null,
      filterReport: null,
      signalId: null,
      error: "No active prompt",
      durationMs: Date.now() - startTime,
    });
    return fail("NO_PROMPT", "No active prompt. Activate one in Prompt Studio.");
  }

  // 3. Get market data
  const instrument = (input.instrument ?? strategy.instrument ?? "NQ") as Instrument;
  const timeframe = (input.timeframe ?? strategy.timeframes[0] ?? "5m") as Timeframe;

  let snapshot;
  try {
    snapshot = await getMarketSnapshot(instrument, timeframe);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    log.engine.error(`Market data failed: ${msg}`);
    pushTrace({
      outcome: "error",
      instrument,
      timeframe,
      strategyName: strategy.name,
      promptName: activePrompt.name,
      filterReport: null,
      signalId: null,
      error: `Market data: ${msg}`,
      durationMs: Date.now() - startTime,
    });
    return fail("MARKET_DATA_FAILED", `Failed to get market data: ${msg}`);
  }

  // 3b. Validate market data freshness
  const quoteAge = (Date.now() - new Date(snapshot.quote.timestamp).getTime()) / 1000;
  if (quoteAge > engineConfig.maxDataAgeSeconds) {
    const msg = `Market data is ${Math.round(quoteAge)}s old (max: ${engineConfig.maxDataAgeSeconds}s)`;
    log.engine.warn(msg);
    pushTrace({
      outcome: "error",
      instrument,
      timeframe,
      strategyName: strategy.name,
      promptName: activePrompt.name,
      filterReport: null,
      signalId: null,
      error: msg,
      durationMs: Date.now() - startTime,
    });
    return fail("MARKET_DATA_FAILED", msg);
  }

  // 4. Get recent signals for dedup check
  const recentSignals = await listSignals(10);

  // 5. Run pre-filters
  const lastRunAt = getLastSuccessfulRunAt();
  const filterReport = runPreFilters(
    snapshot,
    strategy,
    recentSignals,
    engineConfig,
    lastRunAt
  );

  // Manual trigger only bypasses cooldown — dedup and validation still run
  const isManualTrigger = input.manualTrigger === true;
  const effectiveReport = { ...filterReport };
  if (isManualTrigger && !filterReport.passed) {
    // Re-evaluate: only allow bypass of cooldown filter
    const nonCooldownSkips = filterReport.results.filter(
      (r) => r.verdict === "skip" && r.filter !== "cooldown"
    );
    effectiveReport.passed = nonCooldownSkips.length === 0;
  }

  if (!effectiveReport.passed) {
    const skippedFilters = effectiveReport.results
      .filter((r) => r.verdict === "skip")
      .map((r) => `${r.filter}: ${r.reason}`)
      .join("; ");

    log.engine.info(`Filtered out: ${skippedFilters}`);

    pushTrace({
      outcome: "filtered_out",
      instrument,
      timeframe,
      strategyName: strategy.name,
      promptName: activePrompt.name,
      filterReport: effectiveReport,
      signalId: null,
      error: null,
      durationMs: Date.now() - startTime,
    });

    return fail("FILTERED", `Pre-filters not passed: ${skippedFilters}`);
  }

  // 6. Assemble prompt
  const assembled = assemblePrompt(
    activePrompt,
    strategy,
    snapshot,
    engineConfig.promptCandleCount
  );

  log.engine.info(`Calling Claude for ${instrument} ${timeframe}`, {
    strategy: strategy.name,
    prompt: activePrompt.name,
  });

  // 7. Call Claude
  let claudeResponse;
  try {
    claudeResponse = await callClaude({
      systemPrompt: assembled.systemPrompt,
      userPrompt: assembled.userPrompt,
    });
  } catch (err) {
    if (err instanceof ClaudeClientError) {
      const codeMap: Record<string, SignalErrorCode> = {
        NO_API_KEY: "NO_API_KEY",
        AUTH_ERROR: "NO_API_KEY",
        TIMEOUT: "CLAUDE_TIMEOUT",
      };
      const code = codeMap[err.code] ?? "CLAUDE_API_ERROR";
      log.claude.error(`Claude error (${err.code}): ${err.message}`);
      pushTrace({
        outcome: "error",
        instrument,
        timeframe,
        strategyName: strategy.name,
        promptName: activePrompt.name,
        filterReport,
        signalId: null,
        error: `Claude: ${err.message}`,
        durationMs: Date.now() - startTime,
      });
      return fail(code, err.message);
    }
    const msg = err instanceof Error ? err.message : "Unknown Claude error";
    log.claude.error(`Claude error: ${msg}`);
    pushTrace({
      outcome: "error",
      instrument,
      timeframe,
      strategyName: strategy.name,
      promptName: activePrompt.name,
      filterReport,
      signalId: null,
      error: msg,
      durationMs: Date.now() - startTime,
    });
    return fail("CLAUDE_API_ERROR", msg);
  }

  // 8. Parse response (with minConfidence enforcement)
  const parseResult = parseClaudeResponse(claudeResponse.content, {
    minConfidence: engineConfig.minConfidence,
  });

  if (!parseResult.success) {
    log.engine.error(`Parse error: ${parseResult.error}`);

    // Save failed attempt for audit
    await saveSignalToDb({
      strategyId: strategy.id,
      strategyName: strategy.name,
      promptId: activePrompt.id,
      promptName: activePrompt.name,
      action: "NO_TRADE",
      confidence: 0,
      reasoning: `PARSE ERROR: ${parseResult.error}`,
      entryPrice: null,
      stopLoss: null,
      takeProfit: null,
      riskRewardRatio: null,
      invalidation: "",
      marketContext: "",
      instrument,
      timeframe,
      currentPrice: snapshot.quote.lastPrice,
      claudeModel: claudeResponse.model,
      systemPromptSent: assembled.systemPrompt,
      userPromptSent: assembled.userPrompt,
      rawResponse: claudeResponse.content,
      durationMs: claudeResponse.durationMs,
    });

    pushTrace({
      outcome: "error",
      instrument,
      timeframe,
      strategyName: strategy.name,
      promptName: activePrompt.name,
      filterReport,
      signalId: null,
      error: `Parse: ${parseResult.error}`,
      durationMs: Date.now() - startTime,
    });

    return fail("INVALID_RESPONSE", parseResult.error);
  }

  // 9. Persist signal
  const data = parseResult.data;
  const totalDuration = Date.now() - startTime;

  const signal = await saveSignalToDb({
    strategyId: strategy.id,
    strategyName: strategy.name,
    promptId: activePrompt.id,
    promptName: activePrompt.name,
    action: data.action,
    confidence: data.confidence,
    reasoning: data.reasoning,
    entryPrice: data.entry_price,
    stopLoss: data.stop_loss,
    takeProfit: data.take_profit,
    riskRewardRatio: data.risk_reward_ratio,
    invalidation: data.invalidation ?? "",
    marketContext: data.market_context ?? "",
    instrument,
    timeframe,
    currentPrice: snapshot.quote.lastPrice,
    claudeModel: claudeResponse.model,
    systemPromptSent: assembled.systemPrompt,
    userPromptSent: assembled.userPrompt,
    rawResponse: claudeResponse.content,
    durationMs: totalDuration,
  });

  log.engine.info(`Signal: ${data.action} (${Math.round(data.confidence * 100)}%) in ${totalDuration}ms`, {
    action: data.action,
    confidence: data.confidence,
    instrument,
    timeframe,
    durationMs: totalDuration,
  });

  pushTrace({
    outcome: "signal_generated",
    instrument,
    timeframe,
    strategyName: strategy.name,
    promptName: activePrompt.name,
    filterReport,
    signalId: signal.id,
    error: null,
    durationMs: totalDuration,
  });

  // Record successful generation for rate limiting
  recordEvent("signal-generation");

  return { success: true, signal };
}

// ─── Re-exports for API ──────────────────────────────────────

export { getTraces, getLastTrace, getEngineStats };

// ─── Signal persistence ──────────────────────────────────────

interface SignalInsert {
  strategyId: string;
  strategyName: string;
  promptId: string;
  promptName: string;
  action: string;
  confidence: number;
  reasoning: string;
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  riskRewardRatio: number | null;
  invalidation: string;
  marketContext: string;
  instrument: string;
  timeframe: string;
  currentPrice: number;
  claudeModel: string;
  systemPromptSent: string;
  userPromptSent: string;
  rawResponse: string;
  durationMs: number;
}

async function saveSignalToDb(data: SignalInsert): Promise<Signal> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(schema.signals).values({
    id,
    strategyId: data.strategyId,
    strategyName: data.strategyName,
    promptId: data.promptId,
    promptName: data.promptName,
    action: data.action,
    confidence: Math.round(data.confidence * 100),
    reasoning: data.reasoning,
    entryPrice: data.entryPrice != null ? String(data.entryPrice) : null,
    stopLoss: data.stopLoss != null ? String(data.stopLoss) : null,
    takeProfit: data.takeProfit != null ? String(data.takeProfit) : null,
    riskRewardRatio:
      data.riskRewardRatio != null ? String(data.riskRewardRatio) : null,
    invalidation: data.invalidation,
    marketContext: data.marketContext,
    instrument: data.instrument,
    timeframe: data.timeframe,
    currentPrice: String(data.currentPrice),
    claudeModel: data.claudeModel,
    systemPromptSent: data.systemPromptSent,
    userPromptSent: data.userPromptSent,
    rawResponse: data.rawResponse,
    durationMs: data.durationMs,
    createdAt: now,
  });

  return {
    id,
    strategyId: data.strategyId,
    strategyName: data.strategyName,
    promptId: data.promptId,
    promptName: data.promptName,
    action: data.action as Signal["action"],
    confidence: data.confidence,
    reasoning: data.reasoning,
    entryPrice: data.entryPrice,
    stopLoss: data.stopLoss,
    takeProfit: data.takeProfit,
    riskRewardRatio: data.riskRewardRatio,
    invalidation: data.invalidation,
    marketContext: data.marketContext,
    instrument: data.instrument,
    timeframe: data.timeframe,
    currentPrice: data.currentPrice,
    claudeModel: data.claudeModel,
    systemPromptSent: data.systemPromptSent,
    userPromptSent: data.userPromptSent,
    rawResponse: data.rawResponse,
    durationMs: data.durationMs,
    createdAt: now,
  };
}

// ─── Signal queries ──────────────────────────────────────────

function dbRowToSignal(row: schema.SignalRow): Signal {
  return {
    id: row.id,
    strategyId: row.strategyId,
    strategyName: row.strategyName,
    promptId: row.promptId,
    promptName: row.promptName,
    action: (["BUY", "SELL", "NO_TRADE"].includes(row.action)
      ? row.action
      : "NO_TRADE") as Signal["action"],
    confidence: row.confidence / 100,
    reasoning: row.reasoning,
    entryPrice: row.entryPrice ? Number(row.entryPrice) : null,
    stopLoss: row.stopLoss ? Number(row.stopLoss) : null,
    takeProfit: row.takeProfit ? Number(row.takeProfit) : null,
    riskRewardRatio: row.riskRewardRatio ? Number(row.riskRewardRatio) : null,
    invalidation: row.invalidation,
    marketContext: row.marketContext,
    instrument: row.instrument,
    timeframe: row.timeframe,
    currentPrice: Number(row.currentPrice),
    claudeModel: row.claudeModel,
    systemPromptSent: row.systemPromptSent,
    userPromptSent: row.userPromptSent,
    rawResponse: row.rawResponse,
    durationMs: row.durationMs,
    createdAt: row.createdAt,
  };
}

export async function listSignals(limit = 50): Promise<Signal[]> {
  const rows = await db
    .select()
    .from(schema.signals)
    .orderBy(desc(schema.signals.createdAt))
    .limit(limit);
  return rows.map(dbRowToSignal);
}

export async function getSignal(id: string): Promise<Signal | null> {
  const rows = await db
    .select()
    .from(schema.signals)
    .where(eq(schema.signals.id, id))
    .limit(1);
  return rows.length > 0 ? dbRowToSignal(rows[0]) : null;
}

export async function getLatestSignal(): Promise<Signal | null> {
  const rows = await db
    .select()
    .from(schema.signals)
    .orderBy(desc(schema.signals.createdAt))
    .limit(1);
  return rows.length > 0 ? dbRowToSignal(rows[0]) : null;
}

// ─── Helpers ─────────────────────────────────────────────────

function fail(code: SignalErrorCode, error: string): SignalEngineResult {
  return { success: false, error, code };
}
