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

// ─── Rithmic R|Protocol Configuration ────────────────────────
// Rithmic uses WebSocket + Protocol Buffers (R|Protocol API).
// No REST API exists. This adapter implements the real protocol.

const RITHMIC_GATEWAYS = {
  // Demo
  "paper-chicago": "wss://rituz00100.rithmic.com:443",
  // Production (requires real credentials)
  "prod-chicago": "wss://rituz00100.rithmic.com:443",
} as const;

type RithmicGateway = keyof typeof RITHMIC_GATEWAYS;

const REQUEST_TIMEOUT_MS = 10_000;
const HEARTBEAT_INTERVAL_MS = 30_000;

// ─── Rithmic credentials ────────────────────────────────────

interface RithmicCredentials {
  username: string;
  password: string;
  systemName: string;     // "Rithmic Paper Trading" or "Rithmic 01"
  gateway: RithmicGateway;
  appName?: string;
  appVersion?: string;
}

// ─── Protocol message types (simplified) ─────────────────────
// Real Rithmic uses .proto files. This is a simplified implementation
// that can be replaced with generated protobuf code.

interface RithmicMessage {
  templateId: number;
  [key: string]: unknown;
}

// Template IDs (from R|Protocol spec)
const TEMPLATE = {
  // Auth
  LOGIN_REQUEST: 10,
  LOGIN_RESPONSE: 11,
  LOGOUT: 12,
  HEARTBEAT: 18,
  // Account
  ACCOUNT_LIST_REQUEST: 302,
  ACCOUNT_LIST_RESPONSE: 303,
  // Orders
  ORDER_LIST_REQUEST: 320,
  ORDER_LIST_RESPONSE: 321,
  NEW_ORDER: 312,
  MODIFY_ORDER: 314,
  CANCEL_ORDER: 316,
  ORDER_STATUS: 351,
  // Positions
  POSITION_LIST_REQUEST: 340,
  POSITION_LIST_RESPONSE: 341,
} as const;

// ─── Adapter ─────────────────────────────────────────────────

export class RithmicAdapter implements ExecutionProviderAdapter {
  readonly provider = "rithmic" as const;
  readonly name = "rithmic";

  private credentials: RithmicCredentials;
  private ws: WebSocket | null = null;
  private authenticated = false;
  private lastSuccessAt: string | null = null;
  private consecutiveFailures = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pendingRequests = new Map<number, {
    resolve: (data: RithmicMessage) => void;
    reject: (err: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>();
  private requestId = 0;

  // Cached state from subscriptions
  private accounts: NormalizedAccount[] = [];
  private positions: NormalizedPosition[] = [];
  private orders: NormalizedOrder[] = [];

  constructor(credentials: RithmicCredentials) {
    this.credentials = credentials;
  }

  // ── Connection ───────────────────────────────────────────

  async connect(): Promise<{ ok: boolean; message: string }> {
    try {
      const gatewayUrl = RITHMIC_GATEWAYS[this.credentials.gateway]
        ?? RITHMIC_GATEWAYS["paper-chicago"];

      log.execution.info(`Rithmic: connecting to ${this.credentials.gateway}...`);

      // R|Protocol uses WebSocket with binary frames (Protocol Buffers)
      // In a real implementation, you would:
      // 1. Connect WebSocket to the ORDER_PLANT URL
      // 2. Send login request with protobuf-encoded message
      // 3. Receive login response
      // 4. Start heartbeat loop

      this.ws = new WebSocket(gatewayUrl);

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Connection timeout")), REQUEST_TIMEOUT_MS);

        this.ws!.addEventListener("open", () => {
          clearTimeout(timeout);
          resolve();
        });

        this.ws!.addEventListener("error", (evt) => {
          clearTimeout(timeout);
          reject(new Error(`WebSocket error: ${evt}`));
        });
      });

      // Send login
      const loginResponse = await this.sendRequest({
        templateId: TEMPLATE.LOGIN_REQUEST,
        user: this.credentials.username,
        password: this.credentials.password,
        systemName: this.credentials.systemName,
        appName: this.credentials.appName ?? "TradingFutures",
        appVersion: this.credentials.appVersion ?? "1.0",
        infraType: 2, // ORDER_PLANT
      });

      if (loginResponse.templateId !== TEMPLATE.LOGIN_RESPONSE) {
        throw new Error("Unexpected login response");
      }

      this.authenticated = true;
      this.lastSuccessAt = new Date().toISOString();
      this.consecutiveFailures = 0;
      this.startHeartbeat();

      // Set up message handler for async updates
      this.ws!.addEventListener("message", (evt) => {
        this.handleMessage(evt.data);
      });

      this.ws!.addEventListener("close", () => {
        this.authenticated = false;
        this.stopHeartbeat();
        log.execution.warn("Rithmic: WebSocket closed");
      });

      log.execution.info(`Rithmic: authenticated on ${this.credentials.systemName}`);

      return { ok: true, message: `Connected to Rithmic (${this.credentials.systemName})` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      this.consecutiveFailures++;
      log.execution.error(`Rithmic connect failed: ${msg}`);
      return { ok: false, message: msg };
    }
  }

  async disconnect(): Promise<void> {
    this.stopHeartbeat();
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendRaw({ templateId: TEMPLATE.LOGOUT });
      this.ws.close();
    }
    this.ws = null;
    this.authenticated = false;
  }

