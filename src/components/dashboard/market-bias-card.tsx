import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

type Bias = "bullish" | "bearish" | "neutral" | null;

interface MarketBiasCardProps {
  bias: Bias;
  summary?: string;
}

const BIAS_CONFIG: Record<
  Exclude<Bias, null>,
  { label: string; icon: typeof TrendingUp; color: string; bg: string }
> = {
  bullish: {
    label: "Bullish",
    icon: TrendingUp,
    color: "text-success",
    bg: "bg-success/10",
  },
  bearish: {
    label: "Bearish",
    icon: TrendingDown,
    color: "text-danger",
    bg: "bg-danger/10",
  },
  neutral: {
    label: "Neutral",
    icon: Minus,
    color: "text-muted-foreground",
    bg: "bg-muted",
  },
};

export function MarketBiasCard({ bias, summary }: MarketBiasCardProps) {
  if (!bias) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Market Bias
        </p>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
            <Minus className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Awaiting analysis
            </p>
            <p className="text-xs text-muted-foreground/60">
              No bias determined yet
            </p>
          </div>
        </div>
      </div>
    );
  }

  const config = BIAS_CONFIG[bias];
  const Icon = config.icon;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Market Bias
      </p>
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-lg",
            config.bg
          )}
        >
          <Icon className={cn("h-5 w-5", config.color)} />
        </div>
        <div>
          <p className={cn("text-sm font-semibold", config.color)}>
            {config.label}
          </p>
          {summary && (
            <p className="text-xs text-muted-foreground/70">{summary}</p>
          )}
        </div>
      </div>
    </div>
  );
}
