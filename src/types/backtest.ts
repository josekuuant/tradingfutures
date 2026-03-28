import type { SignalAction } from "./signal";

// ─── Backtest config ─────────────────────────────────────────

export interface BacktestConfig {
  strategyId: string;
  promptId: string;
  instrument: string;
  timeframe: string;
  candleCount: number;
  windowSize: number;
  stepSize: number;
  // Capital simulation
  initialCapital: number;    // starting balance (e.g. 50000)
  contractSize: number;      // contracts per trade (e.g. 1)
  pointValue: number;        // $ per point per contract (NQ=20, MNQ=2)
  commissionPerTrade: number; // round-trip commission (e.g. 4.50)
}

// ─── Backtest signal (one analysis point) ────────────────────

export interface BacktestSignal {
  index: number;
  timestamp: string;
  action: SignalAction;
  confidence: number;
  reasoning: string;
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  riskRewardRatio: number | null;
  currentPrice: number;
  // Outcome tracking (simple: did price reach TP or SL first?)
  outcome: "win" | "loss" | "pending" | "no_trade";
  outcomePrice: number | null;
}

// ─── Backtest results (aggregated) ───────────────────────────

export interface BacktestResults {
  totalSignals: number;
  buyCount: number;
  sellCount: number;
  noTradeCount: number;
  tradeCount: number;
  wins: number;
  losses: number;
  pending: number;
  winRate: number | null;
  avgConfidence: number;
  avgRR: number | null;
  profitFactor: number | null;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  // Capital simulation
  initialCapital: number;
  finalCapital: number;
  totalPnL: number;
  totalPnLPercent: number;
  totalCommissions: number;
  netProfit: number;
  netProfitPercent: number;
  maxDrawdown: number;         // max peak-to-trough in $
  maxDrawdownPercent: number;  // max peak-to-trough in %
  maxDailyDrawdown: number;    // worst single-day loss in $
  maxDailyDrawdownPercent: number;
  // Equity curve for chart
  equityCurve: EquityPoint[];
  // Funding firm compatibility
  fundingMetrics: FundingMetrics;
  disclaimers: string[];
}

export interface EquityPoint {
  tradeIndex: number;
  timestamp: string;
  equity: number;
  pnl: number;         // cumulative PnL
  drawdown: number;    // current drawdown from peak
}

export interface FundingMetrics {
  /** Would pass a typical 50k eval? (max DD < 2500, daily DD < 1250) */
  passes50kEval: boolean;
  /** Would pass a typical 100k eval? (max DD < 3000, daily DD < 1500) */
  passes100kEval: boolean;
  /** Would pass a typical 150k eval? (max DD < 4500, daily DD < 2250) */
  passes150kEval: boolean;
  /** Days with trades */
  tradingDays: number;
  /** Profitable days */
  profitableDays: number;
  /** Consistency score: % of profit that comes from best day (lower = better) */
  consistencyScore: number;
  /** Average daily PnL */
  avgDailyPnL: number;
}

// ─── Full backtest run ───────────────────────────────────────

export type BacktestStatus = "pending" | "running" | "completed" | "failed";

export interface BacktestRun {
  id: string;
  config: BacktestConfig;
  status: BacktestStatus;
  progress: number; // 0-100
  signals: BacktestSignal[];
  results: BacktestResults | null;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
  strategyName: string;
  promptName: string;
}
