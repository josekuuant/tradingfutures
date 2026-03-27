import type {
  MarketDataAdapter,
  MarketSnapshot,
  Instrument,
  Timeframe,
  FeedHealth,
  StreamEntry,
} from "@/types/market";
import { MockMarketAdapter } from "./adapter-mock";
import { normalizeQuote, normalizeCandles } from "./normalizer";
import { computeSessionLevels } from "./derived-metrics";

// ─── Adapter registry ────────────────────────────────────────
// Swap MockMarketAdapter → DatabentoAdapter when ready

let adapter: MarketDataAdapter = new MockMarketAdapter();

export function getAdapter(): MarketDataAdapter {
  return adapter;
}

export function setAdapter(a: MarketDataAdapter): void {
  adapter = a;
}

// ─── Stream log (in-memory ring buffer) ──────────────────────

const STREAM_LOG_MAX = 50;
const streamLog: StreamEntry[] = [];
let streamIdCounter = 0;

export function pushStreamEntry(
  type: StreamEntry["type"],
  message: string
): void {
  streamLog.unshift({
    id: String(++streamIdCounter),
    type,
    message,
    timestamp: new Date().toISOString(),
  });
  if (streamLog.length > STREAM_LOG_MAX) {
    streamLog.length = STREAM_LOG_MAX;
  }
}

export function getStreamLog(): StreamEntry[] {
  return [...streamLog];
}

// ─── Main service ────────────────────────────────────────────

export async function getMarketSnapshot(
  instrument: Instrument = "NQ",
  timeframe: Timeframe = "5m"
): Promise<MarketSnapshot> {
  const [rawQuote, rawCandles, healthCheck] = await Promise.all([
    adapter.getQuote(instrument),
    adapter.getCandles(instrument, timeframe, 100),
    adapter.checkHealth(),
  ]);

  const quote = normalizeQuote(rawQuote, instrument);
  const candles = normalizeCandles(rawCandles);
  const levels = computeSessionLevels(candles);

  pushStreamEntry("quote", `${instrument} ${quote.lastPrice.toFixed(2)}`);

  const health: FeedHealth = {
    status: healthCheck.ok ? "live" : "disconnected",
    latencyMs: healthCheck.latencyMs,
    lastUpdateAt: quote.receivedAt,
    uptimeSince: null,
    tickCount: streamIdCounter,
  };

  return {
    quote,
    levels,
    health,
    recentCandles: candles.slice(-50),
    streamLog: getStreamLog().slice(0, 20),
  };
}
