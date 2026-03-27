import { log } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limiter";
import type {
  OrderRequest,
  NormalizedPosition,
  NormalizedOrder,
  GuardrailConfig,
  ExecutionErrorCode,
} from "@/types/execution";

// ─── Guardrail check result ─────────────────────────────────

export interface GuardrailResult {
  passed: boolean;
  error?: string;
  errorCode?: ExecutionErrorCode;
}

// ─── Idempotency tracking ───────────────────────────────────

const processedKeys = new Map<string, string>(); // key → orderId
const MAX_IDEMPOTENCY_CACHE = 1000;

export function checkIdempotency(key: string): GuardrailResult {
  if (processedKeys.has(key)) {
    return {
      passed: false,
      error: `Duplicate order: idempotencyKey ${key} already processed`,
      errorCode: "DUPLICATE_ORDER",
    };
  }
  return { passed: true };
}

export function recordIdempotencyKey(key: string, orderId: string): void {
  processedKeys.set(key, orderId);
  // Prune old entries
  if (processedKeys.size > MAX_IDEMPOTENCY_CACHE) {
    const firstKey = processedKeys.keys().next().value;
    if (firstKey) processedKeys.delete(firstKey);
  }
}

// ─── Position limit ──────────────────────────────────────────

export function checkPositionLimit(
  request: OrderRequest,
  positions: NormalizedPosition[],
  config: GuardrailConfig
): GuardrailResult {
  const openForSymbol = positions.filter(
    (p) => p.instrument === request.instrument && p.side !== "flat"
  );

  if (openForSymbol.length >= config.maxPositionsPerSymbol) {
    return {
      passed: false,
      error: `Position limit: ${openForSymbol.length} open positions for ${request.instrument} (max ${config.maxPositionsPerSymbol})`,
      errorCode: "POSITION_LIMIT",
    };
  }
  return { passed: true };
}

// ─── Order cooldown per symbol ───────────────────────────────

const lastOrderTimestamps = new Map<string, number>();

export function checkCooldown(
  instrument: string,
  config: GuardrailConfig
): GuardrailResult {
  const lastTime = lastOrderTimestamps.get(instrument);
  if (lastTime) {
    const elapsed = (Date.now() - lastTime) / 1000;
    if (elapsed < config.orderCooldownSeconds) {
      const remaining = Math.ceil(config.orderCooldownSeconds - elapsed);
      return {
        passed: false,
        error: `Cooldown: ${remaining}s remaining for ${instrument}`,
        errorCode: "COOLDOWN",
      };
    }
  }
  return { passed: true };
}

export function recordOrderTimestamp(instrument: string): void {
  lastOrderTimestamps.set(instrument, Date.now());
}

// ─── Slippage guard ──────────────────────────────────────────

export function checkSlippage(
  request: OrderRequest,
  currentPrice: number | null,
  config: GuardrailConfig
): GuardrailResult {
  if (
    request.type !== "market" ||
    currentPrice == null ||
    request.price == null
  ) {
    return { passed: true }; // only applies to market orders with reference price
  }

  const tickSize = 0.25; // NQ tick size
  const slippageTicks =
    Math.abs(currentPrice - request.price) / tickSize;

  if (slippageTicks > config.maxSlippageTicks) {
    return {
      passed: false,
      error: `Slippage guard: ${slippageTicks.toFixed(1)} ticks > max ${config.maxSlippageTicks}`,
      errorCode: "SLIPPAGE_GUARD",
    };
  }
  return { passed: true };
}

// ─── Rate limit ──────────────────────────────────────────────

export function checkOrderRateLimit(
  config: GuardrailConfig
): GuardrailResult {
  const result = checkRateLimit("execution-orders", config.maxOrdersPerHour);
  if (!result.allowed) {
    return {
      passed: false,
      error: `Rate limit: max ${config.maxOrdersPerHour} orders/hr. Reset in ${result.resetInSeconds}s`,
      errorCode: "RATE_LIMIT",
    };
  }
  return { passed: true };
}

// ─── Duplicate order detection ───────────────────────────────

export function checkDuplicateOrder(
  request: OrderRequest,
  recentOrders: NormalizedOrder[]
): GuardrailResult {
  // Check if an identical order was placed in the last 5 seconds
  const fiveSecondsAgo = new Date(Date.now() - 5000).toISOString();

  const duplicate = recentOrders.find(
    (o) =>
      o.instrument === request.instrument &&
      o.side === request.side &&
      o.type === request.type &&
      o.quantity === request.quantity &&
      o.createdAt > fiveSecondsAgo &&
      (o.status === "working" || o.status === "pending" || o.status === "filled")
  );

  if (duplicate) {
    return {
      passed: false,
      error: `Duplicate: identical ${request.side} ${request.instrument} order exists (${duplicate.id})`,
      errorCode: "DUPLICATE_ORDER",
    };
  }
  return { passed: true };
}

// ─── Run all guardrails ──────────────────────────────────────

export function runGuardrails(
  request: OrderRequest,
  positions: NormalizedPosition[],
  recentOrders: NormalizedOrder[],
  config: GuardrailConfig,
  currentPrice: number | null
): GuardrailResult {
  const checks = [
    checkIdempotency(request.idempotencyKey ?? ""),
    checkPositionLimit(request, positions, config),
    checkCooldown(request.instrument, config),
    checkSlippage(request, currentPrice, config),
    checkOrderRateLimit(config),
    checkDuplicateOrder(request, recentOrders),
  ];

  for (const check of checks) {
    if (!check.passed) {
      log.execution.warn(`Guardrail blocked: ${check.error}`);
      return check;
    }
  }

  return { passed: true };
}
