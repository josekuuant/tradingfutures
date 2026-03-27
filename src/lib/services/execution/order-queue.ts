import { log } from "@/lib/logger";
import type {
  ProposedOrder,
  OrderRequest,
  ExecutionProvider,
} from "@/types/execution";

// ─── In-memory queue ─────────────────────────────────────────

const queue: ProposedOrder[] = [];
const MAX_HISTORY = 200;

// ─── Create proposed order ───────────────────────────────────

export interface ProposeOrderInput {
  request: OrderRequest;
  provider: ExecutionProvider;
  signalId: string | null;
  signalAction: string;
  signalConfidence: number;
  signalReasoning: string;
  strategyName: string;
  guardrailsPassed: boolean;
  guardrailDetails: string;
}

export function proposeOrder(input: ProposeOrderInput): ProposedOrder {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const proposed: ProposedOrder = {
    id,
    signalId: input.signalId,
    provider: input.provider,
    instrument: input.request.instrument,
    side: input.request.side,
    type: input.request.type,
    quantity: input.request.quantity,
    price: input.request.price ?? null,
    stopPrice: input.request.stopPrice ?? null,
    status: input.guardrailsPassed ? "proposed" : "rejected",
    signalAction: input.signalAction,
    signalConfidence: input.signalConfidence,
    signalReasoning: input.signalReasoning,
    strategyName: input.strategyName,
    guardrailsPassed: input.guardrailsPassed,
    guardrailDetails: input.guardrailDetails,
    rejectionReason: input.guardrailsPassed ? "" : input.guardrailDetails,
    brokerOrderId: null,
    avgFillPrice: null,
    filledQuantity: 0,
    createdAt: now,
    updatedAt: now,
    approvedAt: null,
    submittedAt: null,
    filledAt: null,
  };

  queue.unshift(proposed);
  if (queue.length > MAX_HISTORY) queue.length = MAX_HISTORY;

  log.execution.info(
    `Order proposed: ${proposed.side} ${proposed.quantity} ${proposed.instrument} [${proposed.status}]`,
    { id, signalId: input.signalId, guardrails: input.guardrailsPassed }
  );

  return proposed;
}

// ─── Approve ─────────────────────────────────────────────────

export function approveOrder(id: string): ProposedOrder | null {
  const order = queue.find((o) => o.id === id);
  if (!order || order.status !== "proposed") return null;

  order.status = "approved";
  order.approvedAt = new Date().toISOString();
  order.updatedAt = new Date().toISOString();

  log.execution.info(`Order approved: ${id}`);
  return order;
}

// ─── Reject ──────────────────────────────────────────────────

export function rejectOrder(id: string, reason: string): ProposedOrder | null {
  const order = queue.find((o) => o.id === id);
  if (!order || (order.status !== "proposed" && order.status !== "approved")) {
    return null;
  }

  order.status = "rejected";
  order.rejectionReason = reason;
  order.updatedAt = new Date().toISOString();

  log.execution.info(`Order rejected: ${id} — ${reason}`);
  return order;
}

// ─── Cancel ──────────────────────────────────────────────────

export function cancelProposedOrder(id: string): ProposedOrder | null {
  const order = queue.find((o) => o.id === id);
  if (!order) return null;

  if (order.status === "filled" || order.status === "partially_filled") {
    return null; // Can't cancel filled orders
  }

  order.status = "cancelled";
  order.updatedAt = new Date().toISOString();

  log.execution.info(`Order cancelled: ${id}`);
  return order;
}

// ─── Mark submitted ──────────────────────────────────────────

export function markSubmitted(
  id: string,
  brokerOrderId: string
): ProposedOrder | null {
  const order = queue.find((o) => o.id === id);
  if (!order) return null;

  order.status = "submitted";
  order.brokerOrderId = brokerOrderId;
  order.submittedAt = new Date().toISOString();
  order.updatedAt = new Date().toISOString();

  log.execution.info(`Order submitted: ${id} → broker ${brokerOrderId}`);
  return order;
}

// ─── Mark filled ─────────────────────────────────────────────

export function markFilled(
  id: string,
  avgFillPrice: number,
  filledQuantity: number
): ProposedOrder | null {
  const order = queue.find((o) => o.id === id);
  if (!order) return null;

  order.status = filledQuantity >= order.quantity ? "filled" : "partially_filled";
  order.avgFillPrice = avgFillPrice;
  order.filledQuantity = filledQuantity;
  order.filledAt = new Date().toISOString();
  order.updatedAt = new Date().toISOString();

  log.execution.info(
    `Order ${order.status}: ${id} @ ${avgFillPrice} (${filledQuantity}/${order.quantity})`
  );
  return order;
}

// ─── Queries ─────────────────────────────────────────────────

export function getPendingOrders(): ProposedOrder[] {
  return queue.filter((o) => o.status === "proposed");
}

export function getApprovedOrders(): ProposedOrder[] {
  return queue.filter((o) => o.status === "approved");
}

export function getOrderQueue(limit = 50): ProposedOrder[] {
  return queue.slice(0, limit);
}

export function getProposedOrder(id: string): ProposedOrder | null {
  return queue.find((o) => o.id === id) ?? null;
}

export function getQueueStats(): {
  pending: number;
  approved: number;
  submitted: number;
  filled: number;
  rejected: number;
  cancelled: number;
} {
  return {
    pending: queue.filter((o) => o.status === "proposed").length,
    approved: queue.filter((o) => o.status === "approved").length,
    submitted: queue.filter((o) => o.status === "submitted" || o.status === "acknowledged").length,
    filled: queue.filter((o) => o.status === "filled" || o.status === "partially_filled").length,
    rejected: queue.filter((o) => o.status === "rejected").length,
    cancelled: queue.filter((o) => o.status === "cancelled").length,
  };
}
