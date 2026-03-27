/**
 * Risk Control Module — transversal safety layer for execution.
 *
 * Evaluates kill switches, anomaly detection, and auto-lockdown
 * BEFORE any order reaches the broker. Integrates with the Unified
 * Execution Layer and Order Approval Center.
 *
 * This module is NOT inside the signal engine — it operates at
 * the execution boundary.
 */

import { log } from "@/lib/logger";
import type { ExecutionProvider } from "@/types/execution";

// ─── Kill Switch Types ───────────────────────────────────────

export type KillSwitchScope = "global" | "provider" | "symbol";
export type LockdownTrigger =
  | "manual"
  | "consecutive_rejections"
  | "auth_failures"
  | "provider_unhealthy"
  | "duplicate_executions"
  | "slippage_breach"
  | "excessive_latency"
  | "state_inconsistency"
  | "daily_loss_limit"
  | "circuit_breaker";

interface KillSwitchEntry {
  active: boolean;
  scope: KillSwitchScope;
  target: string; // "global", provider name, or symbol
  trigger: LockdownTrigger;
  reason: string;
  activatedAt: string;
  activatedBy: string; // "system" or "user"
  expiresAt: string | null; // null = permanent until manual reset
}

interface AnomalyCounter {
  count: number;
  firstAt: number;
  lastAt: number;
}

// ─── State ───────────────────────────────────────────────────

const killSwitches: KillSwitchEntry[] = [];
const anomalyCounters = new Map<string, AnomalyCounter>();
const lockdownHistory: KillSwitchEntry[] = [];
const MAX_HISTORY = 100;

// ─── Config ──────────────────────────────────────────────────

interface RiskControlConfig {
  maxConsecutiveRejections: number;
  maxAuthFailures: number;
  maxDuplicateAttempts: number;
  maxSlippageBreaches: number;
  maxLatencyMs: number;
  anomalyWindowSeconds: number;
  autoLockdownDurationSeconds: number;
  safeModeOnAnyLockdown: boolean;
}

const config: RiskControlConfig = {
  maxConsecutiveRejections: 5,
  maxAuthFailures: 3,
  maxDuplicateAttempts: 3,
  maxSlippageBreaches: 3,
  maxLatencyMs: 5000,
  anomalyWindowSeconds: 300, // 5 min window
  autoLockdownDurationSeconds: 600, // 10 min auto-lockdown
  safeModeOnAnyLockdown: true,
};

export function getRiskConfig(): RiskControlConfig {
  return { ...config };
}

export function updateRiskConfig(partial: Partial<RiskControlConfig>): void {
  Object.assign(config, partial);
}

// ─── Kill Switch Management ─────────────────────────────────

export function activateKillSwitch(
  scope: KillSwitchScope,
  target: string,
  trigger: LockdownTrigger,
  reason: string,
  activatedBy: "system" | "user" = "system",
  durationSeconds: number | null = null
): void {
  // Don't duplicate
  const existing = killSwitches.find(
    (k) => k.scope === scope && k.target === target && k.active
  );
  if (existing) return;

  const now = new Date();
  const entry: KillSwitchEntry = {
    active: true,
    scope,
    target,
    trigger,
    reason,
    activatedAt: now.toISOString(),
    activatedBy,
    expiresAt: durationSeconds
      ? new Date(now.getTime() + durationSeconds * 1000).toISOString()
      : null,
  };

  killSwitches.push(entry);

  // Archive
  lockdownHistory.unshift({ ...entry });
  if (lockdownHistory.length > MAX_HISTORY) lockdownHistory.length = MAX_HISTORY;

  const level = scope === "global" ? "critical" : "error";
  log.execution[level](
    `KILL SWITCH ACTIVATED [${scope}:${target}] — ${reason}`,
    { trigger, activatedBy, durationSeconds }
  );
}

export function deactivateKillSwitch(
  scope: KillSwitchScope,
  target: string
): boolean {
  const idx = killSwitches.findIndex(
    (k) => k.scope === scope && k.target === target && k.active
  );
  if (idx === -1) return false;

  killSwitches[idx].active = false;
  log.execution.info(`Kill switch deactivated [${scope}:${target}]`);
  return true;
}

export function deactivateAllKillSwitches(): number {
  let count = 0;
  for (const k of killSwitches) {
    if (k.active) {
      k.active = false;
      count++;
    }
  }
  if (count > 0) {
    log.execution.info(`All kill switches deactivated (${count} cleared)`);
  }
  return count;
}

// ─── Pre-Order Risk Check ────────────────────────────────────

export interface RiskCheckResult {
  allowed: boolean;
  reason: string;
  trigger: LockdownTrigger | null;
  forceSafeMode: boolean;
}

/**
 * Main entry point — call BEFORE any order submission.
 * Checks all kill switches (global, provider, symbol) and
 * auto-expires timed lockdowns.
 */
