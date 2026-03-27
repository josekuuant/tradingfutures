import { cn } from "@/lib/utils";
import type { StreamEntry } from "@/types/market";

interface StreamLogProps {
  entries: StreamEntry[];
}

const TYPE_DOT: Record<StreamEntry["type"], string> = {
  quote: "bg-primary",
  trade: "bg-success",
  candle: "bg-warning",
  status: "bg-muted-foreground/50",
};

export function StreamLog({ entries }: StreamLogProps) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Stream Log
        </p>
        <span className="text-[10px] text-muted-foreground/50">
          Latest {entries.length}
        </span>
      </div>

      {entries.length === 0 ? (
        <div className="flex h-40 items-center justify-center">
          <p className="text-sm text-muted-foreground/50">
            No stream activity
          </p>
        </div>
      ) : (
        <div className="max-h-80 divide-y divide-border/30 overflow-y-auto">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-3 px-4 py-2 font-mono text-xs transition-colors hover:bg-accent/20"
            >
              <div
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  TYPE_DOT[entry.type]
                )}
              />
              <span className="shrink-0 text-muted-foreground/50">
                {formatTime(entry.timestamp)}
              </span>
              <span className="shrink-0 w-12 text-muted-foreground">
                {entry.type}
              </span>
              <span className="truncate text-foreground/80">
                {entry.message}
              </span>
            </div>
          ))}
        </div>
      )}
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
