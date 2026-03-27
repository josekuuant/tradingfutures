import { cn } from "@/lib/utils";
import type { NormalizedOrder as Order, OrderStatus } from "@/types/execution";

interface OrdersTableProps {
  orders: Order[];
}

const STATUS_STYLES: Record<OrderStatus, { bg: string; text: string }> = {
  pending: { bg: "bg-warning/10", text: "text-warning" },
  working: { bg: "bg-primary/10", text: "text-primary" },
  partially_filled: { bg: "bg-primary/10", text: "text-primary" },
  filled: { bg: "bg-success/10", text: "text-success" },
  cancelled: { bg: "bg-muted", text: "text-muted-foreground" },
  rejected: { bg: "bg-danger/10", text: "text-danger" },
  expired: { bg: "bg-muted", text: "text-muted-foreground" },
};

export function OrdersTable({ orders }: OrdersTableProps) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Orders
        </p>
      </div>

      {orders.length === 0 ? (
        <div className="flex h-24 items-center justify-center">
          <p className="text-sm text-muted-foreground/50">No orders</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50 text-[10px] uppercase text-muted-foreground/50">
                <th className="px-4 py-2 text-left font-medium">ID</th>
                <th className="px-4 py-2 text-left font-medium">Instrument</th>
                <th className="px-4 py-2 text-left font-medium">Side</th>
                <th className="px-4 py-2 text-left font-medium">Type</th>
                <th className="px-4 py-2 text-right font-medium">Qty</th>
                <th className="px-4 py-2 text-right font-medium">Price</th>
                <th className="px-4 py-2 text-right font-medium">Fill</th>
                <th className="px-4 py-2 text-center font-medium">Status</th>
                <th className="px-4 py-2 text-right font-medium">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {orders.map((o) => {
                const style = STATUS_STYLES[o.status];
                return (
                  <tr key={o.id} className="hover:bg-accent/20">
                    <td className="px-4 py-2.5 font-mono text-[10px] text-muted-foreground">
                      {o.id}
                    </td>
                    <td className="px-4 py-2.5 font-medium">{o.instrument}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={cn(
                          "text-[10px] font-bold uppercase",
                          o.side === "buy" ? "text-success" : "text-danger"
                        )}
                      >
                        {o.side}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 uppercase text-muted-foreground">
                      {o.type}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {o.filledQuantity}/{o.quantity}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                      {o.price?.toFixed(2) ?? "MKT"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                      {o.avgFillPrice?.toFixed(2) ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[10px] font-medium",
                          style.bg,
                          style.text
                        )}
                      >
                        {o.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground/50">
                      {new Date(o.createdAt).toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                        hour12: false,
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