export function checkRiskControls(
  provider: ExecutionProvider,
  symbol: string
): RiskCheckResult {
  // Expire timed lockdowns
  purgeExpiredSwitches();

  // Check global kill switch
  const globalBlock = killSwitches.find(
    (k) => k.scope === "global" && k.active
  );
  if (globalBlock) {
    return {
      allowed: false,
      reason: `GLOBAL KILL SWITCH: ${globalBlock.reason}`,
      trigger: globalBlock.trigger,
      forceSafeMode: true,
    };
  }

  // Check provider kill switch
  const providerBlock = killSwitches.find(
    (k) => k.scope === "provider" && k.target === provider && k.active
  );
  if (providerBlock) {
    return {
      allowed: false,
      reason: `Provider ${provider} locked: ${providerBlock.reason}`,
      trigger: providerBlock.trigger,
      forceSafeMode: true,
    };
  }

  // Check symbol kill switch
  const symbolBlock = killSwitches.find(
    (k) => k.scope === "symbol" && k.target === symbol && k.active
  );
  if (symbolBlock) {
    return {
      allowed: false,
      reason: `Symbol ${symbol} locked: ${symbolBlock.reason}`,
      trigger: symbolBlock.trigger,
      forceSafeMode: false,
    };
  }

  // Check if any active lockdown should force safe mode
  const anyActive = killSwitches.some((k) => k.active);
  if (anyActive && config.safeModeOnAnyLockdown) {
    return {
      allowed: true,
      reason: "Safe mode active — manual approval required",
      trigger: null,
      forceSafeMode: true,
    };
  }

  return {
    allowed: true,
    reason: "All risk controls passed",
    trigger: null,
    forceSafeMode: false,
  };
}

// ─── Anomaly Recording ──────────────────────────────────────

/**
 * Record an anomaly event. If threshold exceeded within window,
 * auto-activates the appropriate kill switch.
 */
export function recordAnomaly(
  type: LockdownTrigger,
  scope: KillSwitchScope,
  target: string,
  detail: string
): void {
  const key = `${type}:${scope}:${target}`;
  const now = Date.now();
  const windowMs = config.anomalyWindowSeconds * 1000;

  let counter = anomalyCounters.get(key);
  if (!counter || now - counter.firstAt > windowMs) {
    counter = { count: 0, firstAt: now, lastAt: now };
  }
  counter.count++;
  counter.lastAt = now;
  anomalyCounters.set(key, counter);

  log.execution.warn(`Anomaly recorded [${type}]: ${detail}`, {
    scope,
    target,
    count: counter.count,
  });

  // Check thresholds
  const thresholds: Partial<Record<LockdownTrigger, number>> = {
    consecutive_rejections: config.maxConsecutiveRejections,
    auth_failures: config.maxAuthFailures,
    duplicate_executions: config.maxDuplicateAttempts,
    slippage_breach: config.maxSlippageBreaches,
  };

  const threshold = thresholds[type];
  if (threshold && counter.count >= threshold) {
    activateKillSwitch(
      scope,
      target,
      type,
      `Auto-lockdown: ${counter.count}x ${type} in ${config.anomalyWindowSeconds}s — ${detail}`,
      "system",
      config.autoLockdownDurationSeconds
    );
    // Reset counter after lockdown
    anomalyCounters.delete(key);
  }
}

/** Shorthand for common anomaly types */
export const anomaly = {
  rejection: (provider: ExecutionProvider, detail: string) =>
    recordAnomaly("consecutive_rejections", "provider", provider, detail),

  authFailure: (provider: ExecutionProvider, detail: string) =>
    recordAnomaly("auth_failures", "provider", provider, detail),

  duplicateExecution: (symbol: string, detail: string) =>
    recordAnomaly("duplicate_executions", "symbol", symbol, detail),

  slippageBreach: (symbol: string, detail: string) =>
    recordAnomaly("slippage_breach", "symbol", symbol, detail),

  highLatency: (provider: ExecutionProvider, latencyMs: number) => {
    if (latencyMs > config.maxLatencyMs) {
      recordAnomaly(
        "excessive_latency",
        "provider",
        provider,
        `${latencyMs}ms > ${config.maxLatencyMs}ms threshold`
      );
    }
  },

  stateInconsistency: (provider: ExecutionProvider, detail: string) => {
    // State inconsistency is severe — immediate lockdown
    activateKillSwitch(
      "provider",
      provider,
      "state_inconsistency",
      `State inconsistency detected: ${detail}`,
      "system",
      config.autoLockdownDurationSeconds
    );
  },

  dailyLossLimit: () => {
    activateKillSwitch(
      "global",
      "global",
      "daily_loss_limit",
      "Daily loss limit reached — all execution halted",
      "system",
      null // permanent until manual reset or next day
    );
  },
};

// ─── Query ───────────────────────────────────────────────────

export function getActiveKillSwitches(): KillSwitchEntry[] {
  purgeExpiredSwitches();
  return killSwitches.filter((k) => k.active);
}

export function getLockdownHistory(limit = 50): KillSwitchEntry[] {
  return lockdownHistory.slice(0, limit);
}

export interface RiskControlStatus {
  globalLocked: boolean;
  activeKillSwitches: KillSwitchEntry[];
  lockedProviders: string[];
  lockedSymbols: string[];
  recentAnomalies: { key: string; count: number; lastAt: string }[];
  config: RiskControlConfig;
}

export function getRiskControlStatus(): RiskControlStatus {
  purgeExpiredSwitches();

  const active = killSwitches.filter((k) => k.active);

  const recentAnomalies = Array.from(anomalyCounters.entries()).map(
    ([key, counter]) => ({
      key,
      count: counter.count,
      lastAt: new Date(counter.lastAt).toISOString(),
    })
  );

  return {
    globalLocked: active.some((k) => k.scope === "global"),
    activeKillSwitches: active,
    lockedProviders: active
      .filter((k) => k.scope === "provider")
      .map((k) => k.target),
    lockedSymbols: active
      .filter((k) => k.scope === "symbol")
      .map((k) => k.target),
    recentAnomalies,
    config,
  };
}

// ─── Internal ────────────────────────────────────────────────

function purgeExpiredSwitches(): void {
  const now = new Date().toISOString();
  for (const k of killSwitches) {
    if (k.active && k.expiresAt && k.expiresAt <= now) {
      k.active = false;
      log.execution.info(
        `Kill switch expired [${k.scope}:${k.target}] — ${k.trigger}`
      );
    }
  }
}
