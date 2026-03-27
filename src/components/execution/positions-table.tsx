import { cn } from "@/lib/utils";
import type { NormalizedPosition as Position } from "@/types/execution";

interface PositionsTableProps {
  positions: Position[];
}

export function PositionsTable({ positions }: PositionsTableProps) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Open Positions
        </p>
      </div>

      {positions.length === 0 ? (
        <div className="flex h-24 items-center justify-center">
          <p className="text-sm text-muted-foreground/50">No open positions</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50 text-[10px] uppercase text-muted-foreground/50">
                <th className="px-4 py-2 text-left font-medium">Instrument</th>
                <th className="px-4 py-2 text-left font-medium">Side</th>
                <th className="px-4 py-2 text-right font-medium">Qty</th>
                <th className="px-4 py-2 text-right font-medium">Avg Price</th>
                <th className="px-4 py-2 text-right font-medium">Current</th>
                <th className="px-4 py-2 text-right font-medium">Unreal. P&L</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {positions.map((p) => (
                <tr key={p.id} className="hover:bg-accent/20">
                  <td className="px-4 py-2.5 font-medium">{p.instrument}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
                        p.side === "long"
                          ? "bg-success/10 text-success"
                          : p.side === "short"
                            ? "bg-danger/10 text-danger"
                            : "bg-muted text-muted-foreground"
                      )}
                    >
                      {p.side}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {p.quantity}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                    {p.avgPrice.toFixed(2)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                    {p.currentPrice.toFixed(2)}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-2.5 text-right font-mono tabular-nums font-medium",
                      p.unrealizedPnl >= 0 ? "text-success" : "text-danger"
                    )}
                  >
                    {p.unrealizedPnl >= 0 ? "+" : ""}
                    {p.unrealizedPnl.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
