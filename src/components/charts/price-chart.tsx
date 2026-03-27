"use client";

import { useEffect, useRef, useCallback } from "react";
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  ColorType,
  LineStyle,
  CrosshairMode,
} from "lightweight-charts";
import type { OHLCV, SessionLevels } from "@/types/market";
import {
  toCandlestickData,
  toLevelLines,
  SIGNAL_MARKER_CONFIG,
  type SignalMarker,
} from "./chart-transforms";

// ─── Props ───────────────────────────────────────────────────

interface PriceChartProps {
  candles: OHLCV[];
  levels?: SessionLevels | null;
  signals?: SignalMarker[];
  height?: number;
}

// ─── Chart theme (dark) ──────────────────────────────────────

const CHART_COLORS = {
  background: "transparent",
  text: "rgba(156, 163, 175, 0.6)",
  grid: "rgba(42, 46, 57, 0.4)",
  border: "rgba(42, 46, 57, 0.6)",
  crosshair: "rgba(99, 102, 241, 0.4)",
  upColor: "#22c55e",
  downColor: "#ef4444",
  upWick: "#22c55e",
  downWick: "#ef4444",
} as const;

// ─── Component ───────────────────────────────────────────────

export function PriceChart({
  candles,
  levels,
  signals = [],
  height = 460,
}: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const levelSeriesRefs = useRef<ISeriesApi<"Line">[]>([]);

  // ── Create chart once ────────────────────────────────────
  const initChart = useCallback(() => {
    if (!containerRef.current) return;

    // Cleanup existing
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      levelSeriesRefs.current = [];
    }

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: CHART_COLORS.background },
        textColor: CHART_COLORS.text,
        fontFamily: "system-ui, -apple-system, sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: CHART_COLORS.grid },
        horzLines: { color: CHART_COLORS.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: CHART_COLORS.crosshair, width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#1e1e2e" },
        horzLine: { color: CHART_COLORS.crosshair, width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#1e1e2e" },
      },
      rightPriceScale: {
        borderColor: CHART_COLORS.border,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: CHART_COLORS.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
        barSpacing: 8,
      },
      handleScroll: { vertTouchDrag: false },
    });

    // Candlestick series
    const candleSeries = chart.addCandlestickSeries({
      upColor: CHART_COLORS.upColor,
      downColor: CHART_COLORS.downColor,
      borderVisible: false,
      wickUpColor: CHART_COLORS.upWick,
      wickDownColor: CHART_COLORS.downWick,
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    // Responsive resize
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        chart.applyOptions({ width });
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, []);

  // ── Init on mount ────────────────────────────────────────
  useEffect(() => {
    const cleanup = initChart();
    return () => cleanup?.();
  }, [initChart]);

  // ── Update candle data ───────────────────────────────────
  useEffect(() => {
    if (!candleSeriesRef.current || candles.length === 0) return;

    const data = toCandlestickData(candles);
    candleSeriesRef.current.setData(data);

    // Signal markers
    if (signals.length > 0) {
      const markers = signals.map((s) => {
        const config = SIGNAL_MARKER_CONFIG[s.action];
        return {
          time: s.time,
          position: config.position as "belowBar" | "aboveBar" | "inBar",
          color: config.color,
          shape: config.shape as "arrowUp" | "arrowDown" | "circle",
          text: s.label ?? s.action,
        };
      });
      candleSeriesRef.current.setMarkers(markers);
    }

    // Fit content
    chartRef.current?.timeScale().fitContent();
  }, [candles, signals]);

  // ── Update level lines ───────────────────────────────────
  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current) return;

    // Remove old level series
    for (const series of levelSeriesRefs.current) {
      try {
        chartRef.current.removeSeries(series);
      } catch {
        // series may already be removed
      }
    }
    levelSeriesRefs.current = [];

    if (!levels || candles.length === 0) return;

    const levelLines = toLevelLines(levels);
    const firstTime = Math.floor(new Date(candles[0].timestamp).getTime() / 1000);
    const lastTime = Math.floor(new Date(candles[candles.length - 1].timestamp).getTime() / 1000);

    for (const level of levelLines) {
      const lineStyle = level.style === "solid"
        ? LineStyle.Solid
        : level.style === "dotted"
          ? LineStyle.Dotted
          : LineStyle.Dashed;

      const series = chartRef.current.addLineSeries({
        color: level.color,
        lineWidth: level.style === "solid" ? 2 : 1,
        lineStyle,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        title: level.label,
      });

      series.setData([
        { time: firstTime as UTCTimestamp, value: level.price },
        { time: lastTime as UTCTimestamp, value: level.price },
      ]);

      levelSeriesRefs.current.push(series);
    }
  }, [levels, candles]);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Chart legend */}
      <div className="flex flex-wrap items-center gap-4 border-b border-border/50 px-4 py-2">
        <LegendItem color="#6366f1" label="VWAP" style="solid" />
        <LegendItem color="#3b82f6" label="Session H/L" style="dashed" />
        <LegendItem color="#8b5cf6" label="Opening Range" style="dotted" />
        <LegendItem color="#f59e0b" label="Overnight H/L" style="dashed" />
        <LegendItem color="#6b7280" label="Prev Day" style="dashed" />
      </div>

      <div ref={containerRef} style={{ height }} />
    </div>
  );
}

// ─── Legend item ─────────────────────────────────────────────

function LegendItem({
  color,
  label,
  style,
}: {
  color: string;
  label: string;
  style: "solid" | "dashed" | "dotted";
}) {
  const borderStyle = style === "solid" ? "solid" : style === "dotted" ? "dotted" : "dashed";

  return (
    <div className="flex items-center gap-1.5">
      <div
        className="h-0 w-4"
        style={{
          borderTop: `2px ${borderStyle} ${color}`,
        }}
      />
      <span className="text-[10px] text-muted-foreground/60">{label}</span>
    </div>
  );
}
