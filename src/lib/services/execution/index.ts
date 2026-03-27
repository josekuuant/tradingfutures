import { log } from "@/lib/logger";
import { recordEvent } from "@/lib/rate-limiter";
import {
  getAdapter,
  getRegisteredProviders,
  ensureAdaptersInitialized,
} from "./provider-registry";
import {
  checkRiskControls,
  anomaly,
} from "./risk-control";
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
import { getMarketSnapshot } from "@/lib/services/market";
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
import type { Instrument } from "@/types/market";
import { DEFAULT_GUARDRAILS } from "@/types/execution";

// ─── Unified state ───────────────────────────────────────────

let executionMode: ExecutionMode = "monitor";
let activeProvider: ExecutionProvider | null = null;
let guardrails: GuardrailConfig = { ...DEFAULT_GUARDRAILS };

// ─── Mode management ────────────────────────────────────────

const VALID_MODES: ExecutionMode[] = [
  "disabled", "monitor", "dry_run", "manual_approval", "semi_auto", "full_auto",
];

export function getExecutionMode(): ExecutionMode {
  return executionMode;
}

export function setExecutionMode(mode: ExecutionMode): void {
  if (!VALID_MODES.includes(mode)) {
    log.execution.error(`Invalid execution mode rejected: ${mode}`);
    return;
  }
  log.execution.info(`Execution mode → ${mode}`);
  executionMode = mode;
}

// ─── Provider management ────────────────────────────────────

export function getActiveProvider(): ExecutionProvider | null {
  return activeProvider;
}

export function setActiveProvider(provider: ExecutionProvider | null): void {
  activeProvider = provider;
  log.execution.info(`Active execution provider → ${provider ?? "none"}`);
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
  if (!target) return { ok: false, message: "No execution provider selected" };

  const adapter = getAdapter(target);
  if (!adapter) return { ok: false, message: `Provider ${target} not registered` };

  try {
    const result = await adapter.connect();
    if (result.ok) {
      recordSuccess(target);
    } else {
      recordFailure(target, guardrails.circuitBreakerThreshold);
    }
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    recordFailure(target, guardrails.circuitBreakerThreshold);
    return { ok: false, message: msg };
  }
}

// ─── Order placement (unified, mode-gated) ───────────────────
// F1: Idempotency key generated + recorded BEFORE execution
// F2: Key generated before guardrails check
// F3: No mode mutation — uses `bypassModeGate` flag
// F6: Kill switch re-checked immediately before adapter call
// F7: currentPrice fetched from market data service

