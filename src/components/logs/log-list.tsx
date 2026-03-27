"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { LogEntry, LogLevel } from "@/types/log";
import { ChevronDown, ChevronRight } from "lucide-react";

interface LogListProps {
  logs: LogEntry[];
}

const LEVEL_STYLES: Record<LogLevel, { dot: string; text: string }> = {
  debug: { dot: "bg-muted-foreground/30", text: "text-muted-foreground/50" },
  info: { dot: "bg-primary/60", text: "text-foreground/70" },
  warn: { dot: "bg-warning", text: "text-warning" },
  error: { dot: "bg-danger", text: "text-danger" },
  critical: { dot: "bg-danger shadow-[0_0_4px_hsl(var(--danger))]", text: "text-danger font-bold" },
};

const MODULE_COLORS: Record<string, string> = {
  market: "text-primary/70",
  claude: "text-[#8b5cf6]",
  engine: "text-success/70",
  strategy: "text-warning/70",
  execution: "text-[#ec4899]",
  system: "text-muted-foreground",
};

export function LogList({ logs }: LogListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (logs.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border">
        <p className="text-sm text-muted-foreground/50">No logs match filters</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {logs.map((entry) => {
        const style = LEVEL_STYLES[entry.level];
        const moduleColor = MODULE_COLORS[entry.module] ?? "text-muted-foreground";
        const hasPayload = entry.payload && Object.keys(entry.payload).length > 0;
        const isExpanded = expandedId === entry.id;

        return (
          <div key={entry.id} className="border-b border-border/20 last:border-0">
            <div
              className={cn(
                "flex items-start gap-3 px-4 py-2 transition-colors",
                hasPayload && "cursor-pointer hover:bg-accent/20",
                entry.level === "critical" && "bg-danger/5"
              )}
              onClick={() => hasPayload && setExpandedId(isExpanded ? null : entry.id)}
            >
              {/* Level dot */}
              <div className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", style.dot)} />

              {/* Timestamp */}
              <span className="w-16 shrink-0 font-mono text-[10px] text-muted-foreground/40 tabular-nums pt-0.5">
                {formatTime(entry.timestamp)}
              </span>

              {/* Level */}
              <span className={cn("w-12 shrink-0 text-[10px] font-medium uppercase pt-0.5", style.text)}>
                {entry.level}
              </span>

              {/* Module */}
              <span className={cn("w-16 shrink-0 text-[10px] font-medium capitalize pt-0.5", moduleColor)}>
                {entry.module}
              </span>

              {/* Message */}
              <span className="min-w-0 flex-1 text-xs text-foreground/80 leading-relaxed">
                {entry.message}
              </span>

              {/* Expand indicator */}
              {hasPayload && (
                <div className="shrink-0 pt-0.5">
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3 text-muted-foreground/40" />
                  ) : (
                    <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
                  )}
                </div>
              )}
            </div>

            {/* Expanded payload */}
            {isExpanded && hasPayload && (
              <div className="border-t border-border/10 bg-muted/20 px-4 py-2">
                <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-foreground/60">
                  {formatPayload(entry.payload!)}
                </pre>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatPayload(payload: Record<string, unknown>): string {
  // Mask sensitive fields
  const safe = { ...payload };
  for (const key of Object.keys(safe)) {
    if (
      key.toLowerCase().includes("key") ||
      key.toLowerCase().includes("secret") ||
      key.toLowerCase().includes("password") ||
      key.toLowerCase().includes("token")
    ) {
      safe[key] = "••••••••";
    }
    // Truncate very long values
    if (typeof safe[key] === "string" && (safe[key] as string).length > 500) {
      safe[key] = (safe[key] as string).slice(0, 500) + "... (truncated)";
    }
  }
  return JSON.stringify(safe, null, 2);
}
