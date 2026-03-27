import { log } from "@/lib/logger";
import type {
  ProposedOrder,
  ProposedOrderStatus,
  OrderRequest,
  ExecutionProvider,
} from "@/types/execution";

// ─── In-memory queue ─────────────────────────────────────────

const queue: (ProposedOrder & { _version: number })[] = [];
const MAX_HISTORY = 200;

// ─── Valid status transitions (F8: explicit state machine) ───

const VALID_TRANSITIONS: Record<ProposedOrderStatus, ProposedOrderStatus[]> = {
  proposed: ["approved", "rejected", "cancelled"],
  approved: ["submitted", "rejected", "cancelled"],
  submitted: ["acknowledged", "filled", "partially_filled", "rejected", "cancelled"],
  acknowledged: ["filled", "partially_filled", "cancelled"],
  rejected: [],
  cancelled: [],
  filled: [],
  partially_filled: ["filled"],
};

function canTransition(from: ProposedOrderStatus, to: ProposedOrderStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// F8: Atomic find-and-transition with version check
function transitionOrder(
  id: string,
  expectedStatus: ProposedOrderStatus | ProposedOrderStatus[],
  newStatus: ProposedOrderStatus,
  updates: Partial<ProposedOrder> = {}
): ProposedOrder | null {
  const order = queue.find((o) => o.id === id);
  if (!order) return null;

  const allowed = Array.isArray(expectedStatus)
    ? expectedStatus.includes(order.status)
    : order.status === expectedStatus;

  if (!allowed) {
    log.execution.warn(
      `Order ${id} transition rejected: ${order.status} → ${newStatus} (expected ${expectedStatus})`
    );
    return null;
  }

  if (!canTransition(order.status, newStatus)) {
    log.execution.warn(
      `Invalid transition: ${order.status} → ${newStatus} for order ${id}`
    );
    return null;
  }

  // Apply transition atomically
  order.status = newStatus;
  order.updatedAt = new Date().toISOString();
  order._version++;
  Object.assign(order, updates);

  return order;
}

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

  const proposed = {
    id,
    signalId: input.signalId,
    provider: input.provider,
    instrument: input.request.instrument,
    side: input.request.side,
    type: input.request.type,
    quantity: input.request.quantity,
    price: input.request.price ?? null,
    stopPrice: input.request.stopPrice ?? null,
    status: (input.guardrailsPassed ? "proposed" : "rejected") as ProposedOrderStatus,
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
    _version: 0,
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
  const result = transitionOrder(id, "proposed", "approved", {
    approvedAt: new Date().toISOString(),
  });
  if (result) log.execution.info(`Order approved: ${id}`);
  return result;
}

// ─── Reject ──────────────────────────────────────────────────

export function rejectOrder(id: string, reason: string): ProposedOrder | null {
  const result = transitionOrder(id, ["proposed", "approved"], "rejected", {
    rejectionReason: reason,
  });
  if (result) log.execution.info(`Order rejected: ${id} — ${reason}`);
  return result;
}

// ─── Cancel ──────────────────────────────────────────────────

export function cancelProposedOrder(id: string): ProposedOrder | null {
  const result = transitionOrder(
    id,
    ["proposed", "approved", "submitted", "acknowledged"],
    "cancelled"
  );
  if (result) log.execution.info(`Order cancelled: ${id}`);
  return result;
}

// ─── Mark submitted ──────────────────────────────────────────

export function markSubmitted(
  id: string,
  brokerOrderId: string
): ProposedOrder | null {
  const result = transitionOrder(id, "approved", "submitted", {
    brokerOrderId,
    submittedAt: new Date().toISOString(),
  });
  if (result) log.execution.info(`Order submitted: ${id} → broker ${brokerOrderId}`);
  return result;
}

// ─── Mark filled ─────────────────────────────────────────────

export function markFilled(
  id: string,
  avgFillPrice: number,
  filledQuantity: number
): ProposedOrder | null {
  const order = queue.find((o) => o.id === id);
  if (!order) return null;

  const newStatus: ProposedOrderStatus =
    filledQuantity >= order.quantity ? "filled" : "partially_filled";

  const result = transitionOrder(
    id,
    ["submitted", "acknowledged", "partially_filled"],
    newStatus,
    { avgFillPrice, filledQuantity, filledAt: new Date().toISOString() }
  );

  if (result) {
    log.execution.info(
      `Order ${newStatus}: ${id} @ ${avgFillPrice} (${filledQuantity}/${order.quantity})`
    );
  }
  return result;
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
