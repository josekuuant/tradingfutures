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

// ─── Polymarket API Configuration ────────────────────────────
// Uses the official @polymarket/clob-client SDK for CLOB trading
// and REST APIs for market data and positions.

const CLOB_BASE = "https://clob.polymarket.com";
// Gamma API for public market data: https://gamma-api.polymarket.com
const DATA_BASE = "https://data-api.polymarket.com";
const CHAIN_ID = 137; // Polygon
const REQUEST_TIMEOUT = 15_000;

interface PolymarketCredentials {
  privateKey: string;      // Wallet private key (for L1 auth → derives L2 API key)
  apiKey?: string;         // L2 API key (if already derived)
  apiSecret?: string;      // L2 secret
  apiPassphrase?: string;  // L2 passphrase
  walletAddress?: string;
}

// ─── Adapter ─────────────────────────────────────────────────

export class PolymarketAdapter implements ExecutionProviderAdapter {
  readonly provider = "polymarket" as const;
  readonly name = "polymarket";

  private credentials: PolymarketCredentials;
  private clobClient: unknown = null; // ClobClient from SDK
  private connected = false;
  private lastSuccessAt: string | null = null;
  private consecutiveFailures = 0;

  constructor(credentials: PolymarketCredentials) {
    this.credentials = credentials;
  }

  // ── Connection ───────────────────────────────────────────

  async connect(): Promise<{ ok: boolean; message: string }> {
    try {
      // Dynamic imports — Polymarket SDK + ethers loaded at runtime
      // to avoid build-time type resolution issues with ethers v5
      /* eslint-disable @typescript-eslint/no-require-imports */
      const { ClobClient } = require("@polymarket/clob-client");
      const { ethers } = require("ethers");
      /* eslint-enable @typescript-eslint/no-require-imports */

      const signer = new ethers.Wallet(this.credentials.privateKey);
      const address = await signer.getAddress();

      // If L2 credentials exist, use them directly
      let apiCreds;
      if (this.credentials.apiKey && this.credentials.apiSecret && this.credentials.apiPassphrase) {
        apiCreds = {
          key: this.credentials.apiKey,
          secret: this.credentials.apiSecret,
          passphrase: this.credentials.apiPassphrase,
        };
      }

      this.clobClient = new ClobClient(
        CLOB_BASE,
        CHAIN_ID,
        signer,
        apiCreds
      );

      // Derive API key if not provided
      if (!apiCreds) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const derived = await (this.clobClient as Record<string, (...args: unknown[]) => Promise<{ key: string; secret: string; passphrase: string }>>).createOrDeriveApiKey();
          log.execution.info("Polymarket: L2 API key derived", { address });
          // Store for reuse
          this.credentials.apiKey = derived.key;
          this.credentials.apiSecret = derived.secret;
          this.credentials.apiPassphrase = derived.passphrase;
        } catch (err) {
          log.execution.warn(`Polymarket: API key derivation failed: ${err}`);
        }
      }

      this.credentials.walletAddress = address;
      this.connected = true;
      this.consecutiveFailures = 0;
      this.lastSuccessAt = new Date().toISOString();

