import type { BacktestSignal, BacktestResults } from "@/types/backtest";
import type { OHLCV } from "@/types/market";

/**
 * Calculate backtest results from signals.
 * Uses future candles to determine simple win/loss outcomes.
 */
export function calculateResults(
  signals: BacktestSignal[]
): BacktestResults {
  const disclaimers: string[] = [];

  const trades = signals.filter((s) => s.action !== "NO_TRADE");
  const buys = signals.filter((s) => s.action === "BUY");
  const sells = signals.filter((s) => s.action === "SELL");
  const noTrades = signals.filter((s) => s.action === "NO_TRADE");
  const wins = trades.filter((s) => s.outcome === "win");
  const losses = trades.filter((s) => s.outcome === "loss");
  const pending = trades.filter((s) => s.outcome === "pending");

  const winRate =
    trades.length > 0 && pending.length < trades.length
      ? wins.length / (wins.length + losses.length)
      : null;

  const avgConfidence =
    signals.length > 0
      ? signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length
      : 0;

  const rrValues = trades
    .map((s) => s.riskRewardRatio)
    .filter((v): v is number => v != null);
  const avgRR = rrValues.length > 0
    ? rrValues.reduce((a, b) => a + b, 0) / rrValues.length
    : null;

  // Profit factor: sum of wins / sum of losses (using R multiples)
  let profitFactor: number | null = null;
  if (wins.length > 0 && losses.length > 0) {
    const totalWinR = wins
      .map((s) => s.riskRewardRatio ?? 1)
      .reduce((a, b) => a + b, 0);
    const totalLossR = losses.length; // each loss = 1R
    profitFactor =
      totalLossR > 0 ? Math.round((totalWinR / totalLossR) * 100) / 100 : null;
  }

  // Consecutive streaks
  let maxConsecutiveWins = 0;
  let maxConsecutiveLosses = 0;
  let currentWins = 0;
  let currentLosses = 0;
  for (const s of trades) {
    if (s.outcome === "win") {
      currentWins++;
      currentLosses = 0;
      maxConsecutiveWins = Math.max(maxConsecutiveWins, currentWins);
    } else if (s.outcome === "loss") {
      currentLosses++;
      currentWins = 0;
      maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentLosses);
    }
  }

  // Disclaimers
  disclaimers.push("Results use mock data — not real historical prices");
  if (pending.length > 0) {
    disclaimers.push(
      `${pending.length} trades have no outcome (insufficient future data)`
    );
  }
  if (trades.length < 10) {
    disclaimers.push("Small sample size — results are not statistically significant");
  }
  disclaimers.push("Slippage, commissions, and execution delays not modeled");

  return {
    totalSignals: signals.length,
    buyCount: buys.length,
    sellCount: sells.length,
    noTradeCount: noTrades.length,
    tradeCount: trades.length,
    wins: wins.length,
    losses: losses.length,
    pending: pending.length,
    winRate,
    avgConfidence,
    avgRR,
    profitFactor,
    maxConsecutiveWins,
    maxConsecutiveLosses,
    disclaimers,
  };
}

/**
 * Determine outcome of a signal by looking at future candles.
 * Simple: did price hit TP or SL first?
 */
export function determineOutcome(
  signal: BacktestSignal,
  futureCandles: OHLCV[]
): { outcome: BacktestSignal["outcome"]; outcomePrice: number | null } {
  if (signal.action === "NO_TRADE") {
    return { outcome: "no_trade", outcomePrice: null };
  }

  const tp = signal.takeProfit;
  const sl = signal.stopLoss;

  if (tp == null || sl == null) {
    return { outcome: "pending", outcomePrice: null };
  }

  for (const candle of futureCandles) {
    if (signal.action === "BUY") {
      if (candle.low <= sl) return { outcome: "loss", outcomePrice: sl };
      if (candle.high >= tp) return { outcome: "win", outcomePrice: tp };
    } else {
      // SELL
      if (candle.high >= sl) return { outcome: "loss", outcomePrice: sl };
      if (candle.low <= tp) return { outcome: "win", outcomePrice: tp };
    }
  }

  return { outcome: "pending", outcomePrice: null };
}
