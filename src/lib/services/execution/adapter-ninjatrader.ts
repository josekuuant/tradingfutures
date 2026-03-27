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

// ─── NinjaTrader Connection Modes ────────────────────────────
//
// NinjaTrader 8 does NOT have a standalone REST API.
// External connections require one of:
//
// 1. CrossTrade REST API (recommended) — third-party bridge add-on
//    that exposes NT8 functionality via REST. Runs on the same
//    Windows machine as NinjaTrader desktop.
//    https://crosstrade.io/crosstrade-api
//
// 2. NinjaTrader ATI (Automated Trading Interface) — native
//    DLL/File interface. Requires NinjaTrader desktop running.
//
// This adapter supports mode 1 (REST bridge) with configurable
// base URL. Any REST-compatible bridge that follows the same
// contract will work.
//
// IMPORTANT: NinjaTrader desktop MUST be running on a Windows
// machine for ANY external integration to work.

// ─── Config ──────────────────────────────────────────────────

const DEFAULT_BRIDGE_PORT = 8080;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1500;

interface NinjaTraderCredentials {
  /** Bridge host (usually localhost or LAN IP) */
  host: string;
  /** Bridge port */
  port: number;
  /** API key for the bridge (CrossTrade uses Bearer token) */
  apiKey?: string;
  /** Connection mode */
  mode: "crosstrade" | "custom_bridge";
}

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
    const port = credentials.port || DEFAULT_BRIDGE_PORT;
    this.baseUrl = `http://${host}:${port}`;
  }

  // ── HTTP helper ──────────────────────────────────────────

  private async apiFetch<T>(
    path: string,
    init: RequestInit = {}
  ): Promise<T> {
    let lastErr: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Accept: "application/json",
        };

        if (this.credentials.apiKey) {
          headers["Authorization"] = `Bearer ${this.credentials.apiKey}`;
        }

        const res = await fetch(`${this.baseUrl}${path}`, {
          ...init,
          headers: { ...headers, ...(init.headers as Record<string, string> ?? {}) },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(`NinjaTrader bridge ${res.status}: ${body.slice(0, 200)}`);
        }

        const data = await res.json();
        this.consecutiveFailures = 0;
        this.lastSuccessAt = new Date().toISOString();
        return data as T;
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        this.consecutiveFailures++;

        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS * (attempt + 1));
        }
      }
    }

    throw lastErr ?? new Error("NinjaTrader request failed");
  }

  // ── Adapter interface ────────────────────────────────────

  async connect(): Promise<{ ok: boolean; message: string }> {
    try {
      // Test connection by hitting health/status endpoint
      const data = await this.apiFetch<{ status?: string; connected?: boolean }>(
        "/api/status"
      );

      this.connected = data.connected !== false;

      if (this.connected) {
        log.execution.info(`NinjaTrader bridge connected at ${this.baseUrl}`);
        return { ok: true, message: `Connected to NinjaTrader bridge (${this.credentials.mode})` };
      } else {
        return { ok: false, message: "Bridge reachable but NinjaTrader not connected" };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      log.execution.error(`NinjaTrader connect failed: ${msg}`);
      return {
        ok: false,
        message: `Cannot reach NinjaTrader bridge at ${this.baseUrl}. ` +
          "Ensure NinjaTrader 8 desktop is running with the bridge add-on enabled.",
      };
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async getAccounts(): Promise<NormalizedAccount[]> {
    const data = await this.apiFetch<NtAccount[]>("/api/accounts");
    const accounts = Array.isArray(data) ? data : [];

    return accounts.map((a) => ({
      id: String(a.id ?? a.accountName ?? "NT-001"),
      name: a.accountName ?? a.name ?? "NinjaTrader Account",
      provider: "ninjatrader" as const,
      balance: a.cashValue ?? a.balance ?? 0,
      cashBalance: a.cashValue ?? a.balance ?? 0,
      marginUsed: a.initialMargin ?? 0,
      realizedPnl: a.realizedPnl ?? 0,
      unrealizedPnl: a.unrealizedPnl ?? 0,
      netLiq: a.netLiquidation ?? a.cashValue ?? 0,
      currency: "USD",
      environment: "production" as const,
    }));
  }

  async getPositions(accountId?: string): Promise<NormalizedPosition[]> {
    const params = accountId ? `?accountId=${accountId}` : "";
    const data = await this.apiFetch<NtPosition[]>(`/api/positions${params}`);
    const positions = Array.isArray(data) ? data : [];

    return positions
      .filter((p) => p.quantity !== 0)
      .map((p) => ({
        id: String(p.id ?? `${p.instrument}-${p.accountId}`),
        provider: "ninjatrader" as const,
        accountId: String(p.accountId ?? accountId ?? ""),
        instrument: p.instrument ?? "NQ",
        side: p.quantity > 0 ? "long" as const : p.quantity < 0 ? "short" as const : "flat" as const,
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
    const data = await this.apiFetch<NtOrder[]>(`/api/orders${params}`);
    const orders = Array.isArray(data) ? data : [];

    return orders
      .filter((o) => o.orderState === "Working" || o.orderState === "Accepted" || o.orderState === "PendingSubmit")
      .map(mapNtOrder);
  }

  async placeOrder(request: OrderRequest, accountId: string): Promise<NormalizedOrder> {
    const body = {
      accountId,
      instrument: request.instrument,
      action: request.side === "buy" ? "Buy" : "Sell",
      orderType: mapNtOrderType(request.type),
      quantity: request.quantity,
      limitPrice: request.type === "limit" || request.type === "stop_limit" ? request.price : undefined,
      stopPrice: request.type === "stop" || request.type === "stop_limit" ? request.stopPrice : undefined,
      timeInForce: "Day",
    };

    log.execution.info(`NinjaTrader placeOrder: ${JSON.stringify(body)}`);

    const result = await this.apiFetch<NtOrder>("/api/orders", {
      method: "POST",
      body: JSON.stringify(body),
    });

    return mapNtOrder(result);
  }

  async cancelOrder(orderId: string): Promise<{ ok: boolean; message: string }> {
    try {
      await this.apiFetch(`/api/orders/${orderId}/cancel`, { method: "POST" });
      return { ok: true, message: `Order ${orderId} cancelled` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown";
      return { ok: false, message: msg };
    }
  }

  async flattenPosition(instrument: string, accountId: string): Promise<NormalizedOrder> {
    // Try bridge's flatten endpoint first
    try {
      const result = await this.apiFetch<NtOrder>("/api/positions/flatten", {
        method: "POST",
        body: JSON.stringify({ accountId, instrument }),
      });
      return mapNtOrder(result);
    } catch {
      // Fallback: manual close
      const positions = await this.getPositions(accountId);
      const pos = positions.find((p) => p.instrument.includes(instrument));

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
      status: this.connected ? "healthy" : this.consecutiveFailures > 0 ? "degraded" : "unknown",
      connected: this.connected,
      lastSuccessfulConnection: this.lastSuccessAt,
      lastSuccessfulAuthRefresh: null,
      latencyMs: null,
      consecutiveFailures: this.consecutiveFailures,
      message: this.connected
        ? `Bridge connected (${this.credentials.mode})`
        : "Not connected — ensure NinjaTrader 8 desktop is running with bridge enabled",
    };
  }
}

// ─── NinjaTrader type mappings ───────────────────────────────

interface NtAccount {
  id?: string;
  accountName?: string;
  name?: string;
  cashValue?: number;
  balance?: number;
  initialMargin?: number;
  realizedPnl?: number;
  unrealizedPnl?: number;
  netLiquidation?: number;
}

interface NtPosition {
  id?: string;
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
  id?: string;
  accountId?: string;
  instrument?: string;
  action?: string;       // "Buy" | "Sell"
  orderType?: string;    // "Market" | "Limit" | "StopMarket" | "StopLimit"
  quantity?: number;
  limitPrice?: number;
  stopPrice?: number;
  filledQuantity?: number;
  averageFillPrice?: number;
  orderState?: string;   // "Working" | "Filled" | "Cancelled" | "Rejected" | etc.
  time?: string;
}

function mapNtOrder(o: NtOrder): NormalizedOrder {
  return {
    id: String(o.orderId ?? o.id ?? crypto.randomUUID()),
    provider: "ninjatrader",
    providerOrderId: String(o.orderId ?? o.id ?? ""),
    idempotencyKey: String(o.orderId ?? o.id ?? crypto.randomUUID()),
    accountId: String(o.accountId ?? ""),
    instrument: o.instrument ?? "NQ",
    side: o.action === "Buy" ? "buy" : "sell",
    type: reverseNtOrderType(o.orderType ?? "Market"),
    quantity: o.quantity ?? 0,
    price: o.limitPrice ?? null,
    stopPrice: o.stopPrice ?? null,
    filledQuantity: o.filledQuantity ?? 0,
    avgFillPrice: o.averageFillPrice ?? null,
    status: mapNtStatus(o.orderState ?? ""),
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
    Accepted: "pending",
    Working: "working",
    PendingSubmit: "pending",
    PendingChange: "working",
    PendingCancel: "working",
    Filled: "filled",
    PartFilled: "partially_filled",
    Cancelled: "cancelled",
    Rejected: "rejected",
  };
  return map[state] ?? "pending";
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
