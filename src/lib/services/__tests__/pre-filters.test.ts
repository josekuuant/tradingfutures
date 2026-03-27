import { describe, it, expect } from "vitest";
import { runPreFilters } from "../engine/pre-filters";
import type { MarketSnapshot, MarketQuote, SessionLevels, OHLCV } from "@/types/market";
import type { Strategy } from "@/types/strategy";
import type { Signal } from "@/types/signal";
import { DEFAULT_ENGINE_CONFIG, type EngineConfig } from "@/types/engine";

// ─── Helpers ─────────────────────────────────────────────────

function makeQuote(overrides: Partial<MarketQuote> = {}): MarketQuote {
  return {
    instrument: "NQ",
    lastPrice: 19850,
    bidPrice: 19849.75,
    bidSize: 10,
    askPrice: 19850.25,
    askSize: 10,
    spread: 0.5,
    lastSize: 1,
    volume: 250000,
    timestamp: new Date().toISOString(),
    receivedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeLevels(overrides: Partial<SessionLevels> = {}): SessionLevels {
  return {
    sessionHigh: 19900,
    sessionLow: 19800,
    overnightHigh: 19880,
    overnightLow: 19820,
    previousDayHigh: 19870,
    previousDayLow: 19810,
    previousDayClose: 19845,
    vwap: 19850,
    openingRangeHigh: 19860,
    openingRangeLow: 19840,
    ...overrides,
  };
}

function makeCandles(count: number, basePrice = 19800): OHLCV[] {
  return Array.from({ length: count }, (_, i) => ({
    open: basePrice + i * 2,
    high: basePrice + i * 2 + 10,
    low: basePrice + i * 2 - 5,
    close: basePrice + i * 2 + 5,
    volume: 1000 + Math.floor(Math.random() * 500),
    timestamp: new Date(Date.now() - (count - i) * 300_000).toISOString(),
  }));
}

function makeSnapshot(overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return {
    quote: makeQuote(),
    levels: makeLevels(),
    health: { status: "live", latencyMs: 5, lastUpdateAt: new Date().toISOString(), uptimeSince: null, tickCount: 100 },
    recentCandles: makeCandles(50),
    streamLog: [],
    ...overrides,
  };
}

function makeStrategy(overrides: Partial<Strategy> = {}): Strategy {
  return {
    id: "strat-1",
    name: "Test Strategy",
    description: "",
    tag: "",
    instrument: "NQ",
    timeframes: ["5m"],
    contextConditions: "",
    entryConditions: "",
    invalidation: "",
    tp1: "",
    tp2: "",
    minRR: 2,
    volatilityFilter: "",
    volumeFilter: "",
    scheduleFilter: "",
    newsFilter: "",
    noTradeRules: "",
    promptTemplate: "",
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeSignal(action: "BUY" | "SELL" | "NO_TRADE", instrument = "NQ"): Signal {
  return {
    id: crypto.randomUUID(),
    strategyId: "s1",
    strategyName: "Test",
    promptId: "p1",
    promptName: "Test",
    action,
    confidence: 0.8,
    reasoning: "test",
    entryPrice: 19850,
    stopLoss: 19820,
    takeProfit: 19900,
    riskRewardRatio: 1.67,
    invalidation: "",
    marketContext: "",
    instrument,
    timeframe: "5m",
    currentPrice: 19850,
    claudeModel: "test",
    systemPromptSent: "",
    userPromptSent: "",
    rawResponse: "",
    durationMs: 100,
    createdAt: new Date().toISOString(),
  };
}

// ─── Tests ───────────────────────────────────────────────────

describe("runPreFilters", () => {
  const config: EngineConfig = {
    ...DEFAULT_ENGINE_CONFIG,
    tradingHoursET: [0, 24], // Always in hours for testing
  };

  it("passes with good market conditions", () => {
    const report = runPreFilters(
      makeSnapshot(),
      makeStrategy(),
      [],
      config,
      null
    );
    expect(report.passed).toBe(true);
    expect(report.results.length).toBe(9);
  });

  it("fails cooldown if run too recently", () => {
    const lastRunAt = new Date(Date.now() - 30_000).toISOString(); // 30s ago
    const report = runPreFilters(
      makeSnapshot(),
      makeStrategy(),
      [],
      { ...config, cooldownSeconds: 120 },
      lastRunAt
    );
    const cooldown = report.results.find((r) => r.filter === "cooldown");
    expect(cooldown?.verdict).toBe("skip");
  });

  it("passes cooldown if enough time elapsed", () => {
    const lastRunAt = new Date(Date.now() - 300_000).toISOString(); // 5min ago
    const report = runPreFilters(
      makeSnapshot(),
      makeStrategy(),
      [],
      { ...config, cooldownSeconds: 120 },
      lastRunAt
    );
    const cooldown = report.results.find((r) => r.filter === "cooldown");
    expect(cooldown?.verdict).toBe("pass");
  });

  // ─── B7: Dedup by instrument ─────────────────────────────

  it("detects duplicate signals for same instrument", () => {
    const signals = [
      makeSignal("BUY", "NQ"),
      makeSignal("BUY", "NQ"),
      makeSignal("BUY", "NQ"),
    ];
    const report = runPreFilters(
      makeSnapshot(),
      makeStrategy(),
      signals,
      { ...config, maxConsecutiveSameSignal: 3 },
      null
    );
    const dedup = report.results.find((r) => r.filter === "duplicate_signal");
    expect(dedup?.verdict).toBe("skip");
  });

  it("does not flag duplicates across different instruments", () => {
    const signals = [
      makeSignal("BUY", "MNQ"),
      makeSignal("BUY", "MNQ"),
      makeSignal("BUY", "MNQ"),
    ];
    // Snapshot is NQ, signals are MNQ → should pass
    const report = runPreFilters(
      makeSnapshot(),
      makeStrategy(),
      signals,
      { ...config, maxConsecutiveSameSignal: 3 },
      null
    );
    const dedup = report.results.find((r) => r.filter === "duplicate_signal");
    expect(dedup?.verdict).toBe("pass");
  });

  it("passes dedup with varied signals", () => {
    const signals = [
      makeSignal("BUY", "NQ"),
      makeSignal("SELL", "NQ"),
      makeSignal("BUY", "NQ"),
    ];
    const report = runPreFilters(
      makeSnapshot(),
      makeStrategy(),
      signals,
      { ...config, maxConsecutiveSameSignal: 3 },
      null
    );
    const dedup = report.results.find((r) => r.filter === "duplicate_signal");
    expect(dedup?.verdict).toBe("pass");
  });

  // ─── Volatility ──────────────────────────────────────────

  it("skips on low volatility", () => {
    // Candles with very small range
    const flatCandles = Array.from({ length: 20 }, (_, i) => ({
      open: 19850,
      high: 19851,
      low: 19849,
      close: 19850,
      volume: 1000,
      timestamp: new Date(Date.now() - (20 - i) * 300_000).toISOString(),
    }));

    const report = runPreFilters(
      makeSnapshot({ recentCandles: flatCandles }),
      makeStrategy(),
      [],
      { ...config, minVolatilityPoints: 5 },
      null
    );
    const vol = report.results.find((r) => r.filter === "volatility");
    expect(vol?.verdict).toBe("skip");
  });

  // ─── Level proximity ────────────────────────────────────

  it("passes when price near VWAP", () => {
    const snapshot = makeSnapshot({
      quote: makeQuote({ lastPrice: 19850 }),
      levels: makeLevels({ vwap: 19850 }),
    });
    const report = runPreFilters(snapshot, makeStrategy(), [], config, null);
    const prox = report.results.find((r) => r.filter === "level_proximity");
    expect(prox?.verdict).toBe("pass");
  });
});