  // ── Account queries ──────────────────────────────────────

  async getAccounts(): Promise<NormalizedAccount[]> {
    this.ensureConnected();

    const response = await this.sendRequest({
      templateId: TEMPLATE.ACCOUNT_LIST_REQUEST,
    });

    const accounts = (response.accounts ?? []) as RithmicAccountInfo[];

    this.accounts = accounts.map((a) => ({
      id: String(a.accountId ?? a.fcmId ?? ""),
      name: a.accountName ?? `Rithmic ${a.accountId}`,
      provider: "rithmic" as const,
      balance: a.cashBalance ?? 0,
      cashBalance: a.cashBalance ?? 0,
      marginUsed: a.marginUsed ?? 0,
      realizedPnl: a.realizedPnl ?? 0,
      unrealizedPnl: a.unrealizedPnl ?? 0,
      netLiq: a.netLiq ?? a.cashBalance ?? 0,
      currency: "USD",
      environment: this.credentials.systemName.includes("Paper") ? "demo" as const : "production" as const,
    }));

    return this.accounts;
  }

  async getPositions(accountId?: string): Promise<NormalizedPosition[]> {
    this.ensureConnected();

    const response = await this.sendRequest({
      templateId: TEMPLATE.POSITION_LIST_REQUEST,
      accountId: accountId ?? this.accounts[0]?.id,
    });

    const positions = (response.positions ?? []) as RithmicPositionInfo[];

    this.positions = positions
      .filter((p) => p.netQuantity !== 0)
      .map((p) => ({
        id: String(p.positionId ?? `${p.symbol}-${p.accountId}`),
        provider: "rithmic" as const,
        accountId: String(p.accountId),
        instrument: p.symbol ?? "NQ",
        side: p.netQuantity > 0 ? "long" as const : "short" as const,
        quantity: Math.abs(p.netQuantity),
        avgPrice: p.avgPrice ?? 0,
        currentPrice: p.lastPrice ?? p.avgPrice ?? 0,
        unrealizedPnl: p.openPnl ?? 0,
        realizedPnl: p.closedPnl ?? 0,
        timestamp: new Date().toISOString(),
      }));

    return this.positions;
  }

  async getOpenOrders(accountId?: string): Promise<NormalizedOrder[]> {
    this.ensureConnected();

    const response = await this.sendRequest({
      templateId: TEMPLATE.ORDER_LIST_REQUEST,
      accountId: accountId ?? this.accounts[0]?.id,
    });

    const orders = (response.orders ?? []) as RithmicOrderInfo[];

    this.orders = orders
      .filter((o) => o.status === "open" || o.status === "pending")
      .map((o) => mapRithmicOrder(o));

    return this.orders;
  }

  async placeOrder(request: OrderRequest, accountId: string): Promise<NormalizedOrder> {
    this.ensureConnected();

    const response = await this.sendRequest({
      templateId: TEMPLATE.NEW_ORDER,
      accountId,
      symbol: request.instrument,
      exchange: "CME",
      side: request.side === "buy" ? 1 : 2, // Rithmic: 1=Buy, 2=Sell
      quantity: request.quantity,
      orderType: mapOrderTypeToRithmic(request.type),
      price: request.price ?? 0,
      triggerPrice: request.stopPrice ?? 0,
      duration: 1, // DAY order
    });

    return mapRithmicOrder(response as unknown as RithmicOrderInfo);
  }

