import { db, schema } from "@/lib/db";
import { desc, eq } from "drizzle-orm";
import { log } from "@/lib/logger";
import { getStrategy } from "../strategies";
import { getPrompt } from "../prompts";
import { getAdapter } from "../market";
import { normalizeCandles } from "../market/normalizer";
import { computeSessionLevels } from "../market/derived-metrics";
import { assemblePrompt } from "../claude/prompt-assembler";
import { callClaude } from "../claude/client";
import { parseClaudeResponse } from "../claude/response-parser";
import { calculateResults, determineOutcome } from "./results-calculator";
import type { BacktestConfig, BacktestRun, BacktestSignal } from "@/types/backtest";
import type { OHLCV, MarketSnapshot, MarketQuote, FeedHealth } from "@/types/market";
import type { Instrument, Timeframe } from "@/types/market";

// ─── Run a backtest ──────────────────────────────────────────

export async function runBacktest(
  config: BacktestConfig
): Promise<BacktestRun> {
  const id = crypto.randomUUID();
  const startedAt = new Date().toISOString();

  // Validate strategy and prompt exist
  const strategy = await getStrategy(config.strategyId);
  if (!strategy) throw new Error("Strategy not found");

  const prompt = await getPrompt(config.promptId);
  if (!prompt) throw new Error("Prompt not found");

  log.engine.info(`Backtest started: ${strategy.name} + ${prompt.name}`, {
    candleCount: config.candleCount,
    windowSize: config.windowSize,
    stepSize: config.stepSize,
  });

  // Save initial run
  await db.insert(schema.backtestRuns).values({
    id,
    config: JSON.stringify(config),
    status: "running",
    progress: 0,
    signals: "[]",
    strategyName: strategy.name,
    promptName: prompt.name,
    startedAt,
  });

  try {
    // Generate candle dataset
    const adapter = getAdapter();
    const rawCandles = await adapter.getCandles(
      config.instrument as Instrument,
      config.timeframe as Timeframe,
      config.candleCount
    );
    const allCandles = normalizeCandles(rawCandles);

    if (allCandles.length < config.windowSize + 10) {
      throw new Error(
        `Need at least ${config.windowSize + 10} candles, got ${allCandles.length}`
      );
    }

    const signals: BacktestSignal[] = [];
    const totalSteps = Math.floor(
      (allCandles.length - config.windowSize) / config.stepSize
    );

    // Replay loop
    for (let step = 0; step < totalSteps; step++) {
      const startIdx = step * config.stepSize;
      const windowCandles = allCandles.slice(
        startIdx,
        startIdx + config.windowSize
      );
      const futureCandles = allCandles.slice(
        startIdx + config.windowSize,
        startIdx + config.windowSize + 20
      );

      // Build a synthetic MarketSnapshot from the window
      const snapshot = buildSnapshotFromCandles(
        windowCandles,
        config.instrument as Instrument
      );

      // Assemble and call Claude
      const assembled = assemblePrompt(prompt, strategy, snapshot);
      const claudeResponse = await callClaude({
        systemPrompt: assembled.systemPrompt,
        userPrompt: assembled.userPrompt,
      });

      const parseResult = parseClaudeResponse(claudeResponse.content);

      let signal: BacktestSignal;

      if (parseResult.success) {
        const data = parseResult.data;
        signal = {
          index: step,
          timestamp: windowCandles[windowCandles.length - 1].timestamp,
          action: data.action,
          confidence: data.confidence,
          reasoning: data.reasoning,
          entryPrice: data.entry_price,
          stopLoss: data.stop_loss,
          takeProfit: data.take_profit,
          riskRewardRatio: data.risk_reward_ratio,
          currentPrice: snapshot.quote.lastPrice,
          outcome: "pending",
          outcomePrice: null,
        };

        // Determine outcome
        const outcomeResult = determineOutcome(signal, futureCandles);
        signal.outcome = outcomeResult.outcome;
        signal.outcomePrice = outcomeResult.outcomePrice;
      } else {
        signal = {
          index: step,
          timestamp: windowCandles[windowCandles.length - 1].timestamp,
          action: "NO_TRADE",
          confidence: 0,
          reasoning: `Parse error: ${parseResult.error}`,
          entryPrice: null,
          stopLoss: null,
          takeProfit: null,
          riskRewardRatio: null,
          currentPrice: snapshot.quote.lastPrice,
          outcome: "no_trade",
          outcomePrice: null,
        };
      }

      signals.push(signal);

      // Update progress
      const progress = Math.round(((step + 1) / totalSteps) * 100);
      await db
        .update(schema.backtestRuns)
        .set({ progress, signals: JSON.stringify(signals) })
        .where(eq(schema.backtestRuns.id, id));
    }

    // Calculate results
    const results = calculateResults(signals);
    const completedAt = new Date().toISOString();

    await db
      .update(schema.backtestRuns)
      .set({
        status: "completed",
        progress: 100,
        signals: JSON.stringify(signals),
        results: JSON.stringify(results),
        completedAt,
      })
      .where(eq(schema.backtestRuns.id, id));

    log.engine.info(`Backtest completed: ${signals.length} signals`, {
      wins: results.wins,
      losses: results.losses,
      winRate: results.winRate,
    });

    return toBacktestRun(
      id,
      config,
      "completed",
      100,
      signals,
      results,
      null,
      startedAt,
      completedAt,
      strategy.name,
      prompt.name
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    log.engine.error(`Backtest failed: ${msg}`);

    await db
      .update(schema.backtestRuns)
      .set({ status: "failed", error: msg })
      .where(eq(schema.backtestRuns.id, id));

    return toBacktestRun(
      id,
      config,
      "failed",
      0,
      [],
      null,
      msg,
      startedAt,
      null,
      strategy.name,
      prompt.name
    );
  }
}

// ─── Queries ─────────────────────────────────────────────────

export async function listBacktestRuns(limit = 20): Promise<BacktestRun[]> {
  const rows = await db
    .select()
    .from(schema.backtestRuns)
    .orderBy(desc(schema.backtestRuns.startedAt))
    .limit(limit);
  return rows.map(rowToRun);
}

export async function getBacktestRun(
  id: string
): Promise<BacktestRun | null> {
  const rows = await db
    .select()
    .from(schema.backtestRuns)
    .where(eq(schema.backtestRuns.id, id))
    .limit(1);
  return rows.length > 0 ? rowToRun(rows[0]) : null;
}

// ─── Helpers ─────────────────────────────────────────────────

function buildSnapshotFromCandles(
  candles: OHLCV[],
  instrument: Instrument
): MarketSnapshot {
  const last = candles[candles.length - 1];
  const price = last.close;

  const quote: MarketQuote = {
    instrument,
    lastPrice: price,
    bidPrice: price - 0.25,
    bidSize: 10,
    askPrice: price + 0.25,
    askSize: 10,
    spread: 0.5,
    lastSize: 1,
    volume: candles.reduce((sum, c) => sum + c.volume, 0),
    timestamp: last.timestamp,
    receivedAt: last.timestamp,
  };

  const levels = computeSessionLevels(candles);

  const health: FeedHealth = {
    status: "live",
    latencyMs: 0,
    lastUpdateAt: last.timestamp,
    uptimeSince: null,
    tickCount: 0,
  };

  return {
    quote,
    levels,
    health,
    recentCandles: candles,
    streamLog: [],
  };
}

function rowToRun(row: schema.BacktestRunRow): BacktestRun {
  return {
    id: row.id,
    config: JSON.parse(row.config),
    status: row.status as BacktestRun["status"],
    progress: row.progress,
    signals: JSON.parse(row.signals),
    results: row.results ? JSON.parse(row.results) : null,
    error: row.error,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    strategyName: row.strategyName,
    promptName: row.promptName,
  };
}

function toBacktestRun(
  id: string,
  config: BacktestConfig,
  status: BacktestRun["status"],
  progress: number,
  signals: BacktestSignal[],
  results: BacktestRun["results"],
  error: string | null,
  startedAt: string,
  completedAt: string | null,
  strategyName: string,
  promptName: string
): BacktestRun {
  return {
    id,
    config,
    status,
    progress,
    signals,
    results,
    error,
    startedAt,
    completedAt,
    strategyName,
    promptName,
  };
}
