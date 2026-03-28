import type {
  BacktestSignal,
  BacktestResults,
  BacktestConfig,
  EquityPoint,
  FundingMetrics,
} from "@/types/backtest";
import type { OHLCV } from "@/types/market";

/**
 * Calculate backtest results with full capital simulation.
 * Tracks equity curve, drawdowns, daily PnL, and funding firm metrics.
 */
export function calculateResults(
  signals: BacktestSignal[],
  config?: Partial<BacktestConfig>
): BacktestResults {
  const initialCapital = config?.initialCapital ?? 50000;
  const contractSize = config?.contractSize ?? 1;
  const pointValue = config?.pointValue ?? 20; // NQ = $20/pt, MNQ = $2/pt
  const commissionPerTrade = config?.commissionPerTrade ?? 4.5;
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
  const avgRR =
    rrValues.length > 0
      ? rrValues.reduce((a, b) => a + b, 0) / rrValues.length
      : null;

  // Profit factor
  let profitFactor: number | null = null;
  if (wins.length > 0 && losses.length > 0) {
    const totalWinR = wins
      .map((s) => s.riskRewardRatio ?? 1)
      .reduce((a, b) => a + b, 0);
    const totalLossR = losses.length;
    profitFactor =
      totalLossR > 0
        ? Math.round((totalWinR / totalLossR) * 100) / 100
        : null;
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

  // ─── Capital simulation ────────────────────────────────────
  let equity = initialCapital;
  let peak = initialCapital;
  let maxDrawdown = 0;
  let maxDrawdownPercent = 0;
  let totalCommissions = 0;
  let totalPnL = 0;

  const equityCurve: EquityPoint[] = [
    { tradeIndex: 0, timestamp: trades[0]?.timestamp ?? "", equity: initialCapital, pnl: 0, drawdown: 0 },
  ];

  // Daily PnL tracking
  const dailyPnL = new Map<string, number>();

  for (let i = 0; i < trades.length; i++) {
    const t = trades[i];
    if (t.outcome === "pending" || t.outcome === "no_trade") continue;

    let tradePnL = 0;
    if (t.entryPrice != null && t.outcomePrice != null) {
      const points = t.action === "BUY"
        ? t.outcomePrice - t.entryPrice
        : t.entryPrice - t.outcomePrice;
      tradePnL = points * pointValue * contractSize;
    }

    // Apply commission
    totalCommissions += commissionPerTrade;
    tradePnL -= commissionPerTrade;
    totalPnL += tradePnL;
    equity += tradePnL;

    // Track peak and drawdown
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    const ddPct = peak > 0 ? (dd / peak) * 100 : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;
    if (ddPct > maxDrawdownPercent) maxDrawdownPercent = ddPct;

    // Track daily PnL
    const day = t.timestamp.slice(0, 10);
    dailyPnL.set(day, (dailyPnL.get(day) ?? 0) + tradePnL);

    equityCurve.push({
      tradeIndex: i + 1,
      timestamp: t.timestamp,
      equity: Math.round(equity * 100) / 100,
      pnl: Math.round(totalPnL * 100) / 100,
      drawdown: Math.round(dd * 100) / 100,
    });
  }

  // Max daily drawdown
  let maxDailyDrawdown = 0;
  for (const dayPnl of dailyPnL.values()) {
    if (dayPnl < -maxDailyDrawdown) maxDailyDrawdown = Math.abs(dayPnl);
  }
  const maxDailyDrawdownPercent =
    initialCapital > 0 ? (maxDailyDrawdown / initialCapital) * 100 : 0;

  // Daily stats
  const days = Array.from(dailyPnL.entries());
  const profitableDays = days.filter(([, pnl]) => pnl > 0).length;
  const tradingDays = days.length;
  const totalDailyPnL = days.reduce((sum, [, pnl]) => sum + pnl, 0);
  const avgDailyPnL = tradingDays > 0 ? totalDailyPnL / tradingDays : 0;

  // Consistency score: what % of total profit came from the best day
  const bestDayPnL = Math.max(...days.map(([, pnl]) => pnl), 0);
  const totalProfit = days
    .filter(([, pnl]) => pnl > 0)
    .reduce((sum, [, pnl]) => sum + pnl, 0);
  const consistencyScore =
    totalProfit > 0 ? Math.round((bestDayPnL / totalProfit) * 100) : 0;

  // ─── Funding firm metrics ──────────────────────────────────
  const fundingMetrics: FundingMetrics = {
    passes50kEval: maxDrawdown <= 2500 && maxDailyDrawdown <= 1250 && totalPnL > 0,
    passes100kEval: maxDrawdown <= 3000 && maxDailyDrawdown <= 1500 && totalPnL > 0,
    passes150kEval: maxDrawdown <= 4500 && maxDailyDrawdown <= 2250 && totalPnL > 0,
    tradingDays,
    profitableDays,
    consistencyScore,
    avgDailyPnL: Math.round(avgDailyPnL * 100) / 100,
  };

  // Disclaimers
  disclaimers.push("Results use mock data — not real historical prices");
  if (pending.length > 0) {
    disclaimers.push(
      `${pending.length} trades have no outcome (insufficient future data)`
    );
  }
  if (trades.length < 10) {
    disclaimers.push(
      "Small sample size — results are not statistically significant"
    );
  }
  disclaimers.push("Slippage, commissions, and execution delays may differ from real trading");

  const finalCapital = Math.round(equity * 100) / 100;
  const netProfit = Math.round((equity - initialCapital) * 100) / 100;

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
    // Capital
    initialCapital,
    finalCapital,
    totalPnL: Math.round(totalPnL * 100) / 100,
    totalPnLPercent:
      initialCapital > 0
        ? Math.round((totalPnL / initialCapital) * 10000) / 100
        : 0,
    totalCommissions: Math.round(totalCommissions * 100) / 100,
    netProfit,
    netProfitPercent:
      initialCapital > 0
        ? Math.round((netProfit / initialCapital) * 10000) / 100
        : 0,
    maxDrawdown: Math.round(maxDrawdown * 100) / 100,
    maxDrawdownPercent: Math.round(maxDrawdownPercent * 100) / 100,
    maxDailyDrawdown: Math.round(maxDailyDrawdown * 100) / 100,
    maxDailyDrawdownPercent: Math.round(maxDailyDrawdownPercent * 100) / 100,
    equityCurve,
    fundingMetrics,
    disclaimers,
  };
}

/**
 * Determine outcome of a signal by looking at future candles.
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
      if (candle.high >= sl) return { outcome: "loss", outcomePrice: sl };
      if (candle.low <= tp) return { outcome: "win", outcomePrice: tp };
    }
  }

  return { outcome: "pending", outcomePrice: null };
}
