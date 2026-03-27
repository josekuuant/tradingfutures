"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  ColorType,
  LineStyle,
  CrosshairMode,
} from "lightweight-charts";
import type { OHLCV, SessionLevels } from "@/types/market";
import {
  toCandlestickData,
  toVolumeData,
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

// ─── Chart theme (dark premium) ─────────────────────────────

const THEME = {
  bg: "transparent",
  text: "rgba(156, 163, 175, 0.6)",
  gridLines: "rgba(30, 34, 45, 0.6)",
  border: "rgba(42, 46, 57, 0.6)",
  crosshair: "rgba(99, 102, 241, 0.4)",
  crosshairLabel: "#1a1b2e",
  up: "#22c55e",
  down: "#ef4444",
} as const;

const LINE_STYLE_MAP: Record<string, LineStyle> = {
  solid: LineStyle.Solid,
  dashed: LineStyle.Dashed,
  dotted: LineStyle.Dotted,
};

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
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const [visibleLevels, setVisibleLevels] = useState<Set<string>>(
    new Set(["VWAP", "Session H/L", "Opening Range", "Overnight H/L", "Prev Day"])
  );

  // ── Create chart ───────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: THEME.bg },
        textColor: THEME.text,
        fontFamily: "system-ui, -apple-system, sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: THEME.gridLines },
        horzLines: { color: THEME.gridLines },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: THEME.crosshair,
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: THEME.crosshairLabel,
        },
        horzLine: {
          color: THEME.crosshair,
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: THEME.crosshairLabel,
        },
      },
      rightPriceScale: {
        borderColor: THEME.border,
        scaleMargins: { top: 0.08, bottom: 0.15 },
      },
      timeScale: {
        borderColor: THEME.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
        barSpacing: 8,
        minBarSpacing: 4,
      },
      handleScroll: { vertTouchDrag: false },
    });

    // Candlestick series
    const candleSeries = chart.addCandlestickSeries({
      upColor: THEME.up,
      downColor: THEME.down,
      borderVisible: false,
      wickUpColor: THEME.up,
      wickDownColor: THEME.down,
      priceLineVisible: true,
      priceLineWidth: 1,
      lastValueVisible: true,
    });

    // Volume histogram (overlay at bottom)
    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
      priceLineVisible: false,
      lastValueVisible: false,
    });

    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    // Responsive resize
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({ width: entry.contentRect.width });
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, [height]);

  // ── Update data ────────────────────────────────────────────
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || candles.length === 0) return;

    const candleData = toCandlestickData(candles);
    const volumeData = toVolumeData(candles);

    candleSeriesRef.current.setData(candleData);
    volumeSeriesRef.current.setData(volumeData);

    // Signal markers on candle series
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
    } else {
      candleSeriesRef.current.setMarkers([]);
    }

    chartRef.current?.timeScale().fitContent();
  }, [candles, signals]);

  // ── Update level price lines ───────────────────────────────
  useEffect(() => {
    if (!candleSeriesRef.current) return;

    // Remove existing price lines
    const series = candleSeriesRef.current;
    // Lightweight Charts doesn't have a removeAllPriceLines, so we recreate
    // Price lines on the candle series itself (shown on Y axis with labels)

    if (!levels || candles.length === 0) return;

    const allLevelLines = toLevelLines(levels);

    // Filter by visibility toggle
    const activeLines = allLevelLines.filter((l) => {
      if (l.label === "VWAP") return visibleLevels.has("VWAP");
      if (l.label.startsWith("Session")) return visibleLevels.has("Session H/L");
      if (l.label.startsWith("OR")) return visibleLevels.has("Opening Range");
      if (l.label.startsWith("ON")) return visibleLevels.has("Overnight H/L");
      if (l.label.startsWith("PD")) return visibleLevels.has("Prev Day");
      return true;
    });

    // Create price lines on the candlestick series
    for (const level of activeLines) {
      series.createPriceLine({
        price: level.price,
        color: level.color,
        lineWidth: level.lineWidth as 1 | 2 | 3 | 4,
        lineStyle: LINE_STYLE_MAP[level.style] ?? LineStyle.Dashed,
        lineVisible: true,
        axisLabelVisible: true,
        title: level.label,
      });
    }
  }, [levels, candles, visibleLevels]);

  // ── Legend toggle ──────────────────────────────────────────

  const toggleLevel = (group: string) => {
    setVisibleLevels((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Interactive legend */}
      <div className="flex flex-wrap items-center gap-1 border-b border-border/50 px-3 py-1.5">
        <LegendToggle
          color="#6366f1"
          label="VWAP"
          style="solid"
          active={visibleLevels.has("VWAP")}
          onClick={() => toggleLevel("VWAP")}
        />
        <LegendToggle
          color="#3b82f6"
          label="Session H/L"
          style="dashed"
          active={visibleLevels.has("Session H/L")}
          onClick={() => toggleLevel("Session H/L")}
        />
        <LegendToggle
          color="#8b5cf6"
          label="Opening Range"
          style="dotted"
          active={visibleLevels.has("Opening Range")}
          onClick={() => toggleLevel("Opening Range")}
        />
        <LegendToggle
          color="#f59e0b"
          label="Overnight H/L"
          style="dashed"
          active={visibleLevels.has("Overnight H/L")}
          onClick={() => toggleLevel("Overnight H/L")}
        />
        <LegendToggle
          color="#6b7280"
          label="Prev Day"
          style="dashed"
          active={visibleLevels.has("Prev Day")}
          onClick={() => toggleLevel("Prev Day")}
        />

        <div className="ml-auto flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-sm bg-success/30" />
          <span className="text-[9px] text-muted-foreground/40">Volume</span>
        </div>
      </div>

      {/* Chart container */}
      <div ref={containerRef} style={{ height }} />
    </div>
  );
}

// ─── Legend toggle button ────────────────────────────────────

function LegendToggle({
  color,
  label,
  style,
  active,
  onClick,
}: {
  color: string;
  label: string;
  style: "solid" | "dashed" | "dotted";
  active: boolean;
  onClick: () => void;
}) {
  const borderStyle = style === "dotted" ? "dotted" : style === "dashed" ? "dashed" : "solid";

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded px-2 py-1 text-[10px] transition-all ${
        active
          ? "text-foreground/70 hover:bg-accent/30"
          : "text-muted-foreground/30 line-through hover:bg-accent/10"
      }`}
    >
      <div
        className="h-0 w-3.5"
        style={{
          borderTop: `2px ${borderStyle} ${active ? color : "rgba(107,114,128,0.3)"}`,
        }}
      />
      {label}
    </button>
  );
}
