import { log } from "@/lib/logger";
import type {
  ExecutionProviderAdapter,
  NormalizedAccount,
  NormalizedPosition,
  NormalizedOrder,
  OrderRequest,
  ProviderHealth,
  OrderType,
  OrderStatus,
} from "@/types/execution";

// ─── Config ──────────────────────────────────────────────────

const BASE_URLS = {
  demo: "https://demo.tradovateapi.com/v1",
  production: "https://live.tradovateapi.com/v1",
} as const;

const TOKEN_LIFETIME_MS = 90 * 60 * 1000;    // 90 min
const REFRESH_BEFORE_MS = 5 * 60 * 1000;     // refresh 5 min before expiry
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1500;

// ─── Tradovate-specific types ────────────────────────────────

interface TradovateCredentials {
  username: string;
  password: string;
  appId?: string;
  cid?: string;
  sec?: string;
}

interface TokenState {
  accessToken: string;
  expiresAt: number;
  userId: number | null;
}

// ─── Adapter ─────────────────────────────────────────────────

export class TradovateAdapter implements ExecutionProviderAdapter {
  readonly provider = "tradovate" as const;
  readonly name = "tradovate";

  private credentials: TradovateCredentials;
  private environment: "demo" | "production";
  private baseUrl: string;
  private token: TokenState | null = null;
  private lastSuccessAt: string | null = null;
  private consecutiveFailures = 0;

  constructor(
    credentials: TradovateCredentials,
    environment: "demo" | "production" = "demo"
  ) {
    this.credentials = credentials;
    this.environment = environment;
    this.baseUrl = BASE_URLS[environment];
  }

  // ── Auth ─────────────────────────────────────────────────