      log.execution.info(`Polymarket connected: ${address}`);
      return { ok: true, message: `Connected to Polymarket (${address.slice(0, 6)}...${address.slice(-4)})` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      this.consecutiveFailures++;
      log.execution.error(`Polymarket connect failed: ${msg}`);
      return { ok: false, message: msg };
    }
  }

  async disconnect(): Promise<void> {
    this.clobClient = null;
    this.connected = false;
  }

  // ── Account (balance from Data API) ──────────────────────

  async getAccounts(): Promise<NormalizedAccount[]> {
    const address = this.credentials.walletAddress;
    if (!address) return [];

    try {
      const res = await fetch(`${DATA_BASE}/value?user=${address}`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      });
      const data = await res.json();

      return [{
        id: address,
        name: `Polymarket (${address.slice(0, 6)}...${address.slice(-4)})`,
        provider: "polymarket",
        balance: data.value ?? 0,
        cashBalance: data.value ?? 0,
        marginUsed: 0,
        realizedPnl: 0,
        unrealizedPnl: 0,
        netLiq: data.value ?? 0,
        currency: "USDC",
        environment: "production",
      }];
    } catch (err) {
      log.execution.error(`Polymarket getAccounts failed: ${err}`);
      return [];
    }
  }

  // ── Positions ────────────────────────────────────────────

  async getPositions(): Promise<NormalizedPosition[]> {
    const address = this.credentials.walletAddress;
    if (!address) return [];

    try {
      const res = await fetch(
        `${DATA_BASE}/positions?user=${address}&sortBy=CURRENT&sortDirection=DESC&limit=50`,
        { signal: AbortSignal.timeout(REQUEST_TIMEOUT) }
      );
      const data = await res.json();
      const positions = Array.isArray(data) ? data : data.positions ?? [];

      return positions.map((p: PolyPosition) => ({
        id: String(p.asset ?? p.conditionId ?? ""),
        provider: "polymarket" as const,
        accountId: address,
        instrument: p.title ?? p.slug ?? p.conditionId ?? "Unknown Market",
        side: (p.size ?? 0) > 0 ? "long" as const : "short" as const,
        quantity: Math.abs(p.size ?? 0),
        avgPrice: p.avgPrice ?? 0,
        currentPrice: p.currentPrice ?? p.avgPrice ?? 0,
        unrealizedPnl: p.cashPnl ?? 0,
        realizedPnl: 0,
        timestamp: p.timestamp ?? new Date().toISOString(),
      }));
    } catch (err) {
      log.execution.error(`Polymarket getPositions failed: ${err}`);
      return [];
    }
  }

  // ── Orders ───────────────────────────────────────────────

  async getOpenOrders(): Promise<NormalizedOrder[]> {
    if (!this.clobClient) return [];

    try {
      const client = this.clobClient as never;
      const orders = await client.getOpenOrders();
      return (orders ?? []).map(mapPolyOrder);
    } catch (err) {
      log.execution.error(`Polymarket getOpenOrders failed: ${err}`);
      return [];
    }
  }

  async placeOrder(request: OrderRequest, accountId: string): Promise<NormalizedOrder> {
    if (!this.clobClient) throw new Error("Polymarket not connected");

    const client = this.clobClient as never;

    // Polymarket orders need tokenID, price (0-1), and size
    // The instrument should be the tokenID or market slug
    const order = await client.createAndPostOrder({
      tokenID: request.instrument,
      price: request.price ?? 0.5,
      size: request.quantity,
      side: request.side === "buy" ? "BUY" : "SELL",
      orderType: request.type === "market" ? "IOC" : "GTC",
    });

    log.execution.info(`Polymarket order placed`, { orderId: order?.id });

    return {
      id: String(order?.id ?? crypto.randomUUID()),
      provider: "polymarket",
      providerOrderId: String(order?.id ?? ""),
      idempotencyKey: String(order?.id ?? crypto.randomUUID()),
      accountId,
      instrument: request.instrument,
      side: request.side,
      type: request.type,
      quantity: request.quantity,
      price: request.price ?? null,
      stopPrice: null,
      filledQuantity: order?.filledSize ?? 0,
      avgFillPrice: order?.avgPrice ?? null,
      status: mapPolyStatus(order?.status ?? "live"),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  async cancelOrder(orderId: string): Promise<{ ok: boolean; message: string }> {
    if (!this.clobClient) return { ok: false, message: "Not connected" };

    try {
      const client = this.clobClient as never;
      await client.cancelOrder(orderId);
      return { ok: true, message: `Order ${orderId} cancelled` };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "Cancel failed" };
    }
  }

  async flattenPosition(instrument: string, accountId: string): Promise<NormalizedOrder> {
    const positions = await this.getPositions();
    const pos = positions.find((p) => p.instrument.includes(instrument) || p.id === instrument);

    if (!pos || pos.side === "flat") {
      throw new Error(`No open position for ${instrument}`);
    }

    return this.placeOrder(
      {
        instrument: pos.id, // tokenID
        side: pos.side === "long" ? "sell" : "buy",
        type: "market",
        quantity: pos.quantity,
        price: pos.currentPrice,
      },
      accountId
    );
  }

  async getHealth(): Promise<ProviderHealth> {
    return {
      provider: "polymarket",
      status: this.connected ? "healthy" : this.consecutiveFailures > 0 ? "degraded" : "unknown",
      connected: this.connected,
      lastSuccessfulConnection: this.lastSuccessAt,
      lastSuccessfulAuthRefresh: null,
      latencyMs: null,
      consecutiveFailures: this.consecutiveFailures,
      message: this.connected
        ? `Connected (${this.credentials.walletAddress?.slice(0, 8)}...)`
        : "Not connected",
    };
  }
}

// ─── Polymarket type mappings ────────────────────────────────

interface PolyPosition {
  asset?: string;
  conditionId?: string;
  title?: string;
  slug?: string;
  size?: number;
  avgPrice?: number;
  currentPrice?: number;
  cashPnl?: number;
  timestamp?: string;
}

function mapPolyOrder(o: Record<string, unknown>): NormalizedOrder {
  return {
    id: String(o.id ?? ""),
    provider: "polymarket",
    providerOrderId: String(o.id ?? ""),
    idempotencyKey: String(o.id ?? crypto.randomUUID()),
    accountId: String(o.owner ?? ""),
    instrument: String(o.asset_id ?? o.tokenId ?? ""),
    side: String(o.side ?? "").toLowerCase() === "buy" ? "buy" : "sell",
    type: String(o.order_type ?? "GTC") === "IOC" ? "market" : "limit",
    quantity: Number(o.original_size ?? o.size ?? 0),
    price: Number(o.price ?? 0),
    stopPrice: null,
    filledQuantity: Number(o.size_matched ?? 0),
    avgFillPrice: Number(o.price ?? 0),
    status: mapPolyStatus(String(o.status ?? "live")),
    createdAt: String(o.created_at ?? new Date().toISOString()),
    updatedAt: String(o.updated_at ?? new Date().toISOString()),
  };
}

function mapPolyStatus(status: string): OrderStatus {
  const map: Record<string, OrderStatus> = {
    live: "working",
    matched: "filled",
    cancelled: "cancelled",
    expired: "expired",
  };
  return map[status.toLowerCase()] ?? "pending";
}
