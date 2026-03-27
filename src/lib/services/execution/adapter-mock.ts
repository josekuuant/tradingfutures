import type {
  TradovateAdapter,
  AccountInfo,
  Position,
  Order,
  OrderRequest,
} from "@/types/execution";

/**
 * Mock Tradovate adapter for development and paper mode.
 * Returns realistic NQ/MNQ account data.
 * Replace with real TradovateAdapter when ready.
 */
export class MockTradovateAdapter implements TradovateAdapter {
  readonly name = "mock";

  private paperOrders: Order[] = [];
  private orderCounter = 0;

  async connect(): Promise<{ ok: boolean; message: string }> {
    return { ok: true, message: "Mock adapter — no live connection" };
  }

  async getAccount(): Promise<AccountInfo> {
    return {
      id: "MOCK-001",
      name: "Paper Account",
      balance: 50000,
      cashBalance: 47500,
      marginUsed: 2500,
      realizedPnl: 325.5,
      unrealizedPnl: -75.25,
      netLiq: 50250.25,
      currency: "USD",
      environment: "sandbox",
    };
  }

  async getPositions(): Promise<Position[]> {
    return [];
  }

  async getOrders(): Promise<Order[]> {
    return [...this.paperOrders].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async placeOrder(req: OrderRequest): Promise<Order> {
    const now = new Date().toISOString();
    const id = `PAPER-${++this.orderCounter}`;

    const order: Order = {
      id,
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

    this.paperOrders.unshift(order);
    if (this.paperOrders.length > 50) this.paperOrders.length = 50;

    return order;
  }
}
