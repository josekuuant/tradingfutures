// ─── Polymarket backtest config ──────────────────────────────

export interface PolyBacktestConfig {
  strategyId: string;
  promptId: string;
  marketId: string;        // Polymarket market slug or condition ID
  tokenId: string;         // CLOB token ID (YES token)
  marketQuestion: string;  // Human-readable market title
  initialCapital: number;
  positionSizePercent: number; // % of capital per trade (e.g. 10)
  entryThreshold: number;  // buy YES below this price (e.g. 0.35)
  exitThreshold: number;   // sell YES above this price (e.g. 0.70)
  stopLoss: number;        // sell if price drops below this (e.g. 0.15)
}

// ─── Price data point ────────────────────────────────────────

export interface PolyPricePoint {
  timestamp: number; // unix seconds
  price: number;     // 0-1
}

// ─── Backtest signal for prediction markets ──────────────────

export interface PolyBacktestSignal {
  index: number;
  timestamp: string;
  action: "BUY_YES" | "SELL_YES" | "HOLD" | "NO_TRADE";
  confidence: number;
  reasoning: string;
  price: number;           // price at decision point
  positionSize: number;    // shares bought/sold
  costBasis: number;       // $ spent
  // Outcome
  outcome: "profit" | "loss" | "pending" | "no_trade";
  exitPrice: number | null;
  pnl: number;
}

// ─── Backtest results ────────────────────────────────────────

export interface PolyBacktestResults {
  totalSignals: number;
  trades: number;
  wins: number;
  losses: number;
  pending: number;
  noTrades: number;
  winRate: number | null;
  // Capital
  initialCapital: number;
  finalCapital: number;
  netProfit: number;
  netProfitPercent: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  // Per-trade stats
  avgWin: number;
  avgLoss: number;
  bestTrade: number;
  worstTrade: number;
  profitFactor: number | null;
  // Equity curve
  equityCurve: Array<{ index: number; equity: number; timestamp: string }>;
  // Signals
  signals: PolyBacktestSignal[];
  disclaimers: string[];
}

// ─── Full run ────────────────────────────────────────────────

export interface PolyBacktestRun {
  id: string;
  config: PolyBacktestConfig;
  status: "pending" | "running" | "completed" | "failed";
  results: PolyBacktestResults | null;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}
