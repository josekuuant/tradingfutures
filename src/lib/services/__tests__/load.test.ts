import { describe, it, expect } from "vitest";

/**
 * Load / stress tests for critical backend services.
 * Tests throughput, concurrency, and memory stability.
 */

// ─── Helpers ─────────────────────────────────────────────────

function measure(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

async function measureAsync(fn: () => Promise<void>): Promise<number> {
  const start = performance.now();
  await fn();
  return performance.now() - start;
}

// ─── Rate Limiter Load Test ──────────────────────────────────

describe("Rate Limiter — throughput", () => {
  it("handles 10,000 checkRateLimit calls in < 100ms", async () => {
    // Dynamic import to avoid module cache issues
    const { checkRateLimit, recordEvent } = await import("@/lib/rate-limiter");

    const ms = measure(() => {
      for (let i = 0; i < 10_000; i++) {
        checkRateLimit(`load-test-${i % 100}`, 1000);
      }
    });

    console.log(`Rate limiter: 10,000 checks in ${ms.toFixed(1)}ms`);
    expect(ms).toBeLessThan(100);
  });

  it("handles 5,000 recordEvent calls in < 50ms", async () => {
    const { recordEvent } = await import("@/lib/rate-limiter");

    const ms = measure(() => {
      for (let i = 0; i < 5_000; i++) {
        recordEvent(`load-event-${i % 50}`);
      }
    });

    console.log(`Rate limiter: 5,000 records in ${ms.toFixed(1)}ms`);
    expect(ms).toBeLessThan(50);
  });
});

// ─── Logger Load Test ────────────────────────────────────────

describe("Logger — throughput", () => {
  it("handles 5,000 log entries in < 100ms (ring buffer)", async () => {
    const { log } = await import("@/lib/logger");

    const ms = measure(() => {
      for (let i = 0; i < 5_000; i++) {
        log.engine.info(`Load test message ${i}`, { iteration: i });
      }
    });

    console.log(`Logger: 5,000 entries in ${ms.toFixed(1)}ms`);
    expect(ms).toBeLessThan(100);
  });

  it("queryLogs with search on 500-entry buffer in < 10ms", async () => {
    const { queryLogs } = await import("@/lib/logger");

    const ms = measure(() => {
      for (let i = 0; i < 100; i++) {
        queryLogs({ search: "Load test", limit: 50 });
      }
    });

    console.log(`Logger: 100 queries in ${ms.toFixed(1)}ms`);
    expect(ms).toBeLessThan(10);
  });
});

// ─── Guardrails Load Test ────────────────────────────────────

describe("Guardrails — throughput", () => {
  it("runs 1,000 full guardrail checks in < 50ms", async () => {
    const { runGuardrails } = await import("../execution/guardrails");
    const { DEFAULT_GUARDRAILS } = await import("@/types/execution");

    const request = {
      instrument: "NQ",
      side: "buy" as const,
      type: "market" as const,
      quantity: 1,
    };

    const ms = measure(() => {
      for (let i = 0; i < 1_000; i++) {
        runGuardrails(
          { ...request, idempotencyKey: `load-${i}` },
          [],
          [],
          DEFAULT_GUARDRAILS,
          19850
        );
      }
    });

    console.log(`Guardrails: 1,000 full checks in ${ms.toFixed(1)}ms`);
    expect(ms).toBeLessThan(50);
  });
});

// ─── Response Parser Load Test ───────────────────────────────

describe("Response Parser — throughput", () => {
  it("parses 1,000 Claude responses in < 100ms", async () => {
    const { parseClaudeResponse } = await import("../claude/response-parser");

    const validBuy = JSON.stringify({
      action: "BUY",
      confidence: 0.85,
      reasoning: "Strong breakout above VWAP with volume confirmation",
      entry_price: 19850.25,
      stop_loss: 19820.0,
      take_profit: 19910.5,
      risk_reward_ratio: 2.0,
      invalidation: "Break below 19820",
      market_context: "Bullish trend",
    });

    const ms = measure(() => {
      for (let i = 0; i < 1_000; i++) {
        parseClaudeResponse(validBuy, { minConfidence: 0.5 });
      }
    });

    console.log(`Parser: 1,000 responses in ${ms.toFixed(1)}ms`);
    expect(ms).toBeLessThan(100);
  });

  it("parses 500 markdown-wrapped responses in < 50ms", async () => {
    const { parseClaudeResponse } = await import("../claude/response-parser");

    const wrapped = "Here's the analysis:\n```json\n" + JSON.stringify({
      signal: "NO_TRADE",
      confidence: 45,
      reasoning: ["Choppy price action", "No clear direction", "VWAP flat"],
      entry_zone: { min: null, max: null },
      stop_loss: null,
      take_profit_1: null,
      take_profit_2: null,
      risk_reward_estimate: "insufficient",
      invalidation_condition: "N/A",
      market_state: "low_quality_chop",
      bias: "NEUTRAL",
      setup_type: "no_valid_setup",
      warning: "",
    }) + "\n```\n";

    const ms = measure(() => {
      for (let i = 0; i < 500; i++) {
        parseClaudeResponse(wrapped, { minConfidence: 0.5 });
      }
    });

    console.log(`Parser: 500 markdown-wrapped in ${ms.toFixed(1)}ms`);
    expect(ms).toBeLessThan(50);
  });
});

// ─── Pre-Filters Load Test ───────────────────────────────────

describe("Pre-Filters — throughput", () => {
  it("runs 500 full pre-filter evaluations in < 100ms", async () => {
    const { runPreFilters } = await import("../engine/pre-filters");
    const { DEFAULT_ENGINE_CONFIG } = await import("@/types/engine");

    const snapshot = {
      quote: {
        instrument: "NQ" as const,
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
      },
      levels: {
        sessionHigh: 19900, sessionLow: 19800,
        overnightHigh: 19880, overnightLow: 19820,
        previousDayHigh: 19870, previousDayLow: 19810, previousDayClose: 19845,
        vwap: 19850, openingRangeHigh: 19860, openingRangeLow: 19840,
      },
      health: { status: "live" as const, latencyMs: 5, lastUpdateAt: new Date().toISOString(), uptimeSince: null, tickCount: 100 },
      recentCandles: Array.from({ length: 50 }, (_, i) => ({
        open: 19840 + i, high: 19850 + i, low: 19830 + i, close: 19845 + i,
        volume: 1000, timestamp: new Date(Date.now() - (50 - i) * 300000).toISOString(),
      })),
      streamLog: [],
    };

    const strategy = {
      id: "s1", name: "Test", description: "", tag: "", instrument: "NQ" as const,
      timeframes: ["5m" as const], contextConditions: "", entryConditions: "",
      invalidation: "", tp1: "", tp2: "", minRR: 2, volatilityFilter: "",
      volumeFilter: "", scheduleFilter: "", newsFilter: "", noTradeRules: "",
      promptTemplate: "", isActive: true,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };

    const config = { ...DEFAULT_ENGINE_CONFIG, tradingHoursET: [0, 24] as [number, number] };

    const ms = measure(() => {
      for (let i = 0; i < 500; i++) {
        runPreFilters(snapshot, strategy, [], config, null);
      }
    });

    console.log(`Pre-filters: 500 evaluations in ${ms.toFixed(1)}ms`);
    expect(ms).toBeLessThan(100);
  });
});

// ─── Normalizer Load Test ────────────────────────────────────

describe("Normalizer — throughput", () => {
  it("normalizes 10,000 candles in < 50ms", async () => {
    const { normalizeCandles } = await import("../market/normalizer");

    const rawCandles = Array.from({ length: 10_000 }, (_, i) => ({
      open: 19840 + Math.random() * 20,
      high: 19860 + Math.random() * 10,
      low: 19830 + Math.random() * 10,
      close: 19845 + Math.random() * 15,
      volume: 1000 + Math.floor(Math.random() * 5000),
      timestamp: new Date(Date.now() - i * 60000).toISOString(),
    }));

    const ms = measure(() => {
      normalizeCandles(rawCandles);
    });

    console.log(`Normalizer: 10,000 candles in ${ms.toFixed(1)}ms`);
    expect(ms).toBeLessThan(50);
  });
});

// ─── Derived Metrics Load Test ───────────────────────────────

describe("Derived Metrics — throughput", () => {
  it("computes session levels from 500 candles in < 10ms", async () => {
    const { computeSessionLevels } = await import("../market/derived-metrics");

    const candles = Array.from({ length: 500 }, (_, i) => ({
      open: 19840 + i * 0.1,
      high: 19860 + i * 0.1,
      low: 19830 + i * 0.1,
      close: 19845 + i * 0.1,
      volume: 1000,
      timestamp: new Date(Date.now() - (500 - i) * 60000).toISOString(),
    }));

    const ms = measure(() => {
      for (let i = 0; i < 100; i++) {
        computeSessionLevels(candles);
      }
    });

    console.log(`Derived metrics: 100 computations (500 candles each) in ${ms.toFixed(1)}ms`);
    // 500 candles × 100 iterations = 50,000 date parses — allow up to 500ms
    expect(ms).toBeLessThan(500);
  });
});

// ─── Concurrent Guardrails Stress Test ───────────────────────

describe("Concurrency stress", () => {
  it("handles 100 concurrent guardrail checks without race conditions", async () => {
    const { runGuardrails } = await import("../execution/guardrails");
    const { DEFAULT_GUARDRAILS } = await import("@/types/execution");

    const promises = Array.from({ length: 100 }, (_, i) => {
      return new Promise<boolean>((resolve) => {
        const result = runGuardrails(
          { instrument: "NQ", side: "buy", type: "market", quantity: 1, idempotencyKey: `concurrent-${i}` },
          [],
          [],
          DEFAULT_GUARDRAILS,
          19850
        );
        resolve(result.passed);
      });
    });

    const ms = await measureAsync(async () => {
      const results = await Promise.all(promises);
      // All should pass (no shared state conflicts)
      expect(results.every((r) => r === true)).toBe(true);
    });

    console.log(`Concurrency: 100 parallel guardrail checks in ${ms.toFixed(1)}ms`);
    expect(ms).toBeLessThan(50);
  });
});
