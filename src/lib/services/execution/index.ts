import { log } from "@/lib/logger";
import { recordEvent } from "@/lib/rate-limiter";
import {
  getAdapter,
  getRegisteredProviders,
  ensureAdaptersInitialized,
} from "./provider-registry";
import {
  runGuardrails,
  recordIdempotencyKey,
  recordOrderTimestamp,
} from "./guardrails";
import {
  isCircuitOpen,
  recordSuccess,
  recordFailure,
  getBreakerState,
} from "./circuit-breaker";
import type {
  ExecutionMode,
  ExecutionProvider,
  OrderRequest,
  OrderResult,
  NormalizedOrder,
  NormalizedPosition,
  UnifiedExecutionState,
  GuardrailConfig,
  ProviderHealth,
} from "@/types/execution";
import { DEFAULT_GUARDRAILS } from "@/types/execution";

// ─── Unified state ───────────────────────────────────────────

let executionMode: ExecutionMode = "monitor";
let activeProvider: ExecutionProvider | null = null;
let guardrails: GuardrailConfig = { ...DEFAULT_GUARDRAILS };

// ─── Mode management ────────────────────────────────────────

export function getExecutionMode(): ExecutionMode {
  return executionMode;
}

export function setExecutionMode(mode: ExecutionMode): void {
  log.execution.info(`Execution mode → ${mode}`);
  executionMode = mode;
}

// ─── Provider management ────────────────────────────────────

export function getActiveProvider(): ExecutionProvider | null {
  return activeProvider;
}

export function setActiveProvider(provider: ExecutionProvider | null): void {
  activeProvider = provider;
  log.execution.info(
    `Active execution provider → ${provider ?? "none"}`
  );
}

// ─── Guardrail config ────────────────────────────────────────

export function getGuardrails(): GuardrailConfig {
  return { ...guardrails };
}

export function updateGuardrails(partial: Partial<GuardrailConfig>): void {
  guardrails = { ...guardrails, ...partial };
}

// ─── Unified state query ─────────────────────────────────────

