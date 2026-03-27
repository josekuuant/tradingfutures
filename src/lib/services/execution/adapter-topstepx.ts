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

// ─── Config ──────────────────────────────────────────────────

const BASE_URLS = {
  demo: "https://gateway-api-demo.s2f.projectx.com",
  production: "https://api.thefuturesdesk.projectx.com",
} as const;

const TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1000; // 24 hours
const REFRESH_BEFORE_MS = 60 * 60 * 1000;       // refresh 1h before expiry
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 2000;
const MIN_REQUEST_INTERVAL_MS = 1000; // ~60 req/min limit

// ─── VPS/Remote deployment warning ──────────────────────────
/**
 * IMPORTANT: TopstepX / ProjectX Terms of Service STRICTLY PROHIBIT
 * running this adapter from VPS, VPN, or remote servers.
 *
 * All API calls MUST originate from the user's personal device.
 * Violation can result in account suspension.
 *
 * This adapter includes a deployment context check that logs warnings
 * if it detects server-like environments.
 */

// ─── TopstepX-specific types ────────────────────────────────

interface TopstepXCredentials {
  apiKey: string;
  username?: string;
  accountId?: string;
}

interface TokenState {
  sessionToken: string;
  expiresAt: number;
}

// ─── Adapter ─────────────────────────────────────────────────

export class TopstepXAdapter implements ExecutionProviderAdapter {
  readonly provider = "topstepx" as const;
  readonly name = "topstepx";

  private credentials: TopstepXCredentials;
  private environment: "demo" | "production";
  private baseUrl: string;
  private token: TokenState | null = null;
  private lastSuccessAt: string | null = null;
  private consecutiveFailures = 0;
  private lastRequestAt = 0;

  constructor(
    credentials: TopstepXCredentials,
    environment: "demo" | "production" = "demo"
  ) {
    this.credentials = credentials;
    this.environment = environment;
    this.baseUrl = BASE_URLS[environment];
    this.checkDeploymentContext();
  }

  private checkDeploymentContext(): void {
    // Warn if running in a server-like environment
    const isLikelyServer =
      typeof window === "undefined" &&
      (process.env.NODE_ENV === "production" ||
        process.env.DOCKER_CONTAINER === "true" ||
        process.env.KUBERNETES_SERVICE_HOST != null);

    if (isLikelyServer) {
      log.execution.critical(
        "TopstepX WARNING: Detected server/cloud environment. " +
          "TopstepX Terms of Service PROHIBIT VPS/remote server usage. " +
          "All API calls must originate from your personal device. " +
          "Automated execution disabled for safety."
      );
    }
  }

  // ── Auth ─────────────────────────────────────────────────

  private async authenticate(): Promise<void> {
    const body = {
      userName: this.credentials.username || "",
      apiKey: this.credentials.apiKey,
    };

    const res = await this.rawFetch("/api/Auth/loginKey", {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`TopstepX auth failed (${res.status}): ${err}`);
    }

    const data = await res.json();
    const sessionToken = data?.result?.sessionToken ?? data?.sessionToken;

    if (!sessionToken) {
      throw new Error("TopstepX auth response missing sessionToken");
    }

    this.token = {
      sessionToken,
      expiresAt: Date.now() + TOKEN_LIFETIME_MS,
    };

    log.execution.info("TopstepX authenticated", {
      environment: this.environment,
    });
  }

  private async ensureToken(): Promise<string> {
    if (!this.token || Date.now() > this.token.expiresAt - REFRESH_BEFORE_MS) {
      await this.authenticate();
    }
    return this.token!.sessionToken;
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
    // Client-side rate limiting
    const now = Date.now();
    const elapsed = now - this.lastRequestAt;
    if (elapsed < MIN_REQUEST_INTERVAL_MS) {
      await sleep(MIN_REQUEST_INTERVAL_MS - elapsed);
    }
    this.lastRequestAt = Date.now();

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
          this.token = null;
          if (attempt < MAX_RETRIES) continue;
        }

        if (res.status === 429) {
          if (attempt < MAX_RETRIES) {
            await sleep(RETRY_DELAY_MS * (attempt + 2));
            continue;
          }
        }

        if (!res.ok) {
          const body = await res.text();
          throw new Error(`TopstepX ${res.status}: ${body}`);
        }

        const data = await res.json();
        this.consecutiveFailures = 0;
        this.lastSuccessAt = new Date().toISOString();

