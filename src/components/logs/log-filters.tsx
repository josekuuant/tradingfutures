"use client";

import { cn } from "@/lib/utils";
import { LOG_MODULES, LOG_LEVELS, type LogModule, type LogLevel } from "@/types/log";
import { Search } from "lucide-react";

export interface LogFilters {
  module: LogModule | "ALL";
  minLevel: LogLevel;
  search: string;
}

interface LogFiltersBarProps {
  filters: LogFilters;
  onChange: (filters: LogFilters) => void;
  counts: Record<LogLevel, number>;
}

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: "text-muted-foreground/50",
  info: "text-foreground/70",
  warn: "text-warning",
  error: "text-danger",
  critical: "text-danger font-bold",
};

export function LogFiltersBar({
  filters,
  onChange,
  counts,
}: LogFiltersBarProps) {
  const update = (partial: Partial<LogFilters>) =>
    onChange({ ...filters, ...partial });

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
      {/* Module selector */}
      <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5">
        <button
          onClick={() => update({ module: "ALL" })}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-all",
            filters.module === "ALL"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          All
        </button>
        {LOG_MODULES.map((mod) => (
          <button
            key={mod}
            onClick={() => update({ module: mod })}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-all",
              filters.module === mod
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {mod}
          </button>
        ))}
      </div>

      {/* Level selector */}
      <select
        value={filters.minLevel}
        onChange={(e) => update({ minLevel: e.target.value as LogLevel })}
        className="rounded-md border border-border bg-background px-2.5 py-1 text-xs text-foreground outline-none focus:border-primary"
      >
        {LOG_LEVELS.map((lvl) => (
          <option key={lvl} value={lvl}>
            {lvl.toUpperCase()} + ({counts[lvl]})
          </option>
        ))}
      </select>

      {/* Search */}
      <div className="relative flex-1">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/40" />
        <input
          type="text"
          value={filters.search}
          onChange={(e) => update({ search: e.target.value })}
          placeholder="Search logs..."
          className="w-full rounded-md border border-border bg-background py-1 pl-8 pr-3 text-xs text-foreground outline-none placeholder:text-muted-foreground/40 focus:border-primary"
        />
      </div>

      {/* Level counts */}
      <div className="flex items-center gap-2">
        {(["error", "warn", "info"] as const).map((lvl) => (
          <span
            key={lvl}
            className={cn("text-[10px] font-medium tabular-nums", LEVEL_COLORS[lvl])}
          >
            {counts[lvl]} {lvl}
          </span>
        ))}
      </div>
    </div>
  );
}
