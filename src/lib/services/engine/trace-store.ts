import type { EngineRunTrace } from "@/types/engine";

/**
 * In-memory ring buffer for engine run traces.
 * Keeps recent history without DB overhead.
 * For persistent audit, signals are stored in the DB.
 */
const MAX_TRACES = 100;
const traces: EngineRunTrace[] = [];
let traceCounter = 0;

export function pushTrace(
  trace: Omit<EngineRunTrace, "id" | "timestamp">
): EngineRunTrace {
  const full: EngineRunTrace = {
    ...trace,
    id: String(++traceCounter),
    timestamp: new Date().toISOString(),
  };

  traces.unshift(full);
  if (traces.length > MAX_TRACES) {
    traces.length = MAX_TRACES;
  }

  return full;
}

export function getTraces(limit = 30): EngineRunTrace[] {
  return traces.slice(0, limit);
}

export function getLastTrace(): EngineRunTrace | null {
  return traces[0] ?? null;
}

export function getLastSuccessfulRunAt(): string | null {
  const last = traces.find(
    (t) => t.outcome === "signal_generated" || t.outcome === "filtered_out"
  );
  return last?.timestamp ?? null;
}

// ─── Stats ───────────────────────────────────────────────────

export interface EngineStats {
  totalRuns: number;
  signalsGenerated: number;
  filteredOut: number;
  errors: number;
  cooldowns: number;
  duplicates: number;
  lastRunAt: string | null;
  lastSignalAt: string | null;
  filterBreakdown: Record<string, { passed: number; skipped: number }>;
}

export function getEngineStats(): EngineStats {
  const stats: EngineStats = {
    totalRuns: traces.length,
    signalsGenerated: 0,
    filteredOut: 0,
    errors: 0,
    cooldowns: 0,
    duplicates: 0,
    lastRunAt: traces[0]?.timestamp ?? null,
    lastSignalAt: null,
    filterBreakdown: {},
  };

  for (const trace of traces) {
    switch (trace.outcome) {
      case "signal_generated":
        stats.signalsGenerated++;
        if (!stats.lastSignalAt) stats.lastSignalAt = trace.timestamp;
        break;
      case "filtered_out":
        stats.filteredOut++;
        break;
      case "error":
        stats.errors++;
        break;
      case "cooldown":
        stats.cooldowns++;
        break;
      case "duplicate":
        stats.duplicates++;
        break;
    }

    if (trace.filterReport) {
      for (const r of trace.filterReport.results) {
        if (!stats.filterBreakdown[r.filter]) {
          stats.filterBreakdown[r.filter] = { passed: 0, skipped: 0 };
        }
        if (r.verdict === "pass") {
          stats.filterBreakdown[r.filter].passed++;
        } else {
          stats.filterBreakdown[r.filter].skipped++;
        }
      }
    }
  }

  return stats;
}
