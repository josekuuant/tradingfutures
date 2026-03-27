// ─── Execution Provider Identity ─────────────────────────────

export const EXECUTION_PROVIDERS = [
  "tradovate",
  "rithmic",
  "ninjatrader",
  "topstepx",
] as const;

export type ExecutionProvider = (typeof EXECUTION_PROVIDERS)[number];

// ─── Execution Modes ─────────────────────────────────────────

export type ExecutionMode =
  | "disabled"
  | "monitor"        // read-only: account, positions, orders
  | "dry_run"         // simulates execution, logs but doesn't send
  | "manual_approval" // queues order, requires explicit confirm
  | "semi_auto"       // executes if all guardrails pass
  | "full_auto";      // executes automatically (dangerous)

// ─── Normalized Account ──────────────────────────────────────

export interface NormalizedAccount {
  id: string;
  name: string;
  provider: ExecutionProvider;
  balance: number;
  cashBalance: number;
  marginUsed: number;
  realizedPnl: number;
  unrealizedPnl: number;
  netLiq: number;
  currency: string;
  environment: "demo" | "sandbox" | "production";
}

// ─── Normalized Position ─────────────────────────────────────

export interface NormalizedPosition {
  id: string;
  provider: ExecutionProvider;
  accountId: string;
  instrument: string;
  side: "long" | "short" | "flat";
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  realizedPnl: number;
  timestamp: string;
}

// ─── Normalized Order ────────────────────────────────────────

export type OrderStatus =
  | "pending"
  | "working"
  | "partially_filled"
  | "filled"
  | "cancelled"
  | "rejected"
  | "expired";

export type OrderSide = "buy" | "sell";

export type OrderType =
  | "market"
  | "limit"
  | "stop"
  | "stop_limit";

export interface NormalizedOrder {
  id: string;
  provider: ExecutionProvider;
  providerOrderId: string; // native ID from the broker
  idempotencyKey: string;
  accountId: string;
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

// ─── Order Request ───────────────────────────────────────────

export interface OrderRequest {
  instrument: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  price?: number;
  stopPrice?: number;
  idempotencyKey?: string; // auto-generated if not provided
}

// ─── Order Result ────────────────────────────────────────────

export interface OrderResult {
  success: boolean;
  order?: NormalizedOrder;
  error?: string;
  errorCode?: ExecutionErrorCode;
  requiresApproval?: boolean;
  dryRun?: boolean;
}

export type ExecutionErrorCode =
  | "DISABLED"
  | "MONITOR_MODE"
  | "DUPLICATE_ORDER"
  | "POSITION_LIMIT"
  | "COOLDOWN"
  | "SLIPPAGE_GUARD"
  | "CIRCUIT_BREAKER"
  | "PROVIDER_ERROR"
  | "RATE_LIMIT"
  | "UNKNOWN";

// ─── Provider Health ─────────────────────────────────────────

export type ProviderHealthStatus = "healthy" | "degraded" | "down" | "unknown";

export interface ProviderHealth {
  provider: ExecutionProvider;
  status: ProviderHealthStatus;
  connected: boolean;
  lastSuccessfulConnection: string | null;
  lastSuccessfulAuthRefresh: string | null;
  latencyMs: number | null;
  consecutiveFailures: number;
  message: string;
}

// ─── Unified Execution State ─────────────────────────────────

export interface UnifiedExecutionState {
  mode: ExecutionMode;
  activeProvider: ExecutionProvider | null;
  providers: ProviderHealth[];
  accounts: NormalizedAccount[];
  positions: NormalizedPosition[];
  orders: NormalizedOrder[];
  guardrails: GuardrailConfig;
  lastUpdated: string | null;
}

// ─── Guardrails ──────────────────────────────────────────────

export interface GuardrailConfig {
  maxPositionsPerSymbol: number;
  maxSlippageTicks: number;
  orderCooldownSeconds: number;
  circuitBreakerThreshold: number; // consecutive failures before tripping
  circuitBreakerResetSeconds: number;
  maxOrdersPerHour: number;
}

export const DEFAULT_GUARDRAILS: GuardrailConfig = {
  maxPositionsPerSymbol: 1,
  maxSlippageTicks: 4,
  orderCooldownSeconds: 30,
  circuitBreakerThreshold: 3,
  circuitBreakerResetSeconds: 300,
  maxOrdersPerHour: 20,
};

// ─── Proposed Order (approval queue) ─────────────────────────

export type ProposedOrderStatus =
  | "proposed"
  | "approved"
  | "submitted"
  | "acknowledged"
  | "rejected"
  | "cancelled"
  | "filled"
  | "partially_filled";

export interface ProposedOrder {
  id: string;
  signalId: string | null;
  provider: ExecutionProvider;
  instrument: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  price: number | null;
  stopPrice: number | null;
  status: ProposedOrderStatus;
  // Signal context
  signalAction: string;
  signalConfidence: number;
  signalReasoning: string;
  strategyName: string;
  // Guardrail results
  guardrailsPassed: boolean;
  guardrailDetails: string;
  // Lifecycle
  rejectionReason: string;
  brokerOrderId: string | null;
  avgFillPrice: number | null;
  filledQuantity: number;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  submittedAt: string | null;
  filledAt: string | null;
}

// ─── Expanded Guardrail Config ───────────────────────────────

export interface ExpandedGuardrailConfig extends GuardrailConfig {
  maxDailyLossPercent: number;
  maxNotionalPerOrder: number;
  minClaudeConfidence: number;
  sessionAllowedHoursET: [number, number];
  newsLockoutMinutes: number;
}

export const DEFAULT_EXPANDED_GUARDRAILS: ExpandedGuardrailConfig = {
  ...DEFAULT_GUARDRAILS,
  maxDailyLossPercent: 4,
  maxNotionalPerOrder: 100000,
  minClaudeConfidence: 0.6,
  sessionAllowedHoursET: [9.5, 16],
  newsLockoutMinutes: 15,
};

// ─── Execution Provider Adapter Interface ────────────────────

export interface ExecutionProviderAdapter {
  readonly provider: ExecutionProvider;
  readonly name: string;

  connect(): Promise<{ ok: boolean; message: string }>;
  disconnect(): Promise<void>;
  getAccounts(): Promise<NormalizedAccount[]>;
  getPositions(accountId?: string): Promise<NormalizedPosition[]>;
  getOpenOrders(accountId?: string): Promise<NormalizedOrder[]>;
  placeOrder(request: OrderRequest, accountId: string): Promise<NormalizedOrder>;
  cancelOrder(orderId: string): Promise<{ ok: boolean; message: string }>;
  flattenPosition(instrument: string, accountId: string): Promise<NormalizedOrder>;
  getHealth(): Promise<ProviderHealth>;
}
