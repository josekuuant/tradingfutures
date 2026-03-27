import type {
  MarketDataAdapter,
  MarketSnapshot,
  Instrument,
  Timeframe,
  FeedHealth,
  StreamEntry,
} from "@/types/market";
import { MockMarketAdapter } from "./adapter-mock";
import { DatabentoAdapter } from "./adapter-databento";
import { normalizeQuote, normalizeCandles } from "./normalizer";
import { computeSessionLevels } from "./derived-metrics";
import { getRawCredentials } from "@/lib/services/connections";
import { log } from "@/lib/logger";

// ─── Adapter registry ────────────────────────────────────────

let adapter: MarketDataAdapter = new MockMarketAdapter();
let adapterInitialized = false;

export function getAdapter(): MarketDataAdapter {
  return adapter;
}

export function setAdapter(a: MarketDataAdapter): void {
  adapter = a;
  adapterInitialized = true;
  log.market.info(`Market adapter set to: ${a.name}`);
}

/**
 * Auto-detect adapter: if Databento credentials exist, use DatabentoAdapter.
 * Otherwise fall back to MockMarketAdapter.
 * Called lazily on first market data request.
 */
async function ensureAdapter(): Promise<void> {
  if (adapterInitialized) return;
  adapterInitialized = true; // prevent re-entry

  try {
    const creds = await getRawCredentials("databento");
    const apiKey = creds?.apiKey as string | undefined;

    if (apiKey && apiKey.length > 0) {
      adapter = new DatabentoAdapter(apiKey);
      log.market.info("Databento adapter initialized with stored credentials");
    } else {
      log.market.info("No Databento credentials — using mock adapter");
    }
  } catch (err) {
    log.market.warn(
      `Failed to initialize Databento adapter: ${err instanceof Error ? err.message : "unknown"}`
    );
    // Keep mock adapter
  }
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
  // Auto-detect adapter on first call
  await ensureAdapter();

  // Quote is required — candles/health are best-effort
  const rawQuote = await adapter.getQuote(instrument);

  let rawCandles: Awaited<ReturnType<typeof adapter.getCandles>> = [];
  try {
    rawCandles = await adapter.getCandles(instrument, timeframe, 100);
  } catch {
    rawCandles = [];
  }

  let healthCheck: Awaited<ReturnType<typeof adapter.checkHealth>> = {
    ok: false,
    latencyMs: -1,
    message: "Health check failed",
  };
  try {
    healthCheck = await adapter.checkHealth();
  } catch {
    // keep defaults
  }

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
