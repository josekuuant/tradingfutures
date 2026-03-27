import { cn } from "@/lib/utils";
import type { SystemHealth, HealthStatus } from "@/types/log";

interface HealthPanelProps {
  health: SystemHealth | null;
}

const STATUS_STYLES: Record<
  HealthStatus,
  { dot: string; text: string; label: string }
> = {
  healthy: {
    dot: "bg-success shadow-[0_0_6px_hsl(var(--success))]",
    text: "text-success",
    label: "Healthy",
  },
  degraded: {
    dot: "bg-warning shadow-[0_0_6px_hsl(var(--warning))]",
    text: "text-warning",
    label: "Degraded",
  },
  down: {
    dot: "bg-danger shadow-[0_0_6px_hsl(var(--danger))]",
    text: "text-danger",
    label: "Down",
  },
  unknown: {
    dot: "bg-muted-foreground/40",
    text: "text-muted-foreground",
    label: "Unknown",
  },
};

export function HealthPanel({ health }: HealthPanelProps) {
  if (!health) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          System Health
        </p>
        <div className="mt-3 flex h-16 items-center justify-center">
          <p className="text-sm text-muted-foreground/50">Loading...</p>
        </div>
      </div>
    );
  }

  const overall = STATUS_STYLES[health.overall];

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Overall */}
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className={cn("h-2.5 w-2.5 rounded-full", overall.dot)} />
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              System Health
            </p>
            <p className={cn("text-sm font-semibold", overall.text)}>
              {overall.label}
            </p>
          </div>
        </div>
        <span className="text-xs text-muted-foreground/50">
          Uptime: {health.uptime}
        </span>
      </div>

      {/* Modules */}
      <div className="divide-y divide-border/30">
        {health.modules.map((mod) => {
          const style = STATUS_STYLES[mod.status];
          return (
            <div
              key={mod.module}
              className="flex items-center justify-between px-4 py-2.5"
            >
              <div className="flex items-center gap-2.5">
                <div className={cn("h-1.5 w-1.5 rounded-full", style.dot)} />
                <span className="text-xs font-medium capitalize text-foreground/80">
                  {mod.module}
                </span>
              </div>
              <div className="flex items-center gap-3">
                {mod.errorCount > 0 && (
                  <span className="text-[10px] text-danger">
                    {mod.errorCount} errors
                  </span>
                )}
                <span className="text-[10px] text-muted-foreground/50">
                  {mod.message}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
