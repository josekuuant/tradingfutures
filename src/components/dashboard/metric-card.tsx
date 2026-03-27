import { cn } from "@/lib/utils";
import { type LucideIcon } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  subtitle?: string;
  trend?: "up" | "down" | "flat";
}

export function MetricCard({
  label,
  value,
  icon: Icon,
  subtitle,
  trend,
}: MetricCardProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <Icon className="h-4 w-4 text-muted-foreground/50" />
      </div>
      <p
        className={cn(
          "mt-2 text-2xl font-bold tabular-nums tracking-tight",
          trend === "up" && "text-success",
          trend === "down" && "text-danger",
          !trend && "text-foreground"
        )}
      >
        {value}
      </p>
      {subtitle && (
        <p className="mt-1 text-xs text-muted-foreground/70">{subtitle}</p>
      )}
    </div>
  );
}
