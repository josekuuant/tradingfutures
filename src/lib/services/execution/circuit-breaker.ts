import { log } from "@/lib/logger";
import type { ExecutionProvider } from "@/types/execution";

// ─── Circuit breaker state ───────────────────────────────────

type BreakerState = "closed" | "open" | "half_open";

interface BreakerEntry {
  state: BreakerState;
  consecutiveFailures: number;
  lastFailureAt: number | null;
  lastSuccessAt: number | null;
  openedAt: number | null;
}

const breakers = new Map<ExecutionProvider, BreakerEntry>();

function getBreaker(provider: ExecutionProvider): BreakerEntry {
  if (!breakers.has(provider)) {
    breakers.set(provider, {
      state: "closed",
      consecutiveFailures: 0,
      lastFailureAt: null,
      lastSuccessAt: null,
      openedAt: null,
    });
  }
  return breakers.get(provider)!;
}

// ─── Public API ──────────────────────────────────────────────

export function isCircuitOpen(
  provider: ExecutionProvider,
  threshold: number,
  resetSeconds: number
): boolean {
  const b = getBreaker(provider);

  // F10: Check if failures have reached threshold even if state is "closed"
  if (b.state === "closed") {
    if (b.consecutiveFailures >= threshold) {
      b.state = "open";
      b.openedAt = Date.now();
      log.execution.error(
        `Circuit breaker OPEN for ${provider} — ${b.consecutiveFailures} failures ≥ ${threshold} threshold`
      );
      return true;
    }
    return false;
  }

  if (b.state === "open") {
    // Check if enough time passed to try half-open
    const elapsed = b.openedAt ? (Date.now() - b.openedAt) / 1000 : Infinity;
    if (elapsed >= resetSeconds) {
      b.state = "half_open";
      log.execution.info(`Circuit breaker half-open for ${provider}`);
      return false; // allow one attempt
    }
    return true; // still open
  }

  // half_open — allow attempt
  return false;
}

export function recordSuccess(provider: ExecutionProvider): void {
  const b = getBreaker(provider);
  b.consecutiveFailures = 0;
  b.lastSuccessAt = Date.now();

  if (b.state === "half_open") {
    b.state = "closed";
    b.openedAt = null;
    log.execution.info(`Circuit breaker closed for ${provider} (recovered)`);
  }
}

export function recordFailure(
  provider: ExecutionProvider,
  threshold: number
): void {
  const b = getBreaker(provider);
  b.consecutiveFailures++;
  b.lastFailureAt = Date.now();

  if (b.consecutiveFailures >= threshold && b.state !== "open") {
    b.state = "open";
    b.openedAt = Date.now();
    log.execution.error(
      `Circuit breaker OPEN for ${provider} after ${b.consecutiveFailures} failures`
    );
  }
}

export function getBreakerState(provider: ExecutionProvider): {
  state: BreakerState;
  failures: number;
} {
  const b = getBreaker(provider);
  return { state: b.state, failures: b.consecutiveFailures };
}
