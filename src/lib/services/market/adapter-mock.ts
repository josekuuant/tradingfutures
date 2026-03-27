import type {
  MarketDataAdapter,
  RawQuote,
  RawOHLCV,
  Instrument,
  Timeframe,
} from "@/types/market";

/**
 * Mock adapter that produces realistic NQ-range data.
 * Drop-in replaceable with DatabnetoAdapter when ready.
 */
export class MockMarketAdapter implements MarketDataAdapter {
  readonly name = "mock";

  private basePrice = 19850.0;
  private sessionStart: Date;

  constructor() {
    const now = new Date();
    this.sessionStart = new Date(now);
    this.sessionStart.setHours(9, 30, 0, 0);
    if (this.sessionStart > now) {
      this.sessionStart.setDate(this.sessionStart.getDate() - 1);
    }
  }

  async getQuote(instrument: Instrument): Promise<RawQuote> {
    const jitter = (Math.random() - 0.5) * 20;
    const last = this.basePrice + jitter;
    const spread = instrument === "MNQ" ? 0.5 : 0.25;

    return {
      symbol: instrument,
      bidPrice: round(last - spread / 2),
      bidSize: Math.floor(Math.random() * 50) + 5,
      askPrice: round(last + spread / 2),
      askSize: Math.floor(Math.random() * 50) + 5,
      lastPrice: round(last),
      lastSize: Math.floor(Math.random() * 10) + 1,
      volume: Math.floor(Math.random() * 500000) + 100000,
      timestamp: new Date().toISOString(),
    };
  }

  async getCandles(
    _instrument: Instrument,
    timeframe: Timeframe,
    limit: number
  ): Promise<RawOHLCV[]> {
    const intervalMs = timeframeToMs(timeframe);
    const candles: RawOHLCV[] = [];
    let price = this.basePrice - limit * 2;
    const now = Date.now();

    for (let i = limit; i > 0; i--) {
      const drift = (Math.random() - 0.48) * 15;
      const open = round(price);
      const close = round(price + drift);
      const high = round(Math.max(open, close) + Math.random() * 8);
      const low = round(Math.min(open, close) - Math.random() * 8);
      const volume = Math.floor(Math.random() * 5000) + 500;

      candles.push({
        open,
        high,
        low,
        close,
        volume,
        timestamp: new Date(now - i * intervalMs).toISOString(),
      });

      price = close;
    }

    return candles;
  }

  async checkHealth(): Promise<{
    ok: boolean;
    latencyMs: number;
    message: string;
  }> {
    return {
      ok: true,
      latencyMs: Math.floor(Math.random() * 5) + 1,
      message: "Mock adapter — no live connection",
    };
  }
}

// ─── Helpers ─────────────────────────────────────────────────

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function timeframeToMs(tf: Timeframe): number {
  const map: Record<Timeframe, number> = {
    "1m": 60_000,
    "5m": 300_000,
    "15m": 900_000,
    "1h": 3_600_000,
    "1D": 86_400_000,
  };
  return map[tf];
}
