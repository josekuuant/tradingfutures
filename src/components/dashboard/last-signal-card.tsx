import { cn } from "@/lib/utils";
import { Minus } from "lucide-react";

type SignalAction = "BUY" | "SELL" | "NO_TRADE" | null;

interface LastSignalCardProps {
  action: SignalAction;
  confidence?: number;
  instrument?: string;
  timeframe?: string;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  reasoning?: string;
  timestamp?: string;
}

const SIGNAL_STYLES: Record<
  Exclude<SignalAction, null>,
  { bg: string; border: string; text: string; glow: string }
> = {
  BUY: {
    bg: "bg-success/5",
    border: "border-success/20",
    text: "text-success",
    glow: "shadow-[0_0_20px_-4px_hsl(var(--success)/0.15)]",
  },
  SELL: {
    bg: "bg-danger/5",
    border: "border-danger/20",
    text: "text-danger",
    glow: "shadow-[0_0_20px_-4px_hsl(var(--danger)/0.15)]",
  },
  NO_TRADE: {
    bg: "bg-muted/50",
    border: "border-border",
    text: "text-muted-foreground",
    glow: "",
  },
};

export function LastSignalCard({
  action,
  confidence,
  instrument = "NQ",
  timeframe,
  entryPrice,
  stopLoss,
  takeProfit,
  reasoning,
  timestamp,
}: LastSignalCardProps) {
  if (!action) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Last Signal
        </p>
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted">
            <Minus className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <p className="text-xl font-bold text-muted-foreground">
              No signals yet
            </p>
            <p className="text-sm text-muted-foreground/70">
              Run an analysis to generate the first signal
            </p>
          </div>
        </div>
      </div>
    );
  }

  const style = SIGNAL_STYLES[action];

  return (
    <div
      className={cn(
        "rounded-lg border p-6 transition-all",
        style.bg,
        style.border,
        style.glow
      )}
    >
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Last Signal
        </p>
        {timestamp && (
          <span className="text-xs text-muted-foreground">{timestamp}</span>
        )}
      </div>

      <div className="flex items-start justify-between">
        <div className="space-y-3">
          <div className="flex items-baseline gap-3">
            <span className={cn("text-3xl font-bold tracking-tight", style.text)}>
              {action.replace("_", " ")}
            </span>
            {confidence != null && (
              <span className="text-sm text-muted-foreground">
                {Math.round(confidence * 100)}% confidence
              </span>
            )}
          </div>

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>{instrument}</span>
            {timeframe && (
              <>
                <span className="text-border">·</span>
                <span>{timeframe}</span>
              </>
            )}
          </div>

          {reasoning && (
            <p className="max-w-lg text-sm leading-relaxed text-muted-foreground/80">
              {reasoning}
            </p>
          )}
        </div>

        {action !== "NO_TRADE" && entryPrice && (
          <div className="ml-6 space-y-2 text-right">
            <PriceRow label="Entry" value={entryPrice} />
            {stopLoss && <PriceRow label="SL" value={stopLoss} variant="danger" />}
            {takeProfit && (
              <PriceRow label="TP" value={takeProfit} variant="success" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PriceRow({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant?: "success" | "danger";
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-mono text-sm font-medium",
          variant === "success" && "text-success",
          variant === "danger" && "text-danger",
          !variant && "text-foreground"
        )}
      >
        {value.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
      </span>
    </div>
  );
}
