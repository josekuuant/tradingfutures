import type { SignalAction } from "./signal";

// ─── Backtest config ─────────────────────────────────────────

export interface BacktestConfig {
  strategyId: string;
  promptId: string;
  instrument: string;
  timeframe: string;
  candleCount: number; // how many candles to replay
  windowSize: number;  // candles per analysis window
  stepSize: number;    // candles to advance between analyses
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
  tradeCount: number; // buy + sell
  wins: number;
  losses: number;
  pending: number;
  winRate: number | null;       // null if no trades
  avgConfidence: number;
  avgRR: number | null;         // null if no RR data
  profitFactor: number | null;  // null if insufficient data
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  // Disclaimers
  disclaimers: string[];
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
