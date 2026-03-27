import type { OHLCV, SessionLevels } from "@/types/market";

/**
 * Calculates derived session levels from candle data.
 *
 * Assumptions (to be refined with real data):
 * - "Session" = candles from 09:30 ET onward
 * - "Overnight" = candles before 09:30 ET
 * - "Previous day" = the last full day's candles
 * - "Opening range" = first 30 minutes (first N candles depending on timeframe)
 * - VWAP = volume-weighted average price from session start
 */
export function computeSessionLevels(
  candles: OHLCV[],
  now: Date = new Date()
): SessionLevels {
  if (candles.length === 0) {
    return emptyLevels();
  }

  const today = toDateString(now);
  const todayCandles = candles.filter(
    (c) => toDateString(new Date(c.timestamp)) === today
  );

  const sessionOpenHour = 9.5; // 09:30 ET
  const sessionCandles = todayCandles.filter((c) => {
    const h = new Date(c.timestamp).getHours();
    const m = new Date(c.timestamp).getMinutes();
    return h + m / 60 >= sessionOpenHour;
  });

  const overnightCandles = todayCandles.filter((c) => {
    const h = new Date(c.timestamp).getHours();
    const m = new Date(c.timestamp).getMinutes();
    return h + m / 60 < sessionOpenHour;
  });

  // Previous trading day: find the most recent day in candle data BEFORE today.
  // This handles weekends/holidays correctly (skips days with no data).
  const prevDates = new Set(
    candles
      .map((c) => toDateString(new Date(c.timestamp)))
      .filter((d) => d < today)
  );
  const sortedPrevDates = Array.from(prevDates).sort().reverse();
  const prevDayStr = sortedPrevDates[0] ?? null;
  const prevDayCandles = prevDayStr
    ? candles.filter((c) => toDateString(new Date(c.timestamp)) === prevDayStr)
    : [];

  // Opening range: first 30 min of session
  const openingRangeEnd = new Date(now);
  openingRangeEnd.setHours(10, 0, 0, 0);
  const orCandles = sessionCandles.filter(
    (c) => new Date(c.timestamp) <= openingRangeEnd
  );

  return {
    sessionHigh: highOf(sessionCandles),
    sessionLow: lowOf(sessionCandles),
    overnightHigh: highOf(overnightCandles),
    overnightLow: lowOf(overnightCandles),
    previousDayHigh: highOf(prevDayCandles),
    previousDayLow: lowOf(prevDayCandles),
    previousDayClose: prevDayCandles.length > 0
      ? prevDayCandles[prevDayCandles.length - 1].close
      : null,
    vwap: computeVWAP(sessionCandles),
    openingRangeHigh: highOf(orCandles),
    openingRangeLow: lowOf(orCandles),
  };
}

// ─── Helpers ─────────────────────────────────────────────────

function emptyLevels(): SessionLevels {
  return {
    sessionHigh: null,
    sessionLow: null,
    overnightHigh: null,
    overnightLow: null,
    previousDayHigh: null,
    previousDayLow: null,
    previousDayClose: null,
    vwap: null,
    openingRangeHigh: null,
    openingRangeLow: null,
  };
}

function highOf(candles: OHLCV[]): number | null {
  if (candles.length === 0) return null;
  return Math.max(...candles.map((c) => c.high));
}

function lowOf(candles: OHLCV[]): number | null {
  if (candles.length === 0) return null;
  return Math.min(...candles.map((c) => c.low));
}

function computeVWAP(candles: OHLCV[]): number | null {
  if (candles.length === 0) return null;

  let cumulativeTPV = 0; // typical price * volume
  let cumulativeVolume = 0;

  for (const c of candles) {
    const typicalPrice = (c.high + c.low + c.close) / 3;
    cumulativeTPV += typicalPrice * c.volume;
    cumulativeVolume += c.volume;
  }

  if (cumulativeVolume === 0) return null;
  return Math.round((cumulativeTPV / cumulativeVolume) * 100) / 100;
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}
