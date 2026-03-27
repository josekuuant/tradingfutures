import { db, schema } from "@/lib/db";
import { desc, eq } from "drizzle-orm";
import { getActiveStrategy } from "./strategies";
import { getMarketSnapshot } from "./market";
import { listPrompts } from "./prompts";
import { callClaude, ClaudeClientError } from "./claude/client";
import { assemblePrompt } from "./claude/prompt-assembler";
import { parseClaudeResponse } from "./claude/response-parser";
import type {
  Signal,
  SignalEngineInput,
  SignalEngineResult,
  SignalErrorCode,
} from "@/types/signal";
import type { Instrument, Timeframe } from "@/types/market";

// ─── Main entry point ────────────────────────────────────────

export async function generateSignal(
  input: SignalEngineInput = {}
): Promise<SignalEngineResult> {
  const startTime = Date.now();

  // 1. Get active strategy
  const strategy = await getActiveStrategy();
  if (!strategy) {
    return fail("NO_STRATEGY", "No active strategy. Activate one in Strategies.");
  }

  // 2. Get active prompt
  const prompts = await listPrompts();
  const activePrompt = prompts.find((p) => p.isActive);
  if (!activePrompt) {
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
    console.error("[SignalEngine] Market data failed:", msg);
    return fail("MARKET_DATA_FAILED", `Failed to get market data: ${msg}`);
  }

  // 4. Assemble prompt
  const assembled = assemblePrompt(activePrompt, strategy, snapshot);

  console.log(
    `[SignalEngine] Calling Claude for ${instrument} ${timeframe} with strategy "${strategy.name}" and prompt "${activePrompt.name}"`
  );

  // 5. Call Claude
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
      console.error(`[SignalEngine] Claude error (${err.code}): ${err.message}`);
      return fail(code, err.message);
    }
    const msg = err instanceof Error ? err.message : "Unknown Claude error";
    console.error("[SignalEngine] Claude error:", msg);
    return fail("CLAUDE_API_ERROR", msg);
  }

  // 6. Parse response
  const parseResult = parseClaudeResponse(claudeResponse.content);

  if (!parseResult.success) {
    console.error("[SignalEngine] Parse error:", parseResult.error);

    // Still save the failed attempt for audit
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

    return fail("INVALID_RESPONSE", parseResult.error);
  }

  // 7. Build and persist signal
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

  console.log(
    `[SignalEngine] Signal generated: ${data.action} (${Math.round(data.confidence * 100)}% confidence) in ${totalDuration}ms`
  );

  return { success: true, signal };
}

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

  return rowToSignal(id, data, now);
}

function rowToSignal(id: string, data: SignalInsert, createdAt: string): Signal {
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
    createdAt,
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
    action: row.action as Signal["action"],
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