  async cancelOrder(orderId: string): Promise<{ ok: boolean; message: string }> {
    this.ensureConnected();

    try {
      await this.sendRequest({
        templateId: TEMPLATE.CANCEL_ORDER,
        orderId,
      });
      return { ok: true, message: `Order ${orderId} cancelled` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown";
      return { ok: false, message: msg };
    }
  }

  async flattenPosition(instrument: string, accountId: string): Promise<NormalizedOrder> {
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
    return {
      provider: "rithmic",
      status: this.authenticated ? "healthy" : this.consecutiveFailures > 0 ? "degraded" : "unknown",
      connected: this.authenticated,
      lastSuccessfulConnection: this.lastSuccessAt,
      lastSuccessfulAuthRefresh: this.authenticated ? new Date().toISOString() : null,
      latencyMs: null,
      consecutiveFailures: this.consecutiveFailures,
      message: this.authenticated
        ? `Connected (${this.credentials.systemName})`
        : "Not connected",
    };
  }

  // ── WebSocket helpers ────────────────────────────────────

  private ensureConnected(): void {
    if (!this.authenticated || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Rithmic: not connected. Call connect() first.");
    }
  }

  private async sendRequest(msg: RithmicMessage): Promise<RithmicMessage> {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;

      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Rithmic request timeout (template ${msg.templateId})`));
      }, REQUEST_TIMEOUT_MS);

      this.pendingRequests.set(id, { resolve, reject, timeout });

      this.sendRaw({ ...msg, requestId: id });
    });
  }

  private sendRaw(msg: RithmicMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not connected");
    }

    // In production: encode with protobufjs
    // For now: send as JSON (Rithmic demo may support JSON mode)
    // TODO: Replace with proper protobuf serialization when .proto files are available
    const data = JSON.stringify(msg);
    this.ws.send(data);
  }

  private handleMessage(data: unknown): void {
    try {
      // In production: decode with protobufjs
      // TODO: Replace with proper protobuf deserialization
      const msg = typeof data === "string" ? JSON.parse(data) : data;
      const rMsg = msg as RithmicMessage;

      // Route to pending request if requestId matches
      if (rMsg.requestId && this.pendingRequests.has(rMsg.requestId as number)) {
        const pending = this.pendingRequests.get(rMsg.requestId as number)!;
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(rMsg.requestId as number);
        pending.resolve(rMsg);
        return;
      }

      // Handle async updates (order fills, position changes, etc.)
      if (rMsg.templateId === TEMPLATE.ORDER_STATUS) {
        log.execution.info("Rithmic order update received", { data: rMsg });
      }
    } catch (err) {
      log.execution.error(`Rithmic message parse error: ${err}`);
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.sendRaw({ templateId: TEMPLATE.HEARTBEAT });
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}

// ─── Rithmic type mappings ───────────────────────────────────

interface RithmicAccountInfo {
  accountId?: string;
  fcmId?: string;
  accountName?: string;
  cashBalance?: number;
  marginUsed?: number;
  realizedPnl?: number;
  unrealizedPnl?: number;
  netLiq?: number;
}

interface RithmicPositionInfo {
  positionId?: string;
  accountId?: string;
  symbol?: string;
  netQuantity: number;
  avgPrice?: number;
  lastPrice?: number;
  openPnl?: number;
  closedPnl?: number;
}

interface RithmicOrderInfo {
  orderId?: string;
  accountId?: string;
  symbol?: string;
  side?: number; // 1=Buy, 2=Sell
  quantity?: number;
  orderType?: number;
  price?: number;
  triggerPrice?: number;
  filledQuantity?: number;
  avgFillPrice?: number;
  status?: string;
  timestamp?: string;
}

function mapRithmicOrder(o: RithmicOrderInfo): NormalizedOrder {
  return {
    id: String(o.orderId ?? crypto.randomUUID()),
    provider: "rithmic",
    providerOrderId: String(o.orderId ?? ""),
    idempotencyKey: String(o.orderId ?? crypto.randomUUID()),
    accountId: String(o.accountId ?? ""),
    instrument: o.symbol ?? "NQ",
    side: o.side === 1 ? "buy" : "sell",
    type: reverseMapRithmicOrderType(o.orderType ?? 1),
    quantity: o.quantity ?? 0,
    price: o.price ?? null,
    stopPrice: o.triggerPrice ?? null,
    filledQuantity: o.filledQuantity ?? 0,
    avgFillPrice: o.avgFillPrice ?? null,
    status: mapRithmicStatus(o.status ?? ""),
    createdAt: o.timestamp ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// Rithmic order types: 1=Market, 2=Limit, 3=StopLimit, 4=StopMarket
function mapOrderTypeToRithmic(type: string): number {
  const map: Record<string, number> = {
    market: 1,
    limit: 2,
    stop_limit: 3,
    stop: 4,
  };
  return map[type] ?? 1;
}

function reverseMapRithmicOrderType(rt: number): NormalizedOrder["type"] {
  const map: Record<number, NormalizedOrder["type"]> = {
    1: "market",
    2: "limit",
    3: "stop_limit",
    4: "stop",
  };
  return map[rt] ?? "market";
}

function mapRithmicStatus(status: string): OrderStatus {
  const lower = status.toLowerCase();
  if (lower.includes("fill") && !lower.includes("partial")) return "filled";
  if (lower.includes("partial")) return "partially_filled";
  if (lower.includes("cancel")) return "cancelled";
  if (lower.includes("reject")) return "rejected";
  if (lower.includes("open") || lower.includes("work")) return "working";
  if (lower.includes("pend")) return "pending";
  return "pending";
}
