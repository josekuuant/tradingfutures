// ─── Core Market Data Types (single source of truth) ─────────

export const INSTRUMENTS = ["NQ", "MNQ"] as const;
export type Instrument = (typeof INSTRUMENTS)[number];

export const TIMEFRAMES = ["1m", "5m", "15m", "1h", "1D"] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];
export type FeedStatus = "live" | "delayed" | "stale" | "disconnected";

// ─── Raw data (from provider) ────────────────────────────────

export interface RawQuote {
  symbol: string;
  bidPrice: number;
  bidSize: number;
  askPrice: number;
  askSize: number;
  lastPrice: number;
  lastSize: number;
  volume: number;
  timestamp: string; // ISO 8601
}

export interface RawOHLCV {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: string;
}

// ─── Normalized data (internal) ──────────────────────────────

export interface MarketQuote {
  instrument: Instrument;
  lastPrice: number;
  bidPrice: number;
  bidSize: number;
  askPrice: number;
  askSize: number;
  spread: number;
  lastSize: number;
  volume: number;
  timestamp: string;
  receivedAt: string;
}

export interface OHLCV {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: string;
}

// ─── Derived metrics ─────────────────────────────────────────

export interface SessionLevels {
  sessionHigh: number | null;
  sessionLow: number | null;
  overnightHigh: number | null;
  overnightLow: number | null;
  previousDayHigh: number | null;
  previousDayLow: number | null;
  previousDayClose: number | null;
  vwap: number | null;
  openingRangeHigh: number | null;
  openingRangeLow: number | null;
}

export interface FeedHealth {
  status: FeedStatus;
  latencyMs: number | null;
  lastUpdateAt: string | null;
  uptimeSince: string | null;
  tickCount: number;
}

// ─── Combined snapshot ───────────────────────────────────────

export interface MarketSnapshot {
  quote: MarketQuote;
  levels: SessionLevels;
  health: FeedHealth;
  recentCandles: OHLCV[];
  streamLog: StreamEntry[];
}

export interface StreamEntry {
  id: string;
  type: "quote" | "trade" | "candle" | "status";
  message: string;
  timestamp: string;
}

// ─── Provider adapter interface ──────────────────────────────

export interface MarketDataAdapter {
  readonly name: string;

  /** Get the latest quote for an instrument */
  getQuote(instrument: Instrument): Promise<RawQuote>;

  /** Get historical candles */
  getCandles(
    instrument: Instrument,
    timeframe: Timeframe,
    limit: number
  ): Promise<RawOHLCV[]>;

  /** Check connection health */
  checkHealth(): Promise<{ ok: boolean; latencyMs: number; message: string }>;
}
