import type {
  RawQuote,
  RawOHLCV,
  MarketQuote,
  OHLCV,
  Instrument,
} from "@/types/market";

/**
 * Normalizes raw provider data into internal format.
 * This layer isolates the rest of the system from provider-specific quirks.
 * Validates that prices are finite positive numbers.
 */
export function normalizeQuote(
  raw: RawQuote,
  instrument: Instrument
): MarketQuote {
  return {
    instrument,
    lastPrice: safePrice(raw.lastPrice),
    bidPrice: safePrice(raw.bidPrice),
    bidSize: Math.max(0, raw.bidSize ?? 0),
    askPrice: safePrice(raw.askPrice),
    askSize: Math.max(0, raw.askSize ?? 0),
    spread: round(Math.abs(safePrice(raw.askPrice) - safePrice(raw.bidPrice))),
    lastSize: Math.max(0, raw.lastSize ?? 0),
    volume: Math.max(0, raw.volume ?? 0),
    timestamp: raw.timestamp,
    receivedAt: new Date().toISOString(),
  };
}

export function normalizeCandles(raws: RawOHLCV[]): OHLCV[] {
  return raws
    .filter((r) => isValidCandle(r))
    .map((r) => ({
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      volume: Math.max(0, r.volume ?? 0),
      timestamp: r.timestamp,
    }));
}

/** Ensure price is a finite positive number */
function safePrice(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/** Validate OHLCV candle has reasonable values */
function isValidCandle(c: RawOHLCV): boolean {
  return (
    Number.isFinite(c.open) &&
    Number.isFinite(c.high) &&
    Number.isFinite(c.low) &&
    Number.isFinite(c.close) &&
    c.open > 0 &&
    c.high >= c.low &&
    c.high > 0
  );
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
