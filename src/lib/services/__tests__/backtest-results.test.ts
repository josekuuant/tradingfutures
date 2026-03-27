import { describe, it, expect } from "vitest";
import { calculateResults, determineOutcome } from "../backtest/results-calculator";
import type { BacktestSignal } from "@/types/backtest";
import type { OHLCV } from "@/types/market";

function makeSignal(
  action: "BUY" | "SELL" | "NO_TRADE",
  overrides: Partial<BacktestSignal> = {}
): BacktestSignal {
  return {
    index: 0,
    timestamp: new Date().toISOString(),
    action,
    confidence: 0.8,
    reasoning: "test",
    entryPrice: action !== "NO_TRADE" ? 19850 : null,
    stopLoss: action === "BUY" ? 19820 : action === "SELL" ? 19880 : null,
    takeProfit: action === "BUY" ? 19910 : action === "SELL" ? 19790 : null,
    riskRewardRatio: action !== "NO_TRADE" ? 2.0 : null,
    currentPrice: 19850,
    outcome: "pending",
    outcomePrice: null,
    ...overrides,
  };
}

function makeCandle(high: number, low: number): OHLCV {
  return {
    open: (high + low) / 2,
    high,
    low,
    close: (high + low) / 2,
    volume: 1000,
    timestamp: new Date().toISOString(),
  };
}

// ─── determineOutcome ────────────────────────────────────────

describe("determineOutcome", () => {
  it("returns no_trade for NO_TRADE signals", () => {
    const result = determineOutcome(makeSignal("NO_TRADE"), []);
    expect(result.outcome).toBe("no_trade");
  });

  it("returns pending when no TP or SL", () => {
    const signal = makeSignal("BUY", { takeProfit: null, stopLoss: null });
    const result = determineOutcome(signal, [makeCandle(19860, 19840)]);
    expect(result.outcome).toBe("pending");
  });

  it("returns win when BUY hits TP", () => {
    const signal = makeSignal("BUY"); // TP=19910
    const result = determineOutcome(signal, [
      makeCandle(19870, 19840), // not yet
      makeCandle(19920, 19860), // high >= 19910 → win
    ]);
    expect(result.outcome).toBe("win");
    expect(result.outcomePrice).toBe(19910);
  });

  it("returns loss when BUY hits SL", () => {
    const signal = makeSignal("BUY"); // SL=19820
    const result = determineOutcome(signal, [
      makeCandle(19860, 19810), // low <= 19820 → loss
    ]);
    expect(result.outcome).toBe("loss");
    expect(result.outcomePrice).toBe(19820);
  });

  it("returns win when SELL hits TP", () => {
    const signal = makeSignal("SELL"); // TP=19790
    const result = determineOutcome(signal, [
      makeCandle(19860, 19780), // low <= 19790 → win
    ]);
    expect(result.outcome).toBe("win");
    expect(result.outcomePrice).toBe(19790);
  });

  it("returns loss when SELL hits SL", () => {
    const signal = makeSignal("SELL"); // SL=19880
    const result = determineOutcome(signal, [
      makeCandle(19890, 19840), // high >= 19880 → loss
    ]);
    expect(result.outcome).toBe("loss");
    expect(result.outcomePrice).toBe(19880);
  });

  it("returns pending when neither TP nor SL hit", () => {
    const signal = makeSignal("BUY"); // SL=19820, TP=19910
    const result = determineOutcome(signal, [
      makeCandle(19860, 19830), // neither
      makeCandle(19870, 19835), // neither
    ]);
    expect(result.outcome).toBe("pending");
  });

  it("checks SL before TP on same candle (BUY)", () => {
    const signal = makeSignal("BUY"); // SL=19820, TP=19910
    // Candle where both SL and TP could be hit — SL wins for BUY
    const result = determineOutcome(signal, [
      makeCandle(19920, 19810), // low <= SL → loss first
    ]);
    expect(result.outcome).toBe("loss");
  });
});

// ─── calculateResults ────────────────────────────────────────

describe("calculateResults", () => {
  it("handles empty signals", () => {
    const results = calculateResults([]);
    expect(results.totalSignals).toBe(0);
    expect(results.tradeCount).toBe(0);
    expect(results.winRate).toBeNull();
  });

  it("counts actions correctly", () => {
    const signals = [
      makeSignal("BUY", { outcome: "win" }),
      makeSignal("SELL", { outcome: "loss" }),
      makeSignal("NO_TRADE", { outcome: "no_trade" }),
      makeSignal("BUY", { outcome: "win" }),
    ];
    const results = calculateResults(signals);
    expect(results.totalSignals).toBe(4);
    expect(results.buyCount).toBe(2);
    expect(results.sellCount).toBe(1);
    expect(results.noTradeCount).toBe(1);
    expect(results.tradeCount).toBe(3);
  });

  it("calculates win rate correctly", () => {
    const signals = [
      makeSignal("BUY", { outcome: "win" }),
      makeSignal("BUY", { outcome: "win" }),
      makeSignal("SELL", { outcome: "loss" }),
    ];
    const results = calculateResults(signals);
    expect(results.winRate).toBeCloseTo(0.667, 2);
  });

  it("returns null win rate when all pending", () => {
    const signals = [
      makeSignal("BUY", { outcome: "pending" }),
      makeSignal("SELL", { outcome: "pending" }),
    ];
    const results = calculateResults(signals);
    expect(results.winRate).toBeNull();
  });

  it("calculates profit factor", () => {
    const signals = [
      makeSignal("BUY", { outcome: "win", riskRewardRatio: 3 }),
      makeSignal("BUY", { outcome: "win", riskRewardRatio: 2 }),
      makeSignal("SELL", { outcome: "loss" }), // 1R loss
    ];
    const results = calculateResults(signals);
    // totalWinR = 3 + 2 = 5, totalLossR = 1, PF = 5/1 = 5
    expect(results.profitFactor).toBe(5);
  });

  it("tracks consecutive streaks", () => {
    const signals = [
      makeSignal("BUY", { outcome: "win" }),
      makeSignal("BUY", { outcome: "win" }),
      makeSignal("BUY", { outcome: "win" }),
      makeSignal("SELL", { outcome: "loss" }),
      makeSignal("SELL", { outcome: "loss" }),
    ];
    const results = calculateResults(signals);
    expect(results.maxConsecutiveWins).toBe(3);
    expect(results.maxConsecutiveLosses).toBe(2);
  });

  it("includes disclaimers", () => {
    const results = calculateResults([makeSignal("BUY", { outcome: "win" })]);
    expect(results.disclaimers.length).toBeGreaterThan(0);
    expect(results.disclaimers.some((d) => d.includes("mock data"))).toBe(true);
    expect(results.disclaimers.some((d) => d.includes("Small sample"))).toBe(true);
  });
});
