import { cn } from "@/lib/utils";

type ConnectionStatus = "connected" | "disconnected" | "idle";

interface ConnectionCardProps {
  name: string;
  description: string;
  status: ConnectionStatus;
  detail?: string;
}

const STATUS_CONFIG: Record<
  ConnectionStatus,
  { label: string; dotClass: string; textClass: string }
> = {
  connected: {
    label: "Connected",
    dotClass: "bg-success shadow-[0_0_6px_hsl(var(--success))]",
    textClass: "text-success",
  },
  disconnected: {
    label: "Disconnected",
    dotClass: "bg-danger shadow-[0_0_6px_hsl(var(--danger))]",
    textClass: "text-danger",
  },
  idle: {
    label: "Not configured",
    dotClass: "bg-muted-foreground/40",
    textClass: "text-muted-foreground",
  },
};

export function ConnectionCard({
  name,
  description,
  status,
  detail,
}: ConnectionCardProps) {
  const config = STATUS_CONFIG[status];

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium">{name}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className={cn("h-2 w-2 rounded-full", config.dotClass)} />
          <span className={cn("text-xs font-medium", config.textClass)}>
            {config.label}
          </span>
        </div>
      </div>
      {detail && (
        <p className="mt-3 text-xs text-muted-foreground/70">{detail}</p>
      )}
    </div>
  );
}
