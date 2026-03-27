import { log } from "@/lib/logger";
import type {
  ExecutionProviderAdapter,
  NormalizedAccount,
  NormalizedPosition,
  NormalizedOrder,
  OrderRequest,
  ProviderHealth,
  OrderStatus,
} from "@/types/execution";

// ─── Connection modes ────────────────────────────────────────

export type NinjaTraderMode = "native_api" | "desktop_bridge";

// ─── Config ──────────────────────────────────────────────────

const DEFAULT_ATI_PORT = 36973;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1500;

/**
 * NinjaTrader Adapter — supports two connection modes:
 *
 * 1. native_api: Connects to NinjaTrader's ATI (Automated Trading Interface)
 *    via HTTP on localhost. Requires NinjaTrader desktop running with ATI enabled.
 *    This is the primary integration path.
 *
 * 2. desktop_bridge: Placeholder for future local bridge application that
 *    would act as middleware between this backend and NinjaTrader desktop.
 *    Architecture prepared but not implemented — see BridgeInterface below.
 */

// ─── Credentials ─────────────────────────────────────────────

interface NinjaTraderCredentials {
  host: string;
  port: number;
  apiKey?: string;
  mode: NinjaTraderMode;
}

// ─── Desktop Bridge Interface (future) ───────────────────────
// When desktop_bridge mode is implemented, the bridge app would:
// 1. Run as a local service on the user's machine
// 2. Expose a REST API on localhost
// 3. Translate commands to NinjaTrader's internal API
// 4. Forward account/position/order state back

interface BridgeCommand {
  action: "place_order" | "cancel_order" | "get_state" | "flatten";
  payload: Record<string, unknown>;
}

interface BridgeResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

// Exported for future bridge implementation
export type { BridgeCommand, BridgeResponse };

// ─── Adapter ─────────────────────────────────────────────────

export class NinjaTraderAdapter implements ExecutionProviderAdapter {
  readonly provider = "ninjatrader" as const;
  readonly name = "ninjatrader";

  private credentials: NinjaTraderCredentials;
  private baseUrl: string;
  private connected = false;
  private lastSuccessAt: string | null = null;
  private consecutiveFailures = 0;

  constructor(credentials: NinjaTraderCredentials) {
    this.credentials = credentials;
    const host = credentials.host || "localhost";
    const port = credentials.port || DEFAULT_ATI_PORT;
    this.baseUrl = `http://${host}:${port}`;

    if (credentials.mode === "desktop_bridge") {
      log.execution.info(
        "NinjaTrader desktop_bridge mode selected — bridge integration pending"
      );
    }
  }

  // ── Mode check ───────────────────────────────────────────

  private assertNativeMode(): void {
    if (this.credentials.mode === "desktop_bridge") {
      throw new Error(
        "NinjaTrader desktop_bridge mode not yet implemented. " +
        "Use native_api mode with NinjaTrader ATI enabled."
      );
    }
  }

  // ── HTTP helpers (ATI) ───────────────────────────────────

  private async atiFetch<T>(
    path: string,
    init: RequestInit = {}
  ): Promise<T> {
    this.assertNativeMode();

    let lastErr: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Accept: "application/json",
        };
        if (this.credentials.apiKey) {
          headers["X-API-Key"] = this.credentials.apiKey;
        }

        const res = await fetch(`${this.baseUrl}${path}`, {
          ...init,
          headers: { ...headers, ...(init.headers ?? {}) },
        });

        if (!res.ok) {
          const body = await res.text();
          throw new Error(`NinjaTrader ATI ${res.status}: ${body}`);
        }

        const data = await res.json();
        this.consecutiveFailures = 0;
        this.lastSuccessAt = new Date().toISOString();
        return data as T;
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        this.consecutiveFailures++;

