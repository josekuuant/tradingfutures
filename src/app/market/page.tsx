"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { BarChart3, RefreshCw, Loader2 } from "lucide-react";
import type { MarketSnapshot, Instrument, Timeframe } from "@/types/market";
import { QuotePanel } from "@/components/market/quote-panel";
import { FeedHealthPanel } from "@/components/market/feed-health";
import { SessionLevelsPanel } from "@/components/market/session-levels";
import { StreamLog } from "@/components/market/stream-log";
import { TimeframeSelector } from "@/components/market/timeframe-selector";
import { InstrumentSelector } from "@/components/market/instrument-selector";

export default function MarketPage() {
  const [instrument, setInstrument] = useState<Instrument>("NQ");
  const [timeframe, setTimeframe] = useState<Timeframe>("5m");
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(
    async (silent = false) => {
      if (!silent) setRefreshing(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/market-data?instrument=${instrument}&timeframe=${timeframe}`
        );
        if (!res.ok) throw new Error("Failed to fetch");
        const data: MarketSnapshot = await res.json();
        setSnapshot(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [instrument, timeframe]
  );

  // Initial load + on instrument/timeframe change
  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  // Auto-refresh
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => fetchData(true), 5000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, fetchData]);

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Market Feed</h2>
            <p className="text-sm text-muted-foreground">
              Real-time NQ/MNQ market data
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <InstrumentSelector value={instrument} onChange={setInstrument} />
          <TimeframeSelector value={timeframe} onChange={setTimeframe} />

          {/* Auto-refresh toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={
              autoRefresh
                ? "rounded-md bg-primary/10 px-3 py-2 text-xs font-medium text-primary transition-colors"
                : "rounded-md bg-muted px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            }
          >
            {autoRefresh ? "Auto: ON" : "Auto: OFF"}
          </button>

          {/* Manual refresh */}
          <button
            onClick={() => fetchData()}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
          >
            {refreshing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Refresh
          </button>
        </div>
      </div>

      {/* ── Error ───────────────────────────────────────────── */}
      {error && (
        <div className="rounded-md bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* ── Loading skeleton ────────────────────────────────── */}
      {loading ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-64 animate-pulse rounded-lg border border-border bg-card"
            />
          ))}
        </div>
      ) : (
        <>
          {/* ── Row 1: Quote + Health + Candle info ──────────── */}
          <div className="grid gap-4 lg:grid-cols-3">
            <QuotePanel quote={snapshot?.quote ?? null} />
            <FeedHealthPanel
              health={snapshot?.health ?? null}
              adapterName="mock"
            />
            <CandleInfo
              count={snapshot?.recentCandles.length ?? 0}
              timeframe={timeframe}
              instrument={instrument}
              lastCandle={
                snapshot?.recentCandles[snapshot.recentCandles.length - 1] ?? null
              }
            />
          </div>

          {/* ── Row 2: Levels + Stream ──────────────────────── */}
          <div className="grid gap-4 lg:grid-cols-2">
            <SessionLevelsPanel
              levels={snapshot?.levels ?? null}
              currentPrice={snapshot?.quote.lastPrice ?? null}
            />
            <StreamLog entries={snapshot?.streamLog ?? []} />
          </div>
        </>
      )}
    </div>
  );
}

// ─── Small inline component for candle summary ───────────────

function CandleInfo({
  count,
  timeframe,
  instrument,
  lastCandle,
}: {
  count: number;
  timeframe: string;
  instrument: string;
  lastCandle: { open: number; high: number; low: number; close: number; volume: number; timestamp: string } | null;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Candle Data
      </p>

      <div className="mt-3 space-y-2.5">
        <InfoRow label="Instrument" value={instrument} />
        <InfoRow label="Timeframe" value={timeframe} />
        <InfoRow label="Candles loaded" value={String(count)} />

        {lastCandle && (
          <>
            <div className="border-t border-border pt-2">
              <p className="text-[10px] font-medium uppercase text-muted-foreground/50">
                Latest candle
              </p>
            </div>
            <InfoRow label="Open" value={fmt(lastCandle.open)} />
            <InfoRow label="High" value={fmt(lastCandle.high)} />
            <InfoRow label="Low" value={fmt(lastCandle.low)} />
            <InfoRow label="Close" value={fmt(lastCandle.close)} />
            <InfoRow label="Volume" value={lastCandle.volume.toLocaleString()} />
          </>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-xs font-medium text-foreground/80">
        {value}
      </span>
    </div>
  );
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