export async function placeOrder(
  request: OrderRequest,
  provider?: ExecutionProvider,
  options?: { bypassModeGate?: boolean }
): Promise<OrderResult> {
  await ensureAdaptersInitialized();

  const target = provider ?? activeProvider;
  const bypassModeGate = options?.bypassModeGate ?? false;

  // F2: Generate idempotency key FIRST, before any checks
  if (!request.idempotencyKey) {
    request.idempotencyKey = crypto.randomUUID();
  }

  // F1: Record idempotency key BEFORE execution (not after)
  // This prevents two concurrent requests from both passing the check
  recordIdempotencyKey(request.idempotencyKey, "pending");

  // ── Risk control check (runs BEFORE mode gates) ────────────

  if (target) {
    const riskCheck = checkRiskControls(target, request.instrument);
    if (!riskCheck.allowed) {
      log.execution.error(`Risk control blocked: ${riskCheck.reason}`);
      return {
        success: false,
        error: riskCheck.reason,
        errorCode: "CIRCUIT_BREAKER",
      };
    }
    if (riskCheck.forceSafeMode) {
      log.execution.warn("Risk control forcing safe mode");
      return {
        success: false,
        requiresApproval: true,
        error: `Safe mode: ${riskCheck.reason}`,
      };
    }
  }

  // ── Mode gates (skipped for confirmed orders via F3) ───────

  if (!bypassModeGate) {
    if (executionMode === "disabled") {
      return { success: false, error: "Execution is disabled", errorCode: "DISABLED" };
    }
    if (executionMode === "monitor") {
      return { success: false, error: "Monitor mode — orders not allowed", errorCode: "MONITOR_MODE" };
    }
    if (executionMode === "manual_approval") {
      log.execution.info("Order queued for manual approval", {
        instrument: request.instrument,
        side: request.side,
        quantity: request.quantity,
      });
      return { success: false, requiresApproval: true, error: "Manual approval required" };
    }
  }

  // ── Provider check ─────────────────────────────────────────

  if (!target) {
    return { success: false, error: "No execution provider selected", errorCode: "PROVIDER_ERROR" };
  }

  const adapter = getAdapter(target);
  if (!adapter) {
    return { success: false, error: `Provider ${target} not registered`, errorCode: "PROVIDER_ERROR" };
  }

  // ── Circuit breaker ────────────────────────────────────────

  if (isCircuitOpen(target, guardrails.circuitBreakerThreshold, guardrails.circuitBreakerResetSeconds)) {
    return { success: false, error: `Circuit breaker open for ${target}`, errorCode: "CIRCUIT_BREAKER" };
  }

  // ── Guardrails (F7: fetch real currentPrice) ───────────────

  let positions: NormalizedPosition[] = [];
  let recentOrders: NormalizedOrder[] = [];
  try {
    [positions, recentOrders] = await Promise.all([
      adapter.getPositions(),
      adapter.getOpenOrders(),
    ]);
  } catch {
    // Best effort
  }

  // F7: Get current price from market data for slippage check
  let currentPrice: number | null = null;
  try {
    const instrument = request.instrument as Instrument;
    if (instrument === "NQ" || instrument === "MNQ") {
      const snapshot = await getMarketSnapshot(instrument, "1m");
      currentPrice = snapshot.quote.lastPrice;
    }
  } catch {
    // Market data unavailable — slippage check will skip
  }

  const guardrailResult = runGuardrails(
    request,
    positions,
    recentOrders,
    guardrails,
    currentPrice
  );

  if (!guardrailResult.passed) {
    if (guardrailResult.errorCode === "DUPLICATE_ORDER") {
      anomaly.duplicateExecution(request.instrument, guardrailResult.error ?? "");
    } else {
      anomaly.rejection(target, guardrailResult.error ?? "Guardrail rejected");
    }
    return {
      success: false,
      error: guardrailResult.error,
      errorCode: guardrailResult.errorCode,
    };
  }

  // ── Dry run mode ───────────────────────────────────────────

  if (executionMode === "dry_run" && !bypassModeGate) {
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

  // ── F6: Re-check kill switches immediately before execution ─

  const finalRiskCheck = checkRiskControls(target, request.instrument);
  if (!finalRiskCheck.allowed) {
    log.execution.error(`Final risk check blocked: ${finalRiskCheck.reason}`);
    return { success: false, error: finalRiskCheck.reason, errorCode: "CIRCUIT_BREAKER" };
  }

  // ── Execute (semi_auto / full_auto / confirmed) ────────────

  try {
    const accounts = await adapter.getAccounts();
    const accountId = accounts[0]?.id;
    if (!accountId) {
      return { success: false, error: "No account available", errorCode: "PROVIDER_ERROR" };
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
    anomaly.rejection(target, `Provider error: ${msg}`);

    if (msg.includes("401") || msg.includes("auth") || msg.includes("token")) {
      anomaly.authFailure(target, msg);
    }

    log.execution.error(`Order failed via ${target}: ${msg}`);
    return { success: false, error: msg, errorCode: "PROVIDER_ERROR" };
  }
}

// ─── F3: Confirm order WITHOUT mutating global executionMode ─

export async function confirmOrder(
  request: OrderRequest,
  provider?: ExecutionProvider
): Promise<OrderResult> {
  // Use bypassModeGate flag instead of mutating global state
  return placeOrder(request, provider, { bypassModeGate: true });
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
  if (!target) return { success: false, error: "No provider selected", errorCode: "PROVIDER_ERROR" };

  const adapter = getAdapter(target);
  if (!adapter) return { success: false, error: `Provider ${target} not registered`, errorCode: "PROVIDER_ERROR" };

  try {
    const accounts = await adapter.getAccounts();
    const accountId = accounts[0]?.id;
    if (!accountId) return { success: false, error: "No account", errorCode: "PROVIDER_ERROR" };

    log.execution.info(`Flatten ${instrument} via ${target}`);
    const order = await adapter.flattenPosition(instrument, accountId);
    return { success: true, order };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    log.execution.error(`Flatten failed: ${msg}`);
    return { success: false, error: msg, errorCode: "PROVIDER_ERROR" };
  }
}

// ─── Re-exports ──────────────────────────────────────────────

export { ensureAdaptersInitialized } from "./provider-registry";
export { registerAdapter, getAdapter as getProviderAdapter } from "./provider-registry";

export {
  getRiskControlStatus,
  getActiveKillSwitches,
  getLockdownHistory,
  activateKillSwitch,
  deactivateKillSwitch,
  deactivateAllKillSwitches,
  getRiskConfig,
  updateRiskConfig,
  checkRiskControls,
} from "./risk-control";
