import type {
  MarketDataAdapter,
  RawQuote,
  RawOHLCV,
  Instrument,
  Timeframe,
} from "@/types/market";
import { log } from "@/lib/logger";

// ─── Databento REST API adapter ──────────────────────────────
// Uses the Historical API (hist.databento.com) for quotes and OHLCV.
// No official JS SDK — direct HTTP calls via fetch.

const BASE_URL = "https://hist.databento.com/v0";
const DATASET = "GLBX.MDP3";
const REQUEST_TIMEOUT = 15_000;

/** Map our Instrument type to Databento continuous contract symbol */
function toSymbol(instrument: Instrument): string {
  // Databento continuous contracts use .c.0 (calendar roll, front month)
  // NOT .FUT (parent symbology — returns ALL contracts, not continuous)
  return `${instrument}.c.0`;
}

/** Map our Timeframe to Databento OHLCV schema */
function toOhlcvSchema(tf: Timeframe): string {
  const map: Record<Timeframe, string> = {
    "1m": "ohlcv-1m",
    "5m": "ohlcv-1m",   // Databento has no native 5m — we'll aggregate from 1m
    "15m": "ohlcv-1m",  // Same — aggregate
    "1h": "ohlcv-1h",
    "1D": "ohlcv-1d",
  };
  return map[tf];
}

/** How many 1m candles to fetch for a given timeframe */
function candleMultiplier(tf: Timeframe): number {
  const map: Record<Timeframe, number> = {
    "1m": 1,
    "5m": 5,
    "15m": 15,
    "1h": 1,
    "1D": 1,
  };
  return map[tf];
}

/** Aggregate 1m candles into larger timeframe */
function aggregateCandles(candles: RawOHLCV[], periodMinutes: number): RawOHLCV[] {
  if (periodMinutes <= 1) return candles;

  const result: RawOHLCV[] = [];
  for (let i = 0; i < candles.length; i += periodMinutes) {
    const batch = candles.slice(i, i + periodMinutes);
    if (batch.length === 0) continue;

    result.push({
      open: batch[0].open,
      high: Math.max(...batch.map((c) => c.high)),
      low: Math.min(...batch.map((c) => c.low)),
      close: batch[batch.length - 1].close,
      volume: batch.reduce((sum, c) => sum + c.volume, 0),
      timestamp: batch[batch.length - 1].timestamp,
    });
  }
  return result;
}

export class DatabentoAdapter implements MarketDataAdapter {
  readonly name = "databento";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  // ─── Quote ───────────────────────────────────────────────

