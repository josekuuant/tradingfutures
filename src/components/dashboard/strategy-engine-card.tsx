import { cn } from "@/lib/utils";
import { Cpu, Power } from "lucide-react";

interface StrategyEngineCardProps {
  isRunning: boolean;
  activeStrategy?: string;
  lastRunAt?: string;
  interval?: string;
}

export function StrategyEngineCard({
  isRunning,
  activeStrategy,
  lastRunAt,
  interval,
}: StrategyEngineCardProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Strategy Engine
      </p>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-lg",
              isRunning ? "bg-primary/10" : "bg-muted"
            )}
          >
            <Cpu
              className={cn(
                "h-5 w-5",
                isRunning ? "text-primary" : "text-muted-foreground"
              )}
            />
          </div>
          <div>
            <p className="text-sm font-medium">
              {isRunning ? "Active" : "Idle"}
            </p>
            <p className="text-xs text-muted-foreground/70">
              {activeStrategy
                ? `Running: ${activeStrategy}`
                : "No strategy selected"}
            </p>
          </div>
        </div>

        <div
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full",
            isRunning
              ? "bg-success/10 text-success"
              : "bg-muted text-muted-foreground"
          )}
        >
          <Power className="h-4 w-4" />
        </div>
      </div>

      {(lastRunAt || interval) && (
        <div className="mt-3 flex items-center gap-4 border-t border-border pt-3">
          {lastRunAt && (
            <span className="text-xs text-muted-foreground">
              Last run: {lastRunAt}
            </span>
          )}
          {interval && (
            <span className="text-xs text-muted-foreground">
              Interval: {interval}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
