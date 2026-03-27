import type { Signal } from "@/types/signal";
import { Zap, TrendingUp, Ban, BarChart3 } from "lucide-react";

interface SignalStatsProps {
  signals: Signal[];
}

export function SignalStats({ signals }: SignalStatsProps) {
  const total = signals.length;
  const buys = signals.filter((s) => s.action === "BUY").length;
  const sells = signals.filter((s) => s.action === "SELL").length;
  const noTrades = signals.filter((s) => s.action === "NO_TRADE").length;
  const avgConfidence =
    total > 0
      ? Math.round(
          (signals.reduce((sum, s) => sum + s.confidence, 0) / total) * 100
        )
      : 0;

  const stats = [
    { label: "Total", value: total, icon: Zap, color: "text-foreground" },
    { label: "BUY", value: buys, icon: TrendingUp, color: "text-success" },
    { label: "SELL", value: sells, icon: BarChart3, color: "text-danger" },
    { label: "No Trade", value: noTrades, icon: Ban, color: "text-muted-foreground" },
    { label: "Avg Confidence", value: `${avgConfidence}%`, icon: Zap, color: "text-primary" },
  ];

  return (
    <div className="grid grid-cols-5 gap-3">
      {stats.map((s) => (
        <div
          key={s.label}
          className="rounded-lg border border-border bg-card px-4 py-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {s.label}
            </span>
            <s.icon className="h-3.5 w-3.5 text-muted-foreground/40" />
          </div>
          <p className={`mt-1 text-xl font-bold tabular-nums ${s.color}`}>
            {s.value}
          </p>
        </div>
      ))}
    </div>
  );
}
