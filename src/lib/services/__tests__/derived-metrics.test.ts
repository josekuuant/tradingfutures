import { describe, it, expect } from "vitest";
import { computeSessionLevels } from "../market/derived-metrics";
import type { OHLCV } from "@/types/market";

function makeCandle(
  timestamp: string,
  price: number,
  range = 10,
  volume = 1000
): OHLCV {
  return {
    open: price,
    high: price + range / 2,
    low: price - range / 2,
    close: price + 1,
    volume,
    timestamp,
  };
}

function todayAt(hour: number, minute = 0): string {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function yesterdayAt(hour: number, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

describe("computeSessionLevels", () => {
  it("returns empty levels for no candles", () => {
    const levels = computeSessionLevels([]);
    expect(levels.sessionHigh).toBeNull();
    expect(levels.sessionLow).toBeNull();
    expect(levels.vwap).toBeNull();
  });

  it("computes session high/low from session candles", () => {
    const candles = [
      makeCandle(todayAt(10, 0), 19850), // session: high=19855, low=19845
      makeCandle(todayAt(10, 5), 19860), // session: high=19865, low=19855
      makeCandle(todayAt(10, 10), 19840), // session: high=19845, low=19835
    ];
    const levels = computeSessionLevels(candles);
    expect(levels.sessionHigh).toBe(19865);
    expect(levels.sessionLow).toBe(19835);
  });

  it("computes overnight high/low from pre-session candles", () => {
    const candles = [
      makeCandle(todayAt(3, 0), 19800), // overnight: high=19805, low=19795
      makeCandle(todayAt(4, 0), 19820), // overnight: high=19825, low=19815
      makeCandle(todayAt(10, 0), 19850), // session
    ];
    const levels = computeSessionLevels(candles);
    expect(levels.overnightHigh).toBe(19825);
    expect(levels.overnightLow).toBe(19795);
  });

  it("finds previous day from actual candle dates (not naive -1 day)", () => {
    // Simulate Monday — yesterday's candles are from Friday (2 days ago data-wise)
    const friday = new Date();
    friday.setDate(friday.getDate() - 3); // Go back to find a non-today date
    const fridayStr = friday.toISOString();

    const candles = [
      makeCandle(fridayStr, 19800), // "previous day"
      makeCandle(todayAt(10, 0), 19850), // today
    ];
    const levels = computeSessionLevels(candles);
    // Previous day should be found from actual data, not naive yesterday
    expect(levels.previousDayHigh).not.toBeNull();
    expect(levels.previousDayLow).not.toBeNull();
  });

  it("computes VWAP from session candles", () => {
    // Single candle: VWAP = typical price = (H+L+C)/3
    const candles = [
      makeCandle(todayAt(10, 0), 19850, 10, 1000),
      // high=19855, low=19845, close=19851
      // TP = (19855+19845+19851)/3 = 19850.33...
    ];
    const levels = computeSessionLevels(candles);
    expect(levels.vwap).not.toBeNull();
    if (levels.vwap) {
      expect(levels.vwap).toBeGreaterThan(19840);
      expect(levels.vwap).toBeLessThan(19860);
    }
  });

  it("returns null VWAP for zero-volume candles", () => {
    const candles = [
      makeCandle(todayAt(10, 0), 19850, 10, 0), // zero volume
    ];
    const levels = computeSessionLevels(candles);
    expect(levels.vwap).toBeNull();
  });
});