        // Connection refused = NinjaTrader not running
        if (
          lastErr.message.includes("ECONNREFUSED") ||
          lastErr.message.includes("fetch failed")
        ) {
          throw new Error(
            "Cannot connect to NinjaTrader ATI. " +
            "Ensure NinjaTrader is running with ATI enabled on " +
            `${this.credentials.host}:${this.credentials.port}`
          );
        }

        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS * (attempt + 1));
        }
      }
    }

    throw lastErr ?? new Error("NinjaTrader request failed");
  }

  // ── Adapter interface ────────────────────────────────────

  async connect(): Promise<{ ok: boolean; message: string }> {
    if (this.credentials.mode === "desktop_bridge") {
      return {
        ok: false,
        message:
          "Desktop bridge mode not yet implemented. Use native_api mode.",
      };
    }

    try {
      // ATI health check — attempt to get accounts
      await this.atiFetch("/accounts");
      this.connected = true;
      return {
        ok: true,
        message: `Connected to NinjaTrader ATI at ${this.baseUrl}`,
      };
    } catch (err) {
      this.connected = false;
      const msg = err instanceof Error ? err.message : "Unknown error";
      return { ok: false, message: msg };
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async getAccounts(): Promise<NormalizedAccount[]> {
    const accounts = await this.atiFetch<NtAccount[]>("/accounts");

    return accounts.map((a) => ({
      id: String(a.accountId ?? a.id ?? "NT-001"),
      name: a.name ?? a.displayName ?? "NinjaTrader Account",
      provider: "ninjatrader" as const,
      balance: a.cashValue ?? 0,
      cashBalance: a.cashValue ?? 0,
      marginUsed: a.initialMargin ?? 0,
      realizedPnl: a.realizedPnl ?? 0,
      unrealizedPnl: a.unrealizedPnl ?? 0,
      netLiq: a.netLiq ?? a.cashValue ?? 0,
      currency: "USD",
      environment: "production" as const,
    }));
  }

  async getPositions(accountId?: string): Promise<NormalizedPosition[]> {
    const params = accountId ? `?accountId=${accountId}` : "";
    const positions = await this.atiFetch<NtPosition[]>(
      `/positions${params}`
    );

    return positions
      .filter((p) => p.quantity !== 0)
      .map((p) => ({
        id: String(p.id ?? `${p.instrument}-${p.accountId}`),
        provider: "ninjatrader" as const,
        accountId: String(p.accountId ?? accountId ?? "NT-001"),
        instrument: p.instrument ?? "NQ",
        side:
          p.quantity > 0
            ? ("long" as const)
            : p.quantity < 0
              ? ("short" as const)
              : ("flat" as const),
        quantity: Math.abs(p.quantity),
        avgPrice: p.averagePrice ?? 0,
        currentPrice: p.lastPrice ?? p.averagePrice ?? 0,
        unrealizedPnl: p.unrealizedPnl ?? 0,
        realizedPnl: p.realizedPnl ?? 0,
        timestamp: p.timestamp ?? new Date().toISOString(),
      }));
  }

  async getOpenOrders(accountId?: string): Promise<NormalizedOrder[]> {
    const params = accountId ? `?accountId=${accountId}` : "";
    const orders = await this.atiFetch<NtOrder[]>(`/orders${params}`);

    return orders
      .filter(
        (o) =>
          o.orderState === "Working" ||
          o.orderState === "Accepted" ||
          o.orderState === "PendingSubmit"
      )
      .map(mapNtOrder);
  }

  async placeOrder(
    request: OrderRequest,
    accountId: string
  ): Promise<NormalizedOrder> {
    const body = {
      accountId,
      instrument: request.instrument,
      action: request.side === "buy" ? "Buy" : "Sell",
      orderType: mapNtOrderType(request.type),
      quantity: request.quantity,
      limitPrice: request.price,
      stopPrice: request.stopPrice,
    };

    log.execution.info(`NinjaTrader placeOrder: ${JSON.stringify(body)}`);

    const result = await this.atiFetch<NtOrder>("/orders", {
      method: "POST",
      body: JSON.stringify(body),
    });

    return mapNtOrder(result);
  }

  async cancelOrder(
    orderId: string
  ): Promise<{ ok: boolean; message: string }> {
    try {
      await this.atiFetch(`/orders/${orderId}/cancel`, {
        method: "POST",
      });
      return { ok: true, message: `Order ${orderId} cancelled` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown";
      return { ok: false, message: msg };
    }
  }

  async flattenPosition(
    instrument: string,
    accountId: string
  ): Promise<NormalizedOrder> {
    // Try ATI flatten command first
    try {
      const result = await this.atiFetch<NtOrder>(
        `/positions/flatten`,
        {
          method: "POST",
          body: JSON.stringify({ accountId, instrument }),
        }
      );
      return mapNtOrder(result);
    } catch {
      // Fallback: manual flatten via opposing market order
      const positions = await this.getPositions(accountId);
      const pos = positions.find((p) => p.instrument === instrument);

      if (!pos || pos.side === "flat") {
        throw new Error(`No open position for ${instrument}`);
      }

      return this.placeOrder(
        {
          instrument,
          side: pos.side === "long" ? "sell" : "buy",
          type: "market",
          quantity: pos.quantity,
        },
        accountId
      );
    }
  }

  async getHealth(): Promise<ProviderHealth> {
    return {
      provider: "ninjatrader",
      status: this.connected
        ? "healthy"
        : this.consecutiveFailures > 0
          ? "degraded"
          : "unknown",
      connected: this.connected,
      lastSuccessfulConnection: this.lastSuccessAt,
      lastSuccessfulAuthRefresh: null, // ATI doesn't use tokens
      latencyMs: null,
      consecutiveFailures: this.consecutiveFailures,
      message: this.connected
        ? `Connected to ATI at ${this.baseUrl} (${this.credentials.mode})`
        : this.credentials.mode === "desktop_bridge"
          ? "Desktop bridge mode — not yet implemented"
          : `Not connected to ATI at ${this.baseUrl}`,
    };
  }
}

// ─── NinjaTrader type mappings ───────────────────────────────

interface NtAccount {
  id?: number;
  accountId?: string;
  name?: string;
  displayName?: string;
  cashValue?: number;
  initialMargin?: number;
  realizedPnl?: number;
  unrealizedPnl?: number;
  netLiq?: number;
}

interface NtPosition {
  id?: number;
  accountId?: string;
  instrument?: string;
  quantity: number;
  averagePrice?: number;
  lastPrice?: number;
  unrealizedPnl?: number;
  realizedPnl?: number;
  timestamp?: string;
}

interface NtOrder {
  orderId?: string;
  id?: number;
  accountId?: string;
  instrument?: string;
  action?: string; // "Buy" | "Sell"
  orderType?: string; // "Market" | "Limit" | "StopMarket" | "StopLimit"
  quantity?: number;
  limitPrice?: number | null;
  stopPrice?: number | null;
  filledQuantity?: number;
  averageFillPrice?: number | null;
  orderState?: string;
  time?: string;
}

function mapNtOrder(o: NtOrder): NormalizedOrder {
  return {
    id: String(o.orderId ?? o.id ?? 0),
    provider: "ninjatrader",
    providerOrderId: String(o.orderId ?? o.id ?? 0),
    idempotencyKey: String(o.orderId ?? o.id ?? crypto.randomUUID()),
    accountId: o.accountId ?? "NT-001",
    instrument: o.instrument ?? "NQ",
    side: o.action === "Buy" ? "buy" : "sell",
    type: reverseNtOrderType(o.orderType ?? "Market"),
    quantity: o.quantity ?? 0,
    price: o.limitPrice ?? null,
    stopPrice: o.stopPrice ?? null,
    filledQuantity: o.filledQuantity ?? 0,
    avgFillPrice: o.averageFillPrice ?? null,
    status: mapNtStatus(o.orderState ?? "Unknown"),
    createdAt: o.time ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function mapNtOrderType(type: string): string {
  const map: Record<string, string> = {
    market: "Market",
    limit: "Limit",
    stop: "StopMarket",
    stop_limit: "StopLimit",
  };
  return map[type] ?? "Market";
}

function reverseNtOrderType(ntType: string): NormalizedOrder["type"] {
  const map: Record<string, NormalizedOrder["type"]> = {
    Market: "market",
    Limit: "limit",
    StopMarket: "stop",
    StopLimit: "stop_limit",
  };
  return map[ntType] ?? "market";
}

function mapNtStatus(state: string): OrderStatus {
  const map: Record<string, OrderStatus> = {
    PendingSubmit: "pending",
    Accepted: "working",
    Working: "working",
    Filled: "filled",
    PartFilled: "partially_filled",
    Cancelled: "cancelled",
    Rejected: "rejected",
    Unknown: "pending",
  };
  return map[state] ?? "pending";
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