export async function getExecutionState(): Promise<UnifiedExecutionState> {
  await ensureAdaptersInitialized();

  const providers = getRegisteredProviders();
  const healthResults: ProviderHealth[] = [];
  let accounts: UnifiedExecutionState["accounts"] = [];
  let positions: NormalizedPosition[] = [];
  let orders: NormalizedOrder[] = [];

  for (const providerName of providers) {
    const adapter = getAdapter(providerName);
    if (!adapter) continue;

    try {
      const health = await adapter.getHealth();
      healthResults.push(health);

      if (health.connected) {
        const [accts, pos, ords] = await Promise.all([
          adapter.getAccounts(),
          adapter.getPositions(),
          adapter.getOpenOrders(),
        ]);
        accounts = accounts.concat(accts);
        positions = positions.concat(pos);
        orders = orders.concat(ords);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      healthResults.push({
        provider: providerName,
        status: "down",
        connected: false,
        lastSuccessfulConnection: null,
        lastSuccessfulAuthRefresh: null,
        latencyMs: null,
        consecutiveFailures: getBreakerState(providerName).failures,
        message: msg,
      });
    }
  }

  return {
    mode: executionMode,
    activeProvider,
    providers: healthResults,
    accounts,
    positions,
    orders,
    guardrails,
    lastUpdated: new Date().toISOString(),
  };
}

// ─── Test connection ─────────────────────────────────────────

export async function testConnection(
  provider?: ExecutionProvider
): Promise<{ ok: boolean; message: string }> {
  await ensureAdaptersInitialized();

  const target = provider ?? activeProvider;
  if (!target) {
    return { ok: false, message: "No execution provider selected" };
  }

  const adapter = getAdapter(target);
  if (!adapter) {
    return { ok: false, message: `Provider ${target} not registered` };
  }

  try {
    const result = await adapter.connect();
    if (result.ok) {
      recordSuccess(target);
      log.execution.info(`${target} connection successful`);
    } else {
      recordFailure(target, guardrails.circuitBreakerThreshold);
      log.execution.warn(`${target} connection failed: ${result.message}`);
    }
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    recordFailure(target, guardrails.circuitBreakerThreshold);
    log.execution.error(`${target} connection error: ${msg}`);
    return { ok: false, message: msg };
  }
}

// ─── Order placement (unified, mode-gated) ───────────────────

export async function placeOrder(
  request: OrderRequest,
  provider?: ExecutionProvider
): Promise<OrderResult> {
  await ensureAdaptersInitialized();

  const target = provider ?? activeProvider;

  // Generate idempotency key if not provided
  if (!request.idempotencyKey) {
    request.idempotencyKey = crypto.randomUUID();
  }

  // ── Mode gates ─────────────────────────────────────────────

  if (executionMode === "disabled") {
    return {
      success: false,
      error: "Execution is disabled",
      errorCode: "DISABLED",
    };
  }

  if (executionMode === "monitor") {
    return {
      success: false,
      error: "Monitor mode — orders not allowed",
      errorCode: "MONITOR_MODE",
    };
  }

  if (executionMode === "manual_approval") {
    log.execution.info("Order queued for manual approval", {
      instrument: request.instrument,
      side: request.side,
      quantity: request.quantity,
    });
    return {
      success: false,
      requiresApproval: true,
      error: "Manual approval required",
    };
  }

  // ── Provider check ─────────────────────────────────────────

  if (!target) {
    return {
      success: false,
      error: "No execution provider selected",
      errorCode: "PROVIDER_ERROR",
    };
  }

  const adapter = getAdapter(target);
  if (!adapter) {
    return {
      success: false,
      error: `Provider ${target} not registered`,
      errorCode: "PROVIDER_ERROR",
    };
  }

  // ── Circuit breaker ────────────────────────────────────────

  if (
    isCircuitOpen(
      target,
      guardrails.circuitBreakerThreshold,
      guardrails.circuitBreakerResetSeconds
    )
  ) {
    return {
      success: false,
      error: `Circuit breaker open for ${target}. Provider unstable.`,
      errorCode: "CIRCUIT_BREAKER",
    };
  }

  // ── Guardrails ─────────────────────────────────────────────

  let positions: NormalizedPosition[] = [];
  let recentOrders: NormalizedOrder[] = [];
  try {
    [positions, recentOrders] = await Promise.all([
      adapter.getPositions(),
      adapter.getOpenOrders(),
    ]);
  } catch {
    // Best effort — run guardrails with empty data
  }

  const guardrailResult = runGuardrails(
    request,
    positions,
    recentOrders,
    guardrails,
    null // currentPrice — would need market data service
  );

  if (!guardrailResult.passed) {
    return {
      success: false,
      error: guardrailResult.error,
      errorCode: guardrailResult.errorCode,
    };
  }

  // ── Dry run mode ───────────────────────────────────────────

  if (executionMode === "dry_run") {
    log.execution.info(
      `DRY RUN: ${request.side} ${request.quantity} ${request.instrument} ${request.type}`,
      { price: request.price, stopPrice: request.stopPrice, provider: target }
    );
    return {
      success: true,
      dryRun: true,
      order: {
        id: `DRY-${crypto.randomUUID().slice(0, 8)}`,
        provider: target,
        providerOrderId: "dry-run",
        idempotencyKey: request.idempotencyKey,
        accountId: "dry-run",
        instrument: request.instrument,
        side: request.side,
        type: request.type,
        quantity: request.quantity,
        price: request.price ?? null,
        stopPrice: request.stopPrice ?? null,
        filledQuantity: 0,
        avgFillPrice: null,
        status: "pending",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };
  }

  // ── Execute (semi_auto / full_auto) ────────────────────────

  try {
    const accounts = await adapter.getAccounts();
    const accountId = accounts[0]?.id;
    if (!accountId) {
      return {
        success: false,
        error: "No account available for execution",
        errorCode: "PROVIDER_ERROR",
      };
    }

    log.execution.info(
      `Executing: ${request.side} ${request.quantity} ${request.instrument} via ${target}`,
      { type: request.type, price: request.price, accountId }
    );

    const order = await adapter.placeOrder(request, accountId);

    recordSuccess(target);
    recordIdempotencyKey(request.idempotencyKey, order.id);
    recordOrderTimestamp(request.instrument);
    recordEvent("execution-orders");

    log.execution.info(`Order placed: ${order.id} (${order.status})`, {
      provider: target,
      avgFillPrice: order.avgFillPrice,
    });

    return { success: true, order };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    recordFailure(target, guardrails.circuitBreakerThreshold);
    log.execution.error(`Order failed via ${target}: ${msg}`);
    return {
      success: false,
      error: msg,
      errorCode: "PROVIDER_ERROR",
    };
  }
}

// ─── Confirm a manual-approval order ─────────────────────────

export async function confirmOrder(
  request: OrderRequest,
  provider?: ExecutionProvider
): Promise<OrderResult> {
  // Temporarily override mode to semi_auto for this one order
  const prevMode = executionMode;
  executionMode = "semi_auto";
  const result = await placeOrder(request, provider);
  executionMode = prevMode;
  return result;
}

// ─── Cancel order ────────────────────────────────────────────

export async function cancelOrder(
  orderId: string,
  provider?: ExecutionProvider
): Promise<{ ok: boolean; message: string }> {
  const target = provider ?? activeProvider;
  if (!target) return { ok: false, message: "No provider selected" };

  const adapter = getAdapter(target);
  if (!adapter) return { ok: false, message: `Provider ${target} not registered` };

  try {
    const result = await adapter.cancelOrder(orderId);
    log.execution.info(`Cancel order ${orderId} via ${target}: ${result.message}`);
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    log.execution.error(`Cancel order failed: ${msg}`);
    return { ok: false, message: msg };
  }
}

// ─── Flatten position ────────────────────────────────────────

export async function flattenPosition(
  instrument: string,
  provider?: ExecutionProvider
): Promise<OrderResult> {
  const target = provider ?? activeProvider;
  if (!target) {
    return { success: false, error: "No provider selected", errorCode: "PROVIDER_ERROR" };
  }

  const adapter = getAdapter(target);
  if (!adapter) {
    return { success: false, error: `Provider ${target} not registered`, errorCode: "PROVIDER_ERROR" };
  }

  try {
    const accounts = await adapter.getAccounts();
    const accountId = accounts[0]?.id;
    if (!accountId) {
      return { success: false, error: "No account", errorCode: "PROVIDER_ERROR" };
    }

    log.execution.info(`Flatten ${instrument} via ${target}`);
    const order = await adapter.flattenPosition(instrument, accountId);
    return { success: true, order };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    log.execution.error(`Flatten failed: ${msg}`);
    return { success: false, error: msg, errorCode: "PROVIDER_ERROR" };
  }
}

// ─── Re-exports for API compatibility ────────────────────────

export { ensureAdaptersInitialized } from "./provider-registry";
export { registerAdapter, getAdapter as getProviderAdapter } from "./provider-registry";