  private async authenticate(): Promise<void> {
    const body = {
      name: this.credentials.username,
      password: this.credentials.password,
      appId: this.credentials.appId || "TradingFutures",
      appVersion: "1.0",
      cid: this.credentials.cid || undefined,
      sec: this.credentials.sec || undefined,
    };

    const res = await this.rawFetch("/auth/accessTokenRequest", {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Tradovate auth failed (${res.status}): ${err}`);
    }

    const data = await res.json();
    this.token = {
      accessToken: data.accessToken ?? data["access_token"],
      expiresAt: Date.now() + TOKEN_LIFETIME_MS,
      userId: data.userId ?? null,
    };

    log.execution.info("Tradovate authenticated", {
      userId: this.token.userId,
      environment: this.environment,
    });
  }

  private async ensureToken(): Promise<string> {
    if (!this.token || Date.now() > this.token.expiresAt - REFRESH_BEFORE_MS) {
      await this.authenticate();
    }
    return this.token!.accessToken;
  }

  // ── HTTP helpers ─────────────────────────────────────────

  private async rawFetch(path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init.headers ?? {}),
      },
    });
  }

  private async apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
    let lastErr: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const token = await this.ensureToken();
        const res = await this.rawFetch(path, {
          ...init,
          headers: {
            Authorization: `Bearer ${token}`,
            ...(init.headers ?? {}),
          },
        });

        if (res.status === 401) {
          // Token expired mid-request — force re-auth
          this.token = null;
          if (attempt < MAX_RETRIES) continue;
        }

        if (res.status === 429) {
          // Rate limited — wait and retry
          if (attempt < MAX_RETRIES) {
            await sleep(RETRY_DELAY_MS * (attempt + 1));
            continue;
          }
        }

        if (!res.ok) {
          const body = await res.text();
          throw new Error(`Tradovate ${res.status}: ${body}`);
        }

        this.consecutiveFailures = 0;
        this.lastSuccessAt = new Date().toISOString();
        return (await res.json()) as T;
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        this.consecutiveFailures++;
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS * (attempt + 1));
        }
      }
    }

    throw lastErr ?? new Error("Tradovate request failed");
  }

  // ── Adapter interface ────────────────────────────────────

  async connect(): Promise<{ ok: boolean; message: string }> {
    try {
      await this.authenticate();
      return { ok: true, message: `Connected to Tradovate ${this.environment}` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return { ok: false, message: msg };
    }
  }

  async disconnect(): Promise<void> {
    this.token = null;
  }

  async getAccounts(): Promise<NormalizedAccount[]> {
    const accounts = await this.apiFetch<TvAccount[]>("/account/list");

    return accounts.map((a) => ({
      id: String(a.id),
      name: a.name ?? `Account ${a.id}`,
      provider: "tradovate" as const,
      balance: a.marginBalance ?? 0,
      cashBalance: a.cashBalance ?? 0,
      marginUsed: a.totalUsedMargin ?? 0,
      realizedPnl: a.realizedPnl ?? 0,
      unrealizedPnl: a.openPnl ?? 0,
      netLiq: a.netLiq ?? a.marginBalance ?? 0,
      currency: "USD",
      environment: this.environment,
    }));
  }

  async getPositions(accountId?: string): Promise<NormalizedPosition[]> {
    const positions = await this.apiFetch<TvPosition[]>("/position/list");

    return positions
      .filter((p) => !accountId || String(p.accountId) === accountId)
      .filter((p) => p.netPos !== 0)
      .map((p) => ({
        id: String(p.id),
        provider: "tradovate" as const,
        accountId: String(p.accountId),
        instrument: p.contractId ? `NQ-${p.contractId}` : "NQ",
        side: p.netPos > 0 ? "long" as const : p.netPos < 0 ? "short" as const : "flat" as const,
        quantity: Math.abs(p.netPos),
        avgPrice: p.netPrice ?? 0,
        currentPrice: p.netPrice ?? 0, // Updated via WebSocket in production
        unrealizedPnl: p.openPnl ?? 0,
        realizedPnl: p.realizedPnl ?? 0,
        timestamp: p.timestamp ?? new Date().toISOString(),
      }));
  }

  async getOpenOrders(accountId?: string): Promise<NormalizedOrder[]> {
    const orders = await this.apiFetch<TvOrder[]>("/order/list");

    return orders
      .filter((o) => !accountId || String(o.accountId) === accountId)
      .filter((o) => o.ordStatus === "Working" || o.ordStatus === "PendingNew")
      .map(mapTvOrder);
  }

  async placeOrder(
    request: OrderRequest,
    accountId: string
  ): Promise<NormalizedOrder> {
    const body = {
      accountSpec: this.credentials.username,
      accountId: Number(accountId),
      action: request.side === "buy" ? "Buy" : "Sell",
      symbol: request.instrument,
      orderQty: request.quantity,
      orderType: mapOrderType(request.type),
      price: request.price,
      stopPrice: request.stopPrice,
      isAutomated: true,
    };

    log.execution.info(`Tradovate placeOrder: ${JSON.stringify(body)}`);

    const result = await this.apiFetch<TvOrderResult>("/order/placeOrder", {
      method: "POST",
      body: JSON.stringify(body),
    });

    return mapTvOrder(result.orderId ? result : { ...result, id: result.orderId ?? 0 });
  }

  async cancelOrder(orderId: string): Promise<{ ok: boolean; message: string }> {
    try {
      await this.apiFetch("/order/cancelOrder", {
        method: "POST",
        body: JSON.stringify({ orderId: Number(orderId) }),
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
    // Get current position to determine flatten side
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

  async getHealth(): Promise<ProviderHealth> {
    const hasToken = this.token !== null && Date.now() < this.token.expiresAt;

    return {
      provider: "tradovate",
      status: hasToken ? "healthy" : this.consecutiveFailures > 0 ? "degraded" : "unknown",
      connected: hasToken,
      lastSuccessfulConnection: this.lastSuccessAt,
      lastSuccessfulAuthRefresh: hasToken ? new Date().toISOString() : null,
      latencyMs: null,
      consecutiveFailures: this.consecutiveFailures,
      message: hasToken
        ? `Authenticated (${this.environment})`
        : "Not authenticated",
    };
  }
}

// ─── Tradovate type mappings ─────────────────────────────────

// Raw Tradovate API shapes (partial — only fields we use)
interface TvAccount {
  id: number;
  name?: string;
  marginBalance?: number;
  cashBalance?: number;
  totalUsedMargin?: number;
  realizedPnl?: number;
  openPnl?: number;
  netLiq?: number;
}

interface TvPosition {
  id: number;
  accountId: number;
  contractId?: number;
  netPos: number;
  netPrice?: number;
  openPnl?: number;
  realizedPnl?: number;
  timestamp?: string;
}

interface TvOrder {
  id: number;
  accountId: number;
  action: string;
  symbol?: string;
  orderQty: number;
  orderType: string;
  price?: number;
  stopPrice?: number;
  filledQty?: number;
  avgFillPrice?: number;
  ordStatus: string;
  clOrdId?: string;
  timestamp?: string;
}

interface TvOrderResult extends TvOrder {
  orderId?: number;
}

function mapTvOrder(o: TvOrder | TvOrderResult): NormalizedOrder {
  return {
    id: String(o.id || (o as TvOrderResult).orderId || 0),
    provider: "tradovate",
    providerOrderId: String(o.id || 0),
    idempotencyKey: o.clOrdId ?? String(o.id),
    accountId: String(o.accountId),
    instrument: o.symbol ?? "NQ",
    side: o.action === "Buy" ? "buy" : "sell",
    type: reverseMapOrderType(o.orderType),
    quantity: o.orderQty,
    price: o.price ?? null,
    stopPrice: o.stopPrice ?? null,
    filledQuantity: o.filledQty ?? 0,
    avgFillPrice: o.avgFillPrice ?? null,
    status: mapTvStatus(o.ordStatus),
    createdAt: o.timestamp ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function mapOrderType(type: OrderType): string {
  const map: Record<OrderType, string> = {
    market: "Market",
    limit: "Limit",
    stop: "Stop",
    stop_limit: "StopLimit",
  };
  return map[type] ?? "Market";
}

function reverseMapOrderType(tvType: string): OrderType {
  const map: Record<string, OrderType> = {
    Market: "market",
    Limit: "limit",
    Stop: "stop",
    StopLimit: "stop_limit",
  };
  return map[tvType] ?? "market";
}

function mapTvStatus(tvStatus: string): OrderStatus {
  const map: Record<string, OrderStatus> = {
    PendingNew: "pending",
    Working: "working",
    Filled: "filled",
    Cancelled: "cancelled",
    Rejected: "rejected",
    Expired: "expired",
    PartiallyFilled: "partially_filled",
  };
  return map[tvStatus] ?? "pending";
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
