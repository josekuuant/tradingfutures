"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Zap, Loader2, RefreshCw } from "lucide-react";
import type { Signal } from "@/types/signal";
import {
  SignalFiltersBar,
  type SignalFilters,
} from "@/components/signals/signal-filters";
import { SignalStats } from "@/components/signals/signal-stats";
import { SignalRow } from "@/components/signals/signal-row";
import { SignalDetail } from "@/components/signals/signal-detail";

const DEFAULT_FILTERS: SignalFilters = {
  action: "ALL",
  minConfidence: 0,
  instrument: "ALL",
  strategy: "ALL",
  dateFrom: "",
};

export default function SignalsPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<SignalFilters>(DEFAULT_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchSignals = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/signals");
      if (res.ok) setSignals(await res.json());
      else setError("Failed to load signals");
    } catch {
      setError("Connection error — could not load signals");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSignals();
  }, [fetchSignals]);

  // Unique strategy names for filter dropdown
  const strategyNames = useMemo(
    () => Array.from(new Set(signals.map((s) => s.strategyName))),
    [signals]
  );

  // Apply filters
  const filtered = useMemo(() => {
    return signals.filter((s) => {
      if (filters.action !== "ALL" && s.action !== filters.action) return false;
      if (Math.round(s.confidence * 100) < filters.minConfidence) return false;
      if (filters.instrument !== "ALL" && s.instrument !== filters.instrument)
        return false;
      if (filters.strategy !== "ALL" && s.strategyName !== filters.strategy)
        return false;
      if (filters.dateFrom) {
        const signalDate = s.createdAt.slice(0, 10);
        if (signalDate < filters.dateFrom) return false;
      }
      return true;
    });
  }, [signals, filters]);

  const selectedSignal = selectedId
    ? signals.find((s) => s.id === selectedId) ?? null
    : null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Zap className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Signals</h2>
            <p className="text-sm text-muted-foreground">
              {signals.length} total · {filtered.length} shown
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            setLoading(true);
            fetchSignals();
          }}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Refresh
        </button>
      </div>

      {/* Stats */}
      <SignalStats signals={filtered} />

      {/* Error state */}
      {error && (
        <div className="rounded-md bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
          <button onClick={fetchSignals} className="ml-2 underline">Retry</button>
        </div>
      )}

      {/* Filters */}
      <SignalFiltersBar
        filters={filters}
        onChange={setFilters}
        strategyNames={strategyNames}
      />

      {/* Signal list */}
      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center rounded-lg border border-dashed border-border">
          <p className="text-sm text-muted-foreground">
            {signals.length === 0
              ? "No signals generated yet"
              : "No signals match current filters"}
          </p>
          {signals.length > 0 && (
            <button
              onClick={() => setFilters(DEFAULT_FILTERS)}
              className="mt-2 text-xs font-medium text-primary hover:underline"
            >
              Reset filters
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          {/* Table header */}
          <div className="flex items-center gap-4 border-b border-border bg-muted/30 px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
            <span className="w-20 shrink-0">Signal</span>
            <span className="w-14 shrink-0">Conf.</span>
            <span className="w-16 shrink-0">Instr.</span>
            <span className="w-44 shrink-0">Levels</span>
            <span className="min-w-0 flex-1">Reasoning</span>
            <span className="w-28 shrink-0 text-right">Strategy</span>
            <span className="w-20 shrink-0 text-right">Time</span>
          </div>

          {/* Rows */}
          {filtered.map((signal) => (
            <SignalRow
              key={signal.id}
              signal={signal}
              onSelect={setSelectedId}
            />
          ))}
        </div>
      )}

      {/* Detail modal */}
      {selectedSignal && (
        <SignalDetail
          signal={selectedSignal}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
