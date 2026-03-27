import { cn } from "@/lib/utils";
import type { MarketQuote } from "@/types/market";

interface QuotePanelProps {
  quote: MarketQuote | null;
}

export function QuotePanel({ quote }: QuotePanelProps) {
  if (!quote) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Quote
        </p>
        <div className="mt-4 flex h-20 items-center justify-center">
          <p className="text-sm text-muted-foreground/50">Awaiting data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {quote.instrument}
          </span>
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            FUTURES
          </span>
        </div>
        <span className="text-xs text-muted-foreground/60">
          {formatTime(quote.timestamp)}
        </span>
      </div>

      {/* Last price */}
      <p className="mt-3 text-4xl font-bold tabular-nums tracking-tight">
        {formatPrice(quote.lastPrice)}
      </p>

      {/* Bid / Ask / Spread */}
      <div className="mt-4 grid grid-cols-3 gap-4">
        <PriceStat label="Bid" value={quote.bidPrice} size={quote.bidSize} variant="success" />
        <PriceStat label="Ask" value={quote.askPrice} size={quote.askSize} variant="danger" />
        <div>
          <p className="text-xs text-muted-foreground">Spread</p>
          <p className="mt-1 font-mono text-sm font-medium tabular-nums">
            {quote.spread.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Volume */}
      <div className="mt-4 border-t border-border pt-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Volume</span>
          <span className="font-mono text-sm tabular-nums text-foreground/80">
            {quote.volume.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}

function PriceStat({
  label,
  value,
  size,
  variant,
}: {
  label: string;
  value: number;
  size: number;
  variant: "success" | "danger";
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 font-mono text-sm font-medium tabular-nums",
          variant === "success" ? "text-success" : "text-danger"
        )}
      >
        {formatPrice(value)}
      </p>
      <p className="text-xs text-muted-foreground/50">{size} lots</p>
    </div>
  );
}

function formatPrice(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}
