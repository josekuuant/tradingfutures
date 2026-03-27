"use client";

import { cn } from "@/lib/utils";
import type { SignalAction } from "@/types/signal";

export interface SignalFilters {
  action: SignalAction | "ALL";
  minConfidence: number;
  instrument: string;
  strategy: string;
  dateFrom: string;
}

interface SignalFiltersBarProps {
  filters: SignalFilters;
  onChange: (filters: SignalFilters) => void;
  strategyNames: string[];
}

const ACTION_OPTIONS: { value: SignalAction | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "BUY", label: "BUY" },
  { value: "SELL", label: "SELL" },
  { value: "NO_TRADE", label: "No Trade" },
];

export function SignalFiltersBar({
  filters,
  onChange,
  strategyNames,
}: SignalFiltersBarProps) {
  const update = (partial: Partial<SignalFilters>) =>
    onChange({ ...filters, ...partial });

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
      {/* Action filter */}
      <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5">
        {ACTION_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => update({ action: opt.value })}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-all",
              filters.action === opt.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Confidence slider */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Min confidence:</span>
        <input
          type="range"
          min={0}
          max={100}
          value={filters.minConfidence}
          onChange={(e) => update({ minConfidence: Number(e.target.value) })}
          className="h-1 w-20 accent-primary"
        />
        <span className="w-8 text-xs font-medium tabular-nums text-foreground/80">
          {filters.minConfidence}%
        </span>
      </div>

      {/* Instrument */}
      <select
        value={filters.instrument}
        onChange={(e) => update({ instrument: e.target.value })}
        className="rounded-md border border-border bg-background px-2.5 py-1 text-xs text-foreground outline-none focus:border-primary"
      >
        <option value="ALL">All instruments</option>
        <option value="NQ">NQ</option>
        <option value="MNQ">MNQ</option>
      </select>

      {/* Strategy */}
      <select
        value={filters.strategy}
        onChange={(e) => update({ strategy: e.target.value })}
        className="rounded-md border border-border bg-background px-2.5 py-1 text-xs text-foreground outline-none focus:border-primary"
      >
        <option value="ALL">All strategies</option>
        {strategyNames.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>

      {/* Date */}
      <input
        type="date"
        value={filters.dateFrom}
        onChange={(e) => update({ dateFrom: e.target.value })}
        className="rounded-md border border-border bg-background px-2.5 py-1 text-xs text-foreground outline-none focus:border-primary"
      />
    </div>
  );
}
