import type {
  ExecutionProviderAdapter,
  ExecutionProvider,
  NormalizedAccount,
  NormalizedPosition,
  NormalizedOrder,
  OrderRequest,
  ProviderHealth,
} from "@/types/execution";

/**
 * Mock adapter for development and dry-run mode.
 * Simulates a paper trading account for any provider.
 */
export class MockExecutionAdapter implements ExecutionProviderAdapter {
  readonly provider: ExecutionProvider;
  readonly name: string;

  private orders: NormalizedOrder[] = [];
  private orderCounter = 0;
  private connected = false;

  constructor(provider: ExecutionProvider = "tradovate") {
    this.provider = provider;
    this.name = `${provider}-mock`;
  }

  async connect() {
    this.connected = true;
    return { ok: true, message: `Mock ${this.provider} adapter connected` };
  }

  async disconnect() {
    this.connected = false;
  }

  async getAccounts(): Promise<NormalizedAccount[]> {
    return [
      {
        id: `${this.provider.toUpperCase()}-PAPER-001`,
        name: `Paper Account (${this.provider})`,
        provider: this.provider,
        balance: 50000,
        cashBalance: 47500,
        marginUsed: 2500,
        realizedPnl: 325.5,
        unrealizedPnl: -75.25,
        netLiq: 50250.25,
        currency: "USD",
        environment: "demo",
      },
    ];
  }

  async getPositions(): Promise<NormalizedPosition[]> {
    return [];
  }

  async getOpenOrders(): Promise<NormalizedOrder[]> {
    return this.orders.filter(
      (o) => o.status === "working" || o.status === "pending"
    );
  }

  async placeOrder(
    req: OrderRequest,
    accountId: string
  ): Promise<NormalizedOrder> {
    const now = new Date().toISOString();
    const id = `MOCK-${++this.orderCounter}`;

    const order: NormalizedOrder = {
      id,
      provider: this.provider,
      providerOrderId: id,
      idempotencyKey: req.idempotencyKey ?? id,
      accountId,
      instrument: req.instrument,
      side: req.side,
      type: req.type,
      quantity: req.quantity,
      price: req.price ?? null,
      stopPrice: req.stopPrice ?? null,
      filledQuantity: req.type === "market" ? req.quantity : 0,
      avgFillPrice: req.type === "market" ? (req.price ?? 19850) : null,
      status: req.type === "market" ? "filled" : "working",
      createdAt: now,
      updatedAt: now,
    };

    this.orders.unshift(order);
    if (this.orders.length > 100) this.orders.length = 100;
    return order;
  }

  async cancelOrder(orderId: string) {
    const order = this.orders.find((o) => o.id === orderId);
    if (order) {
      order.status = "cancelled";
      order.updatedAt = new Date().toISOString();
      return { ok: true, message: `Order ${orderId} cancelled` };
    }
    return { ok: false, message: `Order ${orderId} not found` };
  }

  async flattenPosition(
    instrument: string,
    accountId: string
  ): Promise<NormalizedOrder> {
    return this.placeOrder(
      { instrument, side: "sell", type: "market", quantity: 1 },
      accountId
    );
  }

  async getHealth(): Promise<ProviderHealth> {
    return {
      provider: this.provider,
      status: this.connected ? "healthy" : "unknown",
      connected: this.connected,
      lastSuccessfulConnection: this.connected
        ? new Date().toISOString()
        : null,
      lastSuccessfulAuthRefresh: null,
      latencyMs: this.connected ? Math.floor(Math.random() * 5) + 1 : null,
      consecutiveFailures: 0,
      message: this.connected
        ? "Mock adapter active"
        : "Not connected",
    };
  }
}
