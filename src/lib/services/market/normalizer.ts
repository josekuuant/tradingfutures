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
 */
export function normalizeQuote(
  raw: RawQuote,
  instrument: Instrument
): MarketQuote {
  return {
    instrument,
    lastPrice: raw.lastPrice,
    bidPrice: raw.bidPrice,
    bidSize: raw.bidSize,
    askPrice: raw.askPrice,
    askSize: raw.askSize,
    spread: round(raw.askPrice - raw.bidPrice),
    lastSize: raw.lastSize,
    volume: raw.volume,
    timestamp: raw.timestamp,
    receivedAt: new Date().toISOString(),
  };
}

export function normalizeCandles(raws: RawOHLCV[]): OHLCV[] {
  return raws.map((r) => ({
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    volume: r.volume,
    timestamp: r.timestamp,
  }));
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
