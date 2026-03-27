import { cn } from "@/lib/utils";
import { AlertTriangle, Info, XCircle } from "lucide-react";

type AlertSeverity = "info" | "warning" | "error";

interface AlertItem {
  id: string;
  severity: AlertSeverity;
  message: string;
  timestamp?: string;
}

interface AlertsCardProps {
  alerts: AlertItem[];
}

const SEVERITY_CONFIG: Record<
  AlertSeverity,
  { icon: typeof Info; iconClass: string; bgClass: string }
> = {
  info: {
    icon: Info,
    iconClass: "text-primary",
    bgClass: "bg-primary/5",
  },
  warning: {
    icon: AlertTriangle,
    iconClass: "text-warning",
    bgClass: "bg-warning/5",
  },
  error: {
    icon: XCircle,
    iconClass: "text-danger",
    bgClass: "bg-danger/5",
  },
};

export function AlertsCard({ alerts }: AlertsCardProps) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          System Alerts
        </p>
        {alerts.length > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-warning/10 px-1.5 text-xs font-medium text-warning">
            {alerts.length}
          </span>
        )}
      </div>

      {alerts.length === 0 ? (
        <div className="flex h-24 items-center justify-center">
          <p className="text-sm text-muted-foreground/50">
            All systems operational
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border/50">
          {alerts.map((alert) => {
            const config = SEVERITY_CONFIG[alert.severity];
            const Icon = config.icon;

            return (
              <div
                key={alert.id}
                className={cn(
                  "flex items-start gap-3 px-4 py-3",
                  config.bgClass
                )}
              >
                <Icon
                  className={cn("mt-0.5 h-4 w-4 shrink-0", config.iconClass)}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground/90">{alert.message}</p>
                  {alert.timestamp && (
                    <p className="mt-0.5 text-xs text-muted-foreground/60">
                      {alert.timestamp}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
