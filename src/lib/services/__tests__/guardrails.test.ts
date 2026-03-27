import { describe, it, expect, beforeEach } from "vitest";
import {
  checkIdempotency,
  recordIdempotencyKey,
  clearPendingKey,
  checkPositionLimit,
  checkCooldown,
  recordOrderTimestamp,
  checkSlippage,
  checkDuplicateOrder,
  runGuardrails,
} from "../execution/guardrails";
import type {
  OrderRequest,
  NormalizedPosition,
  NormalizedOrder,
  GuardrailConfig,
} from "@/types/execution";
import { DEFAULT_GUARDRAILS } from "@/types/execution";

const config: GuardrailConfig = { ...DEFAULT_GUARDRAILS };

function makeRequest(overrides: Partial<OrderRequest> = {}): OrderRequest {
  return {
    instrument: "NQ",
    side: "buy",
    type: "market",
    quantity: 1,
    ...overrides,
  };
}

function makePosition(instrument = "NQ", side: "long" | "short" = "long"): NormalizedPosition {
  return {
    id: crypto.randomUUID(),
    provider: "tradovate",
    accountId: "A1",
    instrument,
    side,
    quantity: 1,
    avgPrice: 19850,
    currentPrice: 19855,
    unrealizedPnl: 25,
    realizedPnl: 0,
    timestamp: new Date().toISOString(),
  };
}

