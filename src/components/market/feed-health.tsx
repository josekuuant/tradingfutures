import { cn } from "@/lib/utils";
import type { FeedHealth, FeedStatus } from "@/types/market";
import { Activity, Clock, Wifi } from "lucide-react";

interface FeedHealthPanelProps {
  health: FeedHealth | null;
  adapterName: string;
}

const STATUS_CONFIG: Record<
  FeedStatus,
  { label: string; color: string; dot: string }
> = {
  live: {
    label: "Live",
    color: "text-success",
    dot: "bg-success shadow-[0_0_6px_hsl(var(--success))]",
  },
  delayed: {
    label: "Delayed",
    color: "text-warning",
    dot: "bg-warning",
  },
  stale: {
    label: "Stale",
    color: "text-warning",
    dot: "bg-warning/60",
  },
  disconnected: {
    label: "Disconnected",
    color: "text-danger",
    dot: "bg-danger",
  },
};

export function FeedHealthPanel({
  health,
  adapterName,
}: FeedHealthPanelProps) {
  const status = health?.status ?? "disconnected";
  const config = STATUS_CONFIG[status];

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Feed Status
        </p>
        <div className="flex items-center gap-2">
          <div className={cn("h-2 w-2 rounded-full", config.dot)} />
          <span className={cn("text-xs font-medium", config.color)}>
            {config.label}
          </span>
        </div>
      </div>

      <div className="mt-3 space-y-2.5">
        <HealthRow
          icon={Wifi}
          label="Provider"
          value={adapterName}
        />
        <HealthRow
          icon={Activity}
          label="Latency"
          value={
            health?.latencyMs != null ? `${health.latencyMs}ms` : "—"
          }
          valueClass={
            health?.latencyMs != null && health.latencyMs > 100
              ? "text-warning"
              : undefined
          }
        />
        <HealthRow
          icon={Clock}
          label="Last update"
          value={
            health?.lastUpdateAt
              ? formatTime(health.lastUpdateAt)
              : "—"
          }
        />
        <HealthRow
          icon={Activity}
          label="Ticks received"
          value={health?.tickCount?.toLocaleString() ?? "0"}
        />
      </div>
    </div>
  );
}

function HealthRow({
  icon: Icon,
  label,
  value,
  valueClass,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground/50" />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <span className={cn("text-xs font-medium", valueClass ?? "text-foreground/80")}>
        {value}
      </span>
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
