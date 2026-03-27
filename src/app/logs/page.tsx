"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ScrollText, RefreshCw, Loader2 } from "lucide-react";
import type { LogEntry, LogLevel, SystemHealth } from "@/types/log";
import { HealthPanel } from "@/components/logs/health-panel";
import {
  LogFiltersBar,
  type LogFilters,
} from "@/components/logs/log-filters";
import { LogList } from "@/components/logs/log-list";

const DEFAULT_FILTERS: LogFilters = {
  module: "ALL",
  minLevel: "info",
  search: "",
};

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [counts, setCounts] = useState<Record<LogLevel, number>>({
    debug: 0,
    info: 0,
    warn: 0,
    error: 0,
    critical: 0,
  });
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [filters, setFilters] = useState<LogFilters>(DEFAULT_FILTERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);

      try {
        // Build query params
        const params = new URLSearchParams();
        if (filters.module !== "ALL") params.set("module", filters.module);
        params.set("minLevel", filters.minLevel);
        if (filters.search) params.set("search", filters.search);
        params.set("limit", "200");

        const [logsRes, healthRes] = await Promise.all([
          fetch(`/api/logs?${params.toString()}`),
          fetch("/api/health"),
        ]);

        if (logsRes.ok) {
          const data = await logsRes.json();
          setLogs(data.logs);
          setCounts(data.counts);
        }
        if (healthRes.ok) {
          const data = await healthRes.json();
          setHealth(data.health);
        }
      } catch {
        if (!silent) setError("Failed to load logs");
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => fetchData(true), 3000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, fetchData]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <ScrollText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Logs & Observability</h2>
            <p className="text-sm text-muted-foreground">
              System activity, errors, and health monitoring
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={
              autoRefresh
                ? "rounded-md bg-primary/10 px-3 py-2 text-xs font-medium text-primary"
                : "rounded-md bg-muted px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
            }
          >
            {autoRefresh ? "Live: ON" : "Live: OFF"}
          </button>
          <button
            onClick={() => fetchData()}
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
      </div>

      {/* Health + summary row */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <HealthPanel health={health} />
        </div>
        <div className="lg:col-span-2 grid grid-cols-4 gap-3">
          <CountCard label="Info" count={counts.info} color="text-primary" />
          <CountCard label="Warnings" count={counts.warn} color="text-warning" />
          <CountCard label="Errors" count={counts.error} color="text-danger" />
          <CountCard
            label="Critical"
            count={counts.critical}
            color="text-danger"
            glow={counts.critical > 0}
          />
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-md bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
          <button onClick={() => fetchData()} className="ml-2 underline">Retry</button>
        </div>
      )}

      {/* Filters */}
      <LogFiltersBar
        filters={filters}
        onChange={setFilters}
        counts={counts}
      />

      {/* Log list */}
      {loading && logs.length === 0 ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <LogList logs={logs} />
      )}
    </div>
  );
}

function CountCard({
  label,
  count,
  color,
  glow,
}: {
  label: string;
  count: number;
  color: string;
  glow?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border border-border bg-card px-4 py-3 ${glow && count > 0 ? "border-danger/30 bg-danger/5" : ""}`}
    >
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>
        {count}
      </p>
    </div>
  );
}
