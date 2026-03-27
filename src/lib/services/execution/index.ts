import { log } from "@/lib/logger";
import { getRawCredentials } from "@/lib/services/connections";
import { MockTradovateAdapter } from "./adapter-mock";
import type {
  TradovateAdapter,
  ExecutionMode,
  ExecutionState,
  OrderRequest,
  Order,
} from "@/types/execution";

// ─── State ───────────────────────────────────────────────────

let adapter: TradovateAdapter = new MockTradovateAdapter();
let executionMode: ExecutionMode = "monitor";
let isConnected = false;
let lastUpdated: string | null = null;

// ─── Adapter management ─────────────────────────────────────

export function getAdapterName(): string {
  return adapter.name;
}

export function setAdapter(a: TradovateAdapter): void {
  adapter = a;
  isConnected = false;
}

// ─── Mode management ────────────────────────────────────────

export function getExecutionMode(): ExecutionMode {
  return executionMode;
}

export function setExecutionMode(mode: ExecutionMode): void {
  log.execution.info(`Execution mode changed to: ${mode}`);
  executionMode = mode;
}

// ─── Connection ──────────────────────────────────────────────

export async function testConnection(): Promise<{
  ok: boolean;
  message: string;
}> {
  try {
    const creds = await getRawCredentials("tradovate");
    if (!creds || !creds.username) {
      return {
        ok: false,
        message: "Tradovate credentials not configured",
      };
    }

    const result = await adapter.connect();
    isConnected = result.ok;
    lastUpdated = new Date().toISOString();

    if (result.ok) {
      log.execution.info("Tradovate connection successful", {
        adapter: adapter.name,
      });
    } else {
      log.execution.warn(`Tradovate connection failed: ${result.message}`);
    }

    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    log.execution.error(`Connection test failed: ${msg}`);
    isConnected = false;
    return { ok: false, message: msg };
  }
}

// ─── Read-only queries ───────────────────────────────────────

export async function getExecutionState(): Promise<ExecutionState> {
  try {
    const [account, positions, orders] = await Promise.all([
      adapter.getAccount(),
      adapter.getPositions(),
      adapter.getOrders(),
    ]);

    lastUpdated = new Date().toISOString();

    return {
      mode: executionMode,
      connected: isConnected,
      environment: account.environment,
      account,
      positions,
      orders,
      lastUpdated,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    log.execution.error(`Failed to get execution state: ${msg}`);

    return {
      mode: executionMode,
      connected: false,
      environment: "sandbox",
      account: null,
      positions: [],
      orders: [],
      lastUpdated,
    };
  }
}

// ─── Order placement (gated by mode) ────────────────────────

export interface PlaceOrderResult {
  success: boolean;
  order?: Order;
  error?: string;
  requiresConfirmation?: boolean;
}

export async function placeOrder(
  request: OrderRequest
): Promise<PlaceOrderResult> {
  // Gate 1: Mode check
  if (executionMode === "disabled") {
    log.execution.warn("Order rejected: execution is disabled");
    return { success: false, error: "Execution is disabled" };
  }

  if (executionMode === "monitor") {
    log.execution.warn("Order rejected: monitor mode (read-only)");
    return { success: false, error: "Monitor mode — orders not allowed" };
  }

  if (executionMode === "manual_confirm") {
    log.execution.info("Order requires manual confirmation", {
      instrument: request.instrument,
      side: request.side,
      quantity: request.quantity,
    });
    return {
      success: false,
      requiresConfirmation: true,
      error: "Manual confirmation required. Review and confirm the order.",
    };
  }

  // Gate 2: Paper mode — execute through adapter
  if (executionMode === "paper") {
    try {
      log.execution.info(
        `Paper order: ${request.side} ${request.quantity} ${request.instrument} ${request.type}`,
        { price: request.price, stopPrice: request.stopPrice }
      );

      const order = await adapter.placeOrder(request);

      log.execution.info(`Paper order filled: ${order.id}`, {
        status: order.status,
        avgFillPrice: order.avgFillPrice,
      });

      return { success: true, order };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      log.execution.error(`Paper order failed: ${msg}`);
      return { success: false, error: msg };
    }
  }

  return { success: false, error: "Unknown execution mode" };
}

// ─── Confirm a manual order (for manual_confirm mode) ────────

export async function confirmOrder(
  request: OrderRequest
): Promise<PlaceOrderResult> {
  try {
    log.execution.info(
      `Confirmed order: ${request.side} ${request.quantity} ${request.instrument}`,
      { type: request.type, price: request.price }
    );

    const order = await adapter.placeOrder(request);

    log.execution.info(`Order executed: ${order.id}`, {
      status: order.status,
      avgFillPrice: order.avgFillPrice,
    });

    return { success: true, order };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    log.execution.error(`Confirmed order failed: ${msg}`);
    return { success: false, error: msg };
  }
}