function makeOrder(overrides: Partial<NormalizedOrder> = {}): NormalizedOrder {
  return {
    id: crypto.randomUUID(),
    provider: "tradovate",
    providerOrderId: "TV-001",
    idempotencyKey: crypto.randomUUID(),
    accountId: "A1",
    instrument: "NQ",
    side: "buy",
    type: "market",
    quantity: 1,
    price: null,
    stopPrice: null,
    filledQuantity: 1,
    avgFillPrice: 19850,
    status: "filled",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ─── Idempotency ─────────────────────────────────────────────

describe("checkIdempotency", () => {
  it("passes for empty key", () => {
    expect(checkIdempotency("").passed).toBe(true);
  });

  it("passes for unknown key", () => {
    expect(checkIdempotency("new-key-123").passed).toBe(true);
  });

  it("blocks duplicate completed key", () => {
    const key = `test-${Date.now()}`;
    recordIdempotencyKey(key, "order-456");
    const result = checkIdempotency(key);
    expect(result.passed).toBe(false);
    expect(result.errorCode).toBe("DUPLICATE_ORDER");
  });

  it("allows retry of pending key", () => {
    const key = `pending-${Date.now()}`;
    recordIdempotencyKey(key, "pending");
    expect(checkIdempotency(key).passed).toBe(true);
  });

  it("clears pending key on failure", () => {
    const key = `clear-${Date.now()}`;
    recordIdempotencyKey(key, "pending");
    clearPendingKey(key);
    // Key should be gone — new check passes
    expect(checkIdempotency(key).passed).toBe(true);
  });

  it("clearPendingKey does not remove completed keys", () => {
    const key = `done-${Date.now()}`;
    recordIdempotencyKey(key, "order-789");
    clearPendingKey(key); // should NOT delete because value !== "pending"
    expect(checkIdempotency(key).passed).toBe(false);
  });
});

// ─── Position limit ──────────────────────────────────────────

describe("checkPositionLimit", () => {
  it("passes when no positions", () => {
    const result = checkPositionLimit(makeRequest(), [], config);
    expect(result.passed).toBe(true);
  });

  it("blocks when at limit", () => {
    const positions = [makePosition("NQ")];
    const result = checkPositionLimit(makeRequest(), positions, {
      ...config,
      maxPositionsPerSymbol: 1,
    });
    expect(result.passed).toBe(false);
    expect(result.errorCode).toBe("POSITION_LIMIT");
  });

  it("ignores flat positions", () => {
    const positions = [{ ...makePosition("NQ"), side: "flat" as const }];
    const result = checkPositionLimit(makeRequest(), positions, {
      ...config,
      maxPositionsPerSymbol: 1,
    });
    expect(result.passed).toBe(true);
  });

  it("only counts same instrument", () => {
    const positions = [makePosition("MNQ")];
    const result = checkPositionLimit(makeRequest({ instrument: "NQ" }), positions, {
      ...config,
      maxPositionsPerSymbol: 1,
    });
    expect(result.passed).toBe(true);
  });
});

// ─── Cooldown ────────────────────────────────────────────────

describe("checkCooldown", () => {
  it("passes when no previous order", () => {
    expect(checkCooldown("MNQ", config).passed).toBe(true);
  });

  it("blocks within cooldown window", () => {
    recordOrderTimestamp("NQ-cool");
    const result = checkCooldown("NQ-cool", { ...config, orderCooldownSeconds: 60 });
    expect(result.passed).toBe(false);
    expect(result.errorCode).toBe("COOLDOWN");
  });
});

// ─── Slippage ────────────────────────────────────────────────

describe("checkSlippage", () => {
  it("passes for non-market orders", () => {
    const result = checkSlippage(
      makeRequest({ type: "limit", price: 19850 }),
      19850,
      config
    );
    expect(result.passed).toBe(true);
  });

  it("passes when no currentPrice", () => {
    expect(checkSlippage(makeRequest({ price: 19850 }), null, config).passed).toBe(true);
  });

  it("passes within tolerance", () => {
    const result = checkSlippage(
      makeRequest({ price: 19850 }),
      19850.5,
      { ...config, maxSlippageTicks: 4 }
    );
    expect(result.passed).toBe(true);
  });

  it("blocks excessive slippage", () => {
    const result = checkSlippage(
      makeRequest({ price: 19850 }),
      19855, // 20 ticks away
      { ...config, maxSlippageTicks: 4 }
    );
    expect(result.passed).toBe(false);
    expect(result.errorCode).toBe("SLIPPAGE_GUARD");
  });
});

// ─── Duplicate order ─────────────────────────────────────────

describe("checkDuplicateOrder", () => {
  it("passes with no recent orders", () => {
    expect(checkDuplicateOrder(makeRequest(), []).passed).toBe(true);
  });

  it("blocks identical recent order", () => {
    const order = makeOrder({
      instrument: "NQ",
      side: "buy",
      type: "market",
      quantity: 1,
      status: "filled",
      createdAt: new Date().toISOString(),
    });
    const result = checkDuplicateOrder(makeRequest(), [order]);
    expect(result.passed).toBe(false);
    expect(result.errorCode).toBe("DUPLICATE_ORDER");
  });

  it("passes for different instrument", () => {
    const order = makeOrder({
      instrument: "MNQ",
      side: "buy",
      type: "market",
      quantity: 1,
      createdAt: new Date().toISOString(),
    });
    const result = checkDuplicateOrder(makeRequest({ instrument: "NQ" }), [order]);
    expect(result.passed).toBe(true);
  });

  it("passes for old orders (> 30s)", () => {
    const order = makeOrder({
      createdAt: new Date(Date.now() - 60_000).toISOString(),
    });
    const result = checkDuplicateOrder(makeRequest(), [order]);
    expect(result.passed).toBe(true);
  });
});

// ─── Input validation ────────────────────────────────────────

describe("runGuardrails input validation", () => {
  it("rejects empty instrument", () => {
    const result = runGuardrails(makeRequest({ instrument: "" }), [], [], config, null);
    expect(result.passed).toBe(false);
    expect(result.error).toContain("instrument");
  });

  it("rejects zero quantity", () => {
    const result = runGuardrails(makeRequest({ quantity: 0 }), [], [], config, null);
    expect(result.passed).toBe(false);
    expect(result.error).toContain("quantity");
  });

  it("rejects negative quantity", () => {
    const result = runGuardrails(makeRequest({ quantity: -1 }), [], [], config, null);
    expect(result.passed).toBe(false);
  });

  it("rejects fractional quantity", () => {
    const result = runGuardrails(makeRequest({ quantity: 1.5 }), [], [], config, null);
    expect(result.passed).toBe(false);
  });

  it("rejects limit order without price", () => {
    const result = runGuardrails(makeRequest({ type: "limit" }), [], [], config, null);
    expect(result.passed).toBe(false);
    expect(result.error).toContain("price");
  });

  it("rejects stop order without stopPrice", () => {
    const result = runGuardrails(makeRequest({ type: "stop" }), [], [], config, null);
    expect(result.passed).toBe(false);
    expect(result.error).toContain("stopPrice");
  });

  it("passes valid market order", () => {
    const result = runGuardrails(makeRequest(), [], [], config, null);
    expect(result.passed).toBe(true);
  });

  it("passes valid limit order with price", () => {
    const result = runGuardrails(
      makeRequest({ type: "limit", price: 19850 }),
      [], [], config, null
    );
    expect(result.passed).toBe(true);
  });
});
