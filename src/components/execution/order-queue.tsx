"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ProposedOrder, ProposedOrderStatus } from "@/types/execution";
import {
  Check,
  X,
  PlayCircle,
  Ban,
  Loader2,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  ShieldCheck,
  ShieldX,
} from "lucide-react";

// ─── Props ───────────────────────────────────────────────────

interface OrderQueueProps {
  orders: ProposedOrder[];
  onAction: (id: string, action: string, reason?: string) => Promise<void>;
}

// ─── Status styling ──────────────────────────────────────────

const STATUS_STYLES: Record<
  ProposedOrderStatus,
  { bg: string; text: string; label: string }
> = {
  proposed: { bg: "bg-warning/10", text: "text-warning", label: "Pending" },
  approved: { bg: "bg-primary/10", text: "text-primary", label: "Approved" },
  submitted: { bg: "bg-primary/10", text: "text-primary", label: "Submitted" },
  acknowledged: { bg: "bg-primary/10", text: "text-primary", label: "Acknowledged" },
  rejected: { bg: "bg-danger/10", text: "text-danger", label: "Rejected" },
  cancelled: { bg: "bg-muted", text: "text-muted-foreground", label: "Cancelled" },
  filled: { bg: "bg-success/10", text: "text-success", label: "Filled" },
  partially_filled: { bg: "bg-success/10", text: "text-success", label: "Partial Fill" },
};

// ─── Component ───────────────────────────────────────────────

export function OrderQueue({ orders, onAction }: OrderQueueProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const pending = orders.filter((o) => o.status === "proposed");
  const history = orders.filter((o) => o.status !== "proposed");

  const handleAction = async (id: string, action: string, reason?: string) => {
    setLoadingId(id);
    await onAction(id, action, reason);
    setLoadingId(null);
  };

  return (
    <div className="space-y-4">
      {/* Pending orders */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-warning animate-pulse" />
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Pending Approval
            </p>
          </div>
          <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-bold text-warning">
            {pending.length}
          </span>
        </div>

        {pending.length === 0 ? (
          <div className="flex h-20 items-center justify-center">
            <p className="text-xs text-muted-foreground/50">
              No orders pending approval
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {pending.map((order) => (
              <PendingOrderRow
                key={order.id}
                order={order}
                loading={loadingId === order.id}
                expanded={expandedId === order.id}
                onToggle={() =>
                  setExpandedId(expandedId === order.id ? null : order.id)
                }
                onAction={handleAction}
              />
            ))}
          </div>
        )}
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Order History
            </p>
          </div>
          <div className="max-h-64 divide-y divide-border/20 overflow-y-auto">
            {history.map((order) => (
              <HistoryRow key={order.id} order={order} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Pending order row ───────────────────────────────────────

function PendingOrderRow({
  order,
  loading,
  expanded,
  onToggle,
  onAction,
}: {
  order: ProposedOrder;
  loading: boolean;
  expanded: boolean;
  onToggle: () => void;
  onAction: (id: string, action: string, reason?: string) => void;
}) {
  return (
    <div className="px-4 py-3">
      {/* Main row */}
      <div className="flex items-center justify-between">
        <button
          onClick={onToggle}
          className="flex flex-1 items-center gap-3 text-left"
        >
          <div
            className={cn(
              "flex h-8 w-14 items-center justify-center rounded text-xs font-bold",
              order.side === "buy"
                ? "bg-success/10 text-success"
                : "bg-danger/10 text-danger"
            )}
          >
            {order.side.toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                {order.quantity} {order.instrument}
              </span>
              <span className="text-xs text-muted-foreground">
                {order.type}
                {order.price ? ` @ ${order.price.toFixed(2)}` : ""}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60">
              <span>{order.strategyName}</span>
              <span>·</span>
              <span>{Math.round(order.signalConfidence * 100)}% conf</span>
              <span>·</span>
              <span>{order.provider}</span>
            </div>
          </div>
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>

        {/* Action buttons */}
        <div className="ml-3 flex items-center gap-1.5">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <>
              <button
                onClick={() => onAction(order.id, "approve_and_execute")}
                className="inline-flex items-center gap-1 rounded bg-success/10 px-2.5 py-1.5 text-[10px] font-medium text-success hover:bg-success/20"
                title="Approve & Execute"
              >
                <PlayCircle className="h-3 w-3" />
                Execute
              </button>
              <button
                onClick={() => onAction(order.id, "approve")}
                className="rounded bg-primary/10 p-1.5 text-primary hover:bg-primary/20"
                title="Approve (don't execute yet)"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => onAction(order.id, "reject", "Manual rejection")}
                className="rounded bg-danger/10 p-1.5 text-danger hover:bg-danger/20"
                title="Reject"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => onAction(order.id, "cancel")}
                className="rounded bg-muted p-1.5 text-muted-foreground hover:bg-accent"
                title="Cancel"
              >
                <Ban className="h-3 w-3" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="mt-3 space-y-2 rounded-md bg-muted/30 px-3 py-2.5">
          <DetailRow label="Signal" value={order.signalAction} />
          <DetailRow
            label="Confidence"
            value={`${Math.round(order.signalConfidence * 100)}%`}
          />
          <DetailRow label="Reasoning" value={order.signalReasoning} />
          <div className="flex items-center gap-1.5 text-[10px]">
            {order.guardrailsPassed ? (
              <ShieldCheck className="h-3 w-3 text-success" />
            ) : (
              <ShieldX className="h-3 w-3 text-danger" />
            )}
            <span
              className={
                order.guardrailsPassed
                  ? "text-success"
                  : "text-danger"
              }
            >
              {order.guardrailsPassed
                ? "All guardrails passed"
                : order.guardrailDetails}
            </span>
          </div>
          {!order.guardrailsPassed && (
            <div className="flex items-center gap-1.5 rounded bg-danger/5 px-2 py-1 text-[10px] text-danger">
              <AlertTriangle className="h-3 w-3" />
              This order was auto-rejected by guardrails
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── History row ─────────────────────────────────────────────

function HistoryRow({ order }: { order: ProposedOrder }) {
  const style = STATUS_STYLES[order.status];

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 text-xs">
      <span
        className={cn(
          "w-16 shrink-0 rounded px-1.5 py-0.5 text-center text-[10px] font-medium",
          style.bg,
          style.text
        )}
      >
        {style.label}
      </span>
      <span
        className={cn(
          "w-10 shrink-0 font-bold",
          order.side === "buy" ? "text-success" : "text-danger"
        )}
      >
        {order.side.toUpperCase()}
      </span>
      <span className="w-12 shrink-0 tabular-nums">{order.quantity}</span>
      <span className="w-16 shrink-0 font-medium">{order.instrument}</span>
      <span className="min-w-0 flex-1 truncate text-muted-foreground/60">
        {order.rejectionReason || order.signalReasoning}
      </span>
      <span className="w-14 shrink-0 text-right tabular-nums text-muted-foreground/40">
        {order.avgFillPrice?.toFixed(2) ?? "—"}
      </span>
      <span className="w-20 shrink-0 text-right text-muted-foreground/40">
        {new Date(order.createdAt).toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        })}
      </span>
    </div>
  );
}

// ─── Detail row helper ───────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-[10px]">
      <span className="w-20 shrink-0 text-muted-foreground/50">{label}</span>
      <span className="text-foreground/70">{value}</span>
    </div>
  );
}