  async getQuote(instrument: Instrument): Promise<RawQuote> {
    const symbol = toSymbol(instrument);

    // Try progressively wider windows to handle market-closed scenarios.
    // NQ trades Sun 6pm - Fri 5pm ET. On weekends/holidays, we need
    // to look back to the last available data.
    const windows = [
      5_000,        // 5 seconds (live market)
      60_000,       // 1 minute
      3_600_000,    // 1 hour
      86_400_000,   // 1 day (covers overnight gap)
      259_200_000,  // 3 days (covers weekends)
    ];

    for (const windowMs of windows) {
      const end = new Date();
      const start = new Date(end.getTime() - windowMs);

      try {
        const data = await this.request("/timeseries.get_range", {
          dataset: DATASET,
          symbols: symbol,
          schema: "mbp-1",
          start: start.toISOString(),
          end: end.toISOString(),
          limit: 1,
          encoding: "json",
          stype_in: "continuous",
        });

        if (data && data.length > 0) {
          return this.parseQuote(data[data.length - 1], instrument);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        // If Databento says our time range is after available data,
        // try a wider window. Otherwise, re-throw.
        if (msg.includes("data_end_after_available_end") || msg.includes("data_start_after_available_end")) {
          continue; // try wider window
        }
        throw err;
      }
    }

    throw new Error(`No quote data for ${instrument} (market may be closed)`);
  }

  private parseQuote(record: DatabentoMbp1, instrument: Instrument): RawQuote {
    // Databento prices are in fixed-point (divide by 1e9 for MDP3)
    const pxFactor = 1e-9;

    // MBP-1 JSON uses levels array with single entry: levels[0].{bid_px, ask_px, bid_sz, ask_sz}
    const level = record.levels?.[0];
    const bidPrice = (level?.bid_px ?? 0) * pxFactor;
    const askPrice = (level?.ask_px ?? 0) * pxFactor;
    const bidSize = level?.bid_sz ?? 0;
    const askSize = level?.ask_sz ?? 0;
    const lastPrice = record.price ? record.price * pxFactor : (bidPrice + askPrice) / 2;

    return {
      symbol: instrument,
      bidPrice: round(bidPrice),
      bidSize,
      askPrice: round(askPrice),
      askSize,
      lastPrice: round(lastPrice),
      lastSize: record.size ?? 1,
      volume: record.volume ?? 0,
      timestamp: this.parseTimestamp(record.ts_event ?? record.hd?.ts_event),
    };
  }

  // ─── Candles ─────────────────────────────────────────────

  async getCandles(
    instrument: Instrument,
    timeframe: Timeframe,
    limit: number
  ): Promise<RawOHLCV[]> {
    const symbol = toSymbol(instrument);
    const schema = toOhlcvSchema(timeframe);
    const multiplier = candleMultiplier(timeframe);
    const fetchLimit = limit * multiplier;

    // Calculate time window — use wider window to handle market closures
    const now = new Date();
    const tfMinutes = timeframeToMinutes(timeframe);
    const baseWindowMs = fetchLimit * tfMinutes * 60_000 * 1.2;
    // On weekends, we need to look back further (up to 3 extra days)
    const extraBufferMs = 3 * 86_400_000;
    const start = new Date(now.getTime() - baseWindowMs - extraBufferMs);

    let data: DatabentoRecord[] = [];
    try {
      data = await this.request("/timeseries.get_range", {
        dataset: DATASET,
        symbols: symbol,
        schema,
        start: start.toISOString(),
        end: now.toISOString(),
        limit: fetchLimit,
        encoding: "json",
        stype_in: "continuous",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      // If time range is after available data, try without end param
      if (msg.includes("data_end_after_available_end") || msg.includes("data_start_after_available_end")) {
        try {
          // Request the most recent available data without specifying end
          const safeEnd = new Date(now.getTime() - 86_400_000); // 1 day ago
          data = await this.request("/timeseries.get_range", {
            dataset: DATASET,
            symbols: symbol,
            schema,
            start: start.toISOString(),
            end: safeEnd.toISOString(),
            limit: fetchLimit,
            encoding: "json",
            stype_in: "continuous",
          });
        } catch {
          log.market.warn(`No candle data for ${instrument} ${timeframe} (market closed)`);
          return [];
        }
      } else {
        throw err;
      }
    }

    if (!data || data.length === 0) {
      log.market.warn(`No candle data for ${instrument} ${timeframe}`);
      return [];
    }

    const rawCandles = data.map((r: DatabentoOhlcv) => this.parseCandle(r));

    // Aggregate if needed (5m, 15m from 1m)
    return aggregateCandles(rawCandles, multiplier).slice(-limit);
  }

  private parseCandle(record: DatabentoOhlcv): RawOHLCV {
    const pxFactor = 1e-9;
    return {
      open: round((record.open ?? 0) * pxFactor),
      high: round((record.high ?? 0) * pxFactor),
      low: round((record.low ?? 0) * pxFactor),
      close: round((record.close ?? 0) * pxFactor),
      volume: record.volume ?? 0,
      timestamp: this.parseTimestamp(record.ts_event ?? record.hd?.ts_event),
    };
  }

  // ─── Health ──────────────────────────────────────────────

  async checkHealth(): Promise<{
    ok: boolean;
    latencyMs: number;
    message: string;
  }> {
    const start = Date.now();
    try {
      const res = await fetch(`${BASE_URL}/metadata.list_datasets`, {
        headers: { Authorization: `Basic ${btoa(this.apiKey + ":")}` },
        signal: AbortSignal.timeout(5000),
      });
      const latencyMs = Date.now() - start;

      if (res.ok) {
        return { ok: true, latencyMs, message: "Databento connected" };
      }
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        latencyMs,
        message: `HTTP ${res.status}: ${text.slice(0, 100)}`,
      };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        message: err instanceof Error ? err.message : "Connection failed",
      };
    }
  }

  // ─── HTTP layer ──────────────────────────────────────────

  private async request(
    endpoint: string,
    params: Record<string, unknown>
  ): Promise<DatabentoRecord[]> {
    const url = new URL(`${BASE_URL}${endpoint}`);

    // Databento hist API uses GET with query params
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }

    log.market.debug(`Databento request: ${endpoint}`, {
      symbol: params.symbols,
      schema: params.schema,
    });

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Basic ${btoa(this.apiKey + ":")}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const msg = `Databento API ${res.status}: ${body.slice(0, 200)}`;
      log.market.error(msg);
      throw new Error(msg);
    }

    // Databento returns NDJSON (newline-delimited JSON)
    const text = await res.text();
    if (!text.trim()) return [];

    const lines = text.trim().split("\n");
    return lines.map((line) => JSON.parse(line));
  }

  // ─── Timestamp parsing ───────────────────────────────────

  private parseTimestamp(ts: string | number | undefined): string {
    if (!ts) return new Date().toISOString();

    // Databento uses nanosecond UNIX timestamps
    if (typeof ts === "number" || /^\d+$/.test(String(ts))) {
      const ns = BigInt(String(ts));
      const ms = Number(ns / BigInt(1_000_000));
      return new Date(ms).toISOString();
    }

    return String(ts);
  }
}

// ─── Helpers ─────────────────────────────────────────────────

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function timeframeToMinutes(tf: Timeframe): number {
  const map: Record<Timeframe, number> = {
    "1m": 1,
    "5m": 5,
    "15m": 15,
    "1h": 60,
    "1D": 1440,
  };
  return map[tf];
}

// ─── Databento response types (partial) ─────────────────────

interface DatabentoRecord {
  hd?: { ts_event?: string | number };
  ts_event?: string | number;
  [key: string]: unknown;
}

interface DatabentoMbp1 extends DatabentoRecord {
  price?: number;
  size?: number;
  volume?: number;
  levels?: Array<{
    bid_px: number;
    ask_px: number;
    bid_sz: number;
    ask_sz: number;
  }>;
}

interface DatabentoOhlcv extends DatabentoRecord {
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
}
