import { cn } from "@/lib/utils";
import type { Signal } from "@/types/signal";

interface SignalRowProps {
  signal: Signal;
  onSelect: (id: string) => void;
}

const ACTION_STYLES = {
  BUY: { bg: "bg-success/8", text: "text-success", label: "BUY" },
  SELL: { bg: "bg-danger/8", text: "text-danger", label: "SELL" },
  NO_TRADE: {
    bg: "bg-muted-foreground/8",
    text: "text-muted-foreground",
    label: "NO TRADE",
  },
} as const;

export function SignalRow({ signal, onSelect }: SignalRowProps) {
  const style = ACTION_STYLES[signal.action];
  const confidence = Math.round(signal.confidence * 100);

  return (
    <button
      onClick={() => onSelect(signal.id)}
      className="flex w-full items-center gap-4 border-b border-border/30 px-4 py-3 text-left transition-colors hover:bg-accent/30"
    >
      {/* Action badge */}
      <div
        className={cn(
          "flex h-8 w-20 shrink-0 items-center justify-center rounded-md text-xs font-bold",
          style.bg,
          style.text
        )}
      >
        {style.label}
      </div>

      {/* Confidence bar */}
      <div className="w-14 shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full",
                confidence >= 70
                  ? "bg-success"
                  : confidence >= 40
                    ? "bg-warning"
                    : "bg-muted-foreground/40"
              )}
              style={{ width: `${confidence}%` }}
            />
          </div>
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {confidence}%
          </span>
        </div>
      </div>

      {/* Instrument + timeframe */}
      <div className="w-16 shrink-0 text-xs text-muted-foreground">
        {signal.instrument} · {signal.timeframe}
      </div>

      {/* Price levels */}
      <div className="flex w-44 shrink-0 items-center gap-3 font-mono text-xs tabular-nums">
        {signal.action !== "NO_TRADE" && signal.entryPrice ? (
          <>
            <span className="text-foreground/80">
              {fmtPrice(signal.entryPrice)}
            </span>
            {signal.stopLoss && (
              <span className="text-danger/70">
                SL {fmtPrice(signal.stopLoss)}
              </span>
            )}
            {signal.takeProfit && (
              <span className="text-success/70">
                TP {fmtPrice(signal.takeProfit)}
              </span>
            )}
          </>
        ) : (
          <span className="text-muted-foreground/40">—</span>
        )}
      </div>

      {/* Reasoning (truncated) */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-foreground/70">
          {signal.reasoning}
        </p>
      </div>

      {/* Strategy */}
      <div className="w-28 shrink-0 truncate text-right text-[10px] text-muted-foreground/60">
        {signal.strategyName}
      </div>

      {/* Timestamp */}
      <div className="w-20 shrink-0 text-right text-[10px] text-muted-foreground/50">
        {formatTime(signal.createdAt)}
      </div>
    </button>
  );
}

function fmtPrice(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
