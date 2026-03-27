import type { OHLCV, SessionLevels } from "@/types/market";
import type {
  CandlestickData,
  HistogramData,
  UTCTimestamp,
} from "lightweight-charts";

// ─── Signal marker type (chart-only concern) ─────────────────

export type SignalAction = "BUY" | "SELL" | "NO_TRADE";

export interface SignalMarker {
  time: UTCTimestamp;
  action: SignalAction;
  price: number;
  label?: string;
}

// ─── Level line config ───────────────────────────────────────

export interface LevelLine {
  price: number;
  label: string;
  color: string;
  style: "solid" | "dashed" | "dotted";
  lineWidth: number;
}

// ─── Transforms ──────────────────────────────────────────────

/** Convert OHLCV[] → CandlestickData[] for Lightweight Charts */
export function toCandlestickData(candles: OHLCV[]): CandlestickData[] {
  return candles.map((c) => ({
    time: (Math.floor(new Date(c.timestamp).getTime() / 1000)) as UTCTimestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  }));
}

/** Convert OHLCV[] → volume histogram data */
export function toVolumeData(candles: OHLCV[]): HistogramData[] {
  return candles.map((c) => ({
    time: (Math.floor(new Date(c.timestamp).getTime() / 1000)) as UTCTimestamp,
    value: c.volume,
    color: c.close >= c.open
      ? "rgba(34, 197, 94, 0.25)"  // green up
      : "rgba(239, 68, 68, 0.25)", // red down
  }));
}

/** Map SessionLevels → LevelLine[] for chart overlays */
export function toLevelLines(levels: SessionLevels): LevelLine[] {
  const lines: LevelLine[] = [];

  const add = (
    value: number | null,
    label: string,
    color: string,
    style: LevelLine["style"] = "dashed",
    lineWidth = 1
  ) => {
    if (value != null) lines.push({ price: value, label, color, style, lineWidth });
  };

  // VWAP — primary, solid, thicker
  add(levels.vwap, "VWAP", "#6366f1", "solid", 2);

  // Session high/low
  add(levels.sessionHigh, "Session H", "#3b82f6", "dashed");
  add(levels.sessionLow, "Session L", "#3b82f6", "dashed");

  // Opening range
  add(levels.openingRangeHigh, "OR High", "#8b5cf6", "dotted");
  add(levels.openingRangeLow, "OR Low", "#8b5cf6", "dotted");

  // Overnight
  add(levels.overnightHigh, "ON High", "#f59e0b", "dashed");
  add(levels.overnightLow, "ON Low", "#f59e0b", "dashed");

  // Previous day
  add(levels.previousDayHigh, "PD High", "#6b7280", "dashed");
  add(levels.previousDayLow, "PD Low", "#6b7280", "dashed");
  add(levels.previousDayClose, "PD Close", "#9ca3af", "dotted");

  return lines;
}

/** Signal marker colors and shapes */
export const SIGNAL_MARKER_CONFIG: Record<
  SignalAction,
  { color: string; shape: "arrowUp" | "arrowDown" | "circle"; position: "belowBar" | "aboveBar" | "inBar" }
> = {
  BUY: { color: "#22c55e", shape: "arrowUp", position: "belowBar" },
  SELL: { color: "#ef4444", shape: "arrowDown", position: "aboveBar" },
  NO_TRADE: { color: "#6b7280", shape: "circle", position: "inBar" },
};