        // ProjectX wraps responses in { result: ... }
        return (data?.result ?? data) as T;
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        this.consecutiveFailures++;
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS * (attempt + 1));
        }
      }
    }

    throw lastErr ?? new Error("TopstepX request failed");
  }

  // ── Adapter interface ────────────────────────────────────

  async connect(): Promise<{ ok: boolean; message: string }> {
    try {
      await this.authenticate();
      return {
        ok: true,
        message: `Connected to TopstepX ${this.environment}`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return { ok: false, message: msg };
    }
  }

  async disconnect(): Promise<void> {
    this.token = null;
  }

  async getAccounts(): Promise<NormalizedAccount[]> {
    const accounts = await this.apiFetch<PxAccount[]>("/api/Account/search");

    return accounts.map((a) => ({
      id: String(a.id),
      name: a.name ?? `TopstepX ${a.id}`,
      provider: "topstepx" as const,
      balance: a.balance ?? 0,
      cashBalance: a.balance ?? 0,
      marginUsed: a.usedMargin ?? 0,
      realizedPnl: a.realizedPnl ?? 0,
      unrealizedPnl: a.unrealizedPnl ?? 0,
      netLiq: a.equity ?? a.balance ?? 0,
      currency: "USD",
      environment: this.environment,
    }));
  }

  async getPositions(accountId?: string): Promise<NormalizedPosition[]> {
    const params = accountId ? `?accountId=${accountId}` : "";
    const positions = await this.apiFetch<PxPosition[]>(
      `/api/Position/searchOpen${params}`
    );

    return positions.map((p) => ({
      id: String(p.id),
      provider: "topstepx" as const,
      accountId: String(p.accountId),
      instrument: p.contractId ?? "NQ",
      side: p.size > 0 ? "long" as const : p.size < 0 ? "short" as const : "flat" as const,
      quantity: Math.abs(p.size),
      avgPrice: p.averagePrice ?? 0,
      currentPrice: p.lastPrice ?? p.averagePrice ?? 0,
      unrealizedPnl: p.unrealizedPnl ?? 0,
      realizedPnl: p.realizedPnl ?? 0,
      timestamp: p.timestamp ?? new Date().toISOString(),
    }));
  }

  async getOpenOrders(accountId?: string): Promise<NormalizedOrder[]> {
    const params = accountId ? `?accountId=${accountId}` : "";
    const orders = await this.apiFetch<PxOrder[]>(
      `/api/Order/searchOpen${params}`
    );
    return orders.map(mapPxOrder);
  }

  async placeOrder(
    request: OrderRequest,
    accountId: string
  ): Promise<NormalizedOrder> {
    const body = {
      accountId: Number(accountId),
      contractId: request.instrument,
      type: mapPxOrderType(request.type),
      side: request.side === "buy" ? 1 : 2,
      size: request.quantity,
      limitPrice: request.type === "limit" || request.type === "stop_limit"
        ? request.price
        : null,
      stopPrice: request.type === "stop" || request.type === "stop_limit"
        ? request.stopPrice
        : null,
      customTag: request.idempotencyKey ?? null,
    };

    log.execution.info(`TopstepX placeOrder: ${JSON.stringify(body)}`);

    const result = await this.apiFetch<PxOrder>("/api/Order/place", {
      method: "POST",
      body: JSON.stringify(body),
    });

    return mapPxOrder(result);
  }

  async cancelOrder(orderId: string): Promise<{ ok: boolean; message: string }> {
    try {
      await this.apiFetch("/api/Order/cancel", {
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
    const positions = await this.getPositions(accountId);
    const pos = positions.find(
      (p) => p.instrument === instrument || p.instrument.includes(instrument)
    );

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
      provider: "topstepx",
      status: hasToken
        ? "healthy"
        : this.consecutiveFailures > 0
          ? "degraded"
          : "unknown",
      connected: hasToken,
      lastSuccessfulConnection: this.lastSuccessAt,
      lastSuccessfulAuthRefresh: hasToken ? new Date().toISOString() : null,
      latencyMs: null,
      consecutiveFailures: this.consecutiveFailures,
      message: hasToken
        ? `Authenticated (${this.environment}) — personal device only`
        : "Not authenticated",
    };
  }
}

// ─── ProjectX type mappings ──────────────────────────────────

interface PxAccount {
  id: number;
  name?: string;
  balance?: number;
  equity?: number;
  usedMargin?: number;
  realizedPnl?: number;
  unrealizedPnl?: number;
}

interface PxPosition {
  id: number;
  accountId: number;
  contractId?: string;
  size: number;
  averagePrice?: number;
  lastPrice?: number;
  unrealizedPnl?: number;
  realizedPnl?: number;
  timestamp?: string;
}

interface PxOrder {
  id: number;
  accountId: number;
  contractId?: string;
  type: number;
  side: number;
  size: number;
  limitPrice?: number | null;
  stopPrice?: number | null;
  filledSize?: number;
  averageFillPrice?: number | null;
  status: number;
  customTag?: string | null;
  createdAt?: string;
  modifiedAt?: string;
}

function mapPxOrder(o: PxOrder): NormalizedOrder {
  return {
    id: String(o.id),
    provider: "topstepx",
    providerOrderId: String(o.id),
    idempotencyKey: o.customTag ?? String(o.id),
    accountId: String(o.accountId),
    instrument: o.contractId ?? "NQ",
    side: o.side === 1 ? "buy" : "sell",
    type: reversePxOrderType(o.type),
    quantity: o.size,
    price: o.limitPrice ?? null,
    stopPrice: o.stopPrice ?? null,
    filledQuantity: o.filledSize ?? 0,
    avgFillPrice: o.averageFillPrice ?? null,
    status: mapPxStatus(o.status),
    createdAt: o.createdAt ?? new Date().toISOString(),
    updatedAt: o.modifiedAt ?? new Date().toISOString(),
  };
}

// ProjectX order types: 1=Market, 2=Limit, 3=Stop, 4=StopLimit
function mapPxOrderType(type: string): number {
  const map: Record<string, number> = {
    market: 1,
    limit: 2,
    stop: 3,
    stop_limit: 4,
  };
  return map[type] ?? 1;
}

function reversePxOrderType(pxType: number): NormalizedOrder["type"] {
  const map: Record<number, NormalizedOrder["type"]> = {
    1: "market",
    2: "limit",
    3: "stop",
    4: "stop_limit",
  };
  return map[pxType] ?? "market";
}

// ProjectX order statuses (numeric)
function mapPxStatus(pxStatus: number): OrderStatus {
  const map: Record<number, OrderStatus> = {
    0: "pending",
    1: "working",
    2: "filled",
    3: "cancelled",
    4: "rejected",
    5: "expired",
    6: "partially_filled",
  };
  return map[pxStatus] ?? "pending";
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
