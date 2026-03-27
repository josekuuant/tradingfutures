import { cn } from "@/lib/utils";
import type { SessionLevels } from "@/types/market";

interface SessionLevelsPanelProps {
  levels: SessionLevels | null;
  currentPrice: number | null;
}

interface LevelRow {
  label: string;
  value: number | null;
  category: "session" | "overnight" | "previous" | "derived";
}

const CATEGORY_DOT: Record<string, string> = {
  session: "bg-primary",
  overnight: "bg-warning",
  previous: "bg-muted-foreground/50",
  derived: "bg-success",
};

export function SessionLevelsPanel({
  levels,
  currentPrice,
}: SessionLevelsPanelProps) {
  if (!levels) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Key Levels
          </p>
        </div>
        <div className="flex h-48 items-center justify-center">
          <p className="text-sm text-muted-foreground/50">Awaiting data...</p>
        </div>
      </div>
    );
  }

  const rows: LevelRow[] = [
    { label: "Session High", value: levels.sessionHigh, category: "session" },
    { label: "Opening Range High", value: levels.openingRangeHigh, category: "session" },
    { label: "VWAP", value: levels.vwap, category: "derived" },
    { label: "Opening Range Low", value: levels.openingRangeLow, category: "session" },
    { label: "Session Low", value: levels.sessionLow, category: "session" },
    { label: "Overnight High", value: levels.overnightHigh, category: "overnight" },
    { label: "Overnight Low", value: levels.overnightLow, category: "overnight" },
    { label: "Prev Day High", value: levels.previousDayHigh, category: "previous" },
    { label: "Prev Day Close", value: levels.previousDayClose, category: "previous" },
    { label: "Prev Day Low", value: levels.previousDayLow, category: "previous" },
  ];

  // Sort non-null values descending by price
  const withValues = rows.filter((r) => r.value != null);
  const withoutValues = rows.filter((r) => r.value == null);
  withValues.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Key Levels
        </p>
        {currentPrice != null && (
          <span className="font-mono text-xs text-muted-foreground">
            Price:{" "}
            <span className="text-foreground">{formatPrice(currentPrice)}</span>
          </span>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 border-b border-border/50 px-4 py-2">
        {Object.entries({
          session: "Session",
          overnight: "Overnight",
          previous: "Previous Day",
          derived: "Derived",
        }).map(([key, label]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className={cn("h-1.5 w-1.5 rounded-full", CATEGORY_DOT[key])} />
            <span className="text-[10px] text-muted-foreground/60">{label}</span>
          </div>
        ))}
      </div>

      <div className="divide-y divide-border/30">
        {withValues.map((row) => {
          const nearCurrent =
            currentPrice != null &&
            row.value != null &&
            Math.abs(row.value - currentPrice) / currentPrice < 0.001;

          return (
            <div
              key={row.label}
              className={cn(
                "flex items-center justify-between px-4 py-2 transition-colors",
                nearCurrent && "bg-accent/40"
              )}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    CATEGORY_DOT[row.category]
                  )}
                />
                <span className="text-sm text-foreground/80">{row.label}</span>
              </div>
              <span className="font-mono text-sm font-medium tabular-nums">
                {formatPrice(row.value!)}
              </span>
            </div>
          );
        })}

        {withoutValues.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between px-4 py-2 opacity-40"
          >
            <div className="flex items-center gap-2.5">
              <div
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  CATEGORY_DOT[row.category]
                )}
              />
              <span className="text-sm text-foreground/80">{row.label}</span>
            </div>
            <span className="font-mono text-sm text-muted-foreground">—</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatPrice(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
