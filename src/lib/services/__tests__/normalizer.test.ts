import { describe, it, expect } from "vitest";
import { normalizeQuote, normalizeCandles } from "../market/normalizer";
import type { RawQuote, RawOHLCV } from "@/types/market";

function makeRawQuote(overrides: Partial<RawQuote> = {}): RawQuote {
  return {
    symbol: "NQ",
    bidPrice: 19849.75,
    bidSize: 10,
    askPrice: 19850.25,
    askSize: 10,
    lastPrice: 19850.0,
    lastSize: 1,
    volume: 250000,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe("normalizeQuote", () => {
  it("normalizes a valid quote", () => {
    const q = normalizeQuote(makeRawQuote(), "NQ");
    expect(q.instrument).toBe("NQ");
    expect(q.lastPrice).toBe(19850);
    expect(q.spread).toBe(0.5);
    expect(q.receivedAt).toBeTruthy();
  });

  it("handles NaN prices gracefully", () => {
    const q = normalizeQuote(makeRawQuote({ lastPrice: NaN }), "NQ");
    expect(q.lastPrice).toBe(0);
  });

  it("handles negative prices gracefully", () => {
    const q = normalizeQuote(makeRawQuote({ bidPrice: -100 }), "NQ");
    expect(q.bidPrice).toBe(0);
  });

  it("handles Infinity prices gracefully", () => {
    const q = normalizeQuote(makeRawQuote({ askPrice: Infinity }), "NQ");
    expect(q.askPrice).toBe(0);
  });

  it("ensures spread is non-negative", () => {
    // askPrice < bidPrice (unusual but possible in bad data)
    const q = normalizeQuote(makeRawQuote({ bidPrice: 19850, askPrice: 19849 }), "NQ");
    expect(q.spread).toBeGreaterThanOrEqual(0);
  });

  it("ensures volume is non-negative", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = normalizeQuote(makeRawQuote({ volume: -1000 } as unknown as RawQuote), "NQ");
    expect(q.volume).toBe(0);
  });
});

describe("normalizeCandles", () => {
  it("normalizes valid candles", () => {
    const raw: RawOHLCV[] = [
      { open: 19840, high: 19860, low: 19830, close: 19850, volume: 1000, timestamp: new Date().toISOString() },
    ];
    const result = normalizeCandles(raw);
    expect(result).toHaveLength(1);
    expect(result[0].open).toBe(19840);
  });

  it("filters out candles with NaN", () => {
    const raw: RawOHLCV[] = [
      { open: NaN, high: 19860, low: 19830, close: 19850, volume: 1000, timestamp: new Date().toISOString() },
      { open: 19840, high: 19860, low: 19830, close: 19850, volume: 1000, timestamp: new Date().toISOString() },
    ];
    const result = normalizeCandles(raw);
    expect(result).toHaveLength(1);
  });

  it("filters out candles where high < low", () => {
    const raw: RawOHLCV[] = [
      { open: 19840, high: 19830, low: 19860, close: 19850, volume: 1000, timestamp: new Date().toISOString() },
    ];
    const result = normalizeCandles(raw);
    expect(result).toHaveLength(0);
  });

  it("filters out candles with negative prices", () => {
    const raw: RawOHLCV[] = [
      { open: -1, high: 19860, low: 19830, close: 19850, volume: 1000, timestamp: new Date().toISOString() },
    ];
    const result = normalizeCandles(raw);
    expect(result).toHaveLength(0);
  });

  it("returns empty array for empty input", () => {
    expect(normalizeCandles([])).toHaveLength(0);
  });

  it("ensures volume is non-negative", () => {
    const raw: RawOHLCV[] = [
      { open: 19840, high: 19860, low: 19830, close: 19850, volume: -500, timestamp: new Date().toISOString() },
    ];
    const result = normalizeCandles(raw);
    expect(result[0].volume).toBe(0);
  });
});
