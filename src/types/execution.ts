// ─── Execution mode ──────────────────────────────────────────

export type ExecutionMode = "disabled" | "monitor" | "paper" | "manual_confirm";

// ─── Account ─────────────────────────────────────────────────

export interface AccountInfo {
  id: string;
  name: string;
  balance: number;
  cashBalance: number;
  marginUsed: number;
  realizedPnl: number;
  unrealizedPnl: number;
  netLiq: number;
  currency: string;
  environment: "sandbox" | "production";
}

// ─── Positions ───────────────────────────────────────────────

export interface Position {
  id: string;
  instrument: string;
  side: "long" | "short" | "flat";
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  realizedPnl: number;
  timestamp: string;
}

// ─── Orders ──────────────────────────────────────────────────

export type OrderStatus = "pending" | "working" | "filled" | "cancelled" | "rejected";
export type OrderSide = "buy" | "sell";
export type OrderType = "market" | "limit" | "stop" | "stop_limit";

export interface Order {
  id: string;
  instrument: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  price: number | null;
  stopPrice: number | null;
  filledQuantity: number;
  avgFillPrice: number | null;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
}

// ─── Order request (for future execution) ────────────────────

export interface OrderRequest {
  instrument: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  price?: number;
  stopPrice?: number;
}

// ─── Execution state (combined for UI) ───────────────────────

export interface ExecutionState {
  mode: ExecutionMode;
  connected: boolean;
  environment: "sandbox" | "production";
  account: AccountInfo | null;
  positions: Position[];
  orders: Order[];
  lastUpdated: string | null;
}

// ─── Tradovate adapter interface ─────────────────────────────

export interface TradovateAdapter {
  readonly name: string;
  connect(): Promise<{ ok: boolean; message: string }>;
  getAccount(): Promise<AccountInfo>;
  getPositions(): Promise<Position[]>;
  getOrders(): Promise<Order[]>;
  placeOrder(req: OrderRequest): Promise<Order>;
}
