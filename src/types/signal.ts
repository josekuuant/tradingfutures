import { z } from "zod";

// ─── Signal action ───────────────────────────────────────────

export const SIGNAL_ACTIONS = ["BUY", "SELL", "NO_TRADE"] as const;
export type SignalAction = (typeof SIGNAL_ACTIONS)[number];

// ─── Claude response schema (institutional format) ──────────
// Accepts the new institutional output schema from the system prompt.
// The parser normalizes both old and new formats into this shape.

export const claudeSignalResponseSchema = z.object({
  // Core signal — accepts both "signal" and "action" keys
  action: z.enum(SIGNAL_ACTIONS).optional(),
  signal: z.enum(SIGNAL_ACTIONS).optional(),

  // Confidence: 0-100 integer or 0-1 float (parser normalizes to 0-1)
  confidence: z.number().min(0).max(100),

  // Reasoning: string or array of strings (parser normalizes to string)
  reasoning: z.union([
    z.string().min(1),
    z.array(z.string()),
  ]),

  // Price levels
  entry_price: z.number().nullable().optional(),
  entry_zone: z.object({
    min: z.number().nullable(),
    max: z.number().nullable(),
  }).optional(),
  stop_loss: z.number().nullable(),
  take_profit: z.number().nullable().optional(),
  take_profit_1: z.number().nullable().optional(),
  take_profit_2: z.number().nullable().optional(),
  risk_reward_ratio: z.number().nullable().optional(),
  risk_reward_estimate: z.string().optional(),

  // Context
  invalidation: z.string().optional().default(""),
  invalidation_condition: z.string().optional().default(""),
  market_context: z.string().optional().default(""),
  market_state: z.string().optional().default(""),
  bias: z.string().optional().default(""),
  setup_type: z.string().optional().default(""),
  warning: z.string().optional().default(""),
}).refine(
  (data) => data.action != null || data.signal != null,
  { message: "Either 'action' or 'signal' must be provided" }
);

export type ClaudeSignalResponseRaw = z.infer<typeof claudeSignalResponseSchema>;

// ─── Normalized signal response (after parsing) ─────────────

export interface ClaudeSignalResponse {
  action: SignalAction;
  confidence: number; // 0-1
  reasoning: string;
  entry_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  risk_reward_ratio: number | null;
  invalidation: string;
  market_context: string;
  // New institutional fields
  market_state: string;
  bias: string;
  setup_type: string;
  take_profit_2: number | null;
  warning: string;
}

// ─── Persisted signal ────────────────────────────────────────

export interface Signal {
  id: string;
  strategyId: string;
  strategyName: string;
  promptId: string;
  promptName: string;
  action: SignalAction;
  confidence: number;
  reasoning: string;
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  takeProfit2: number | null;
  riskRewardRatio: number | null;
  invalidation: string;
  marketContext: string;
  marketState: string;
  bias: string;
  setupType: string;
  warning: string;
  instrument: string;
  timeframe: string;
  currentPrice: number;
  // Audit
  claudeModel: string;
  systemPromptSent: string;
  userPromptSent: string;
  rawResponse: string;
  durationMs: number;
  // Metadata
  createdAt: string;
}

// ─── Engine input ────────────────────────────────────────────

export interface SignalEngineInput {
  instrument?: string;
  timeframe?: string;
  /** Explicit flag for manual trigger — only bypasses cooldown, not dedup/validation */
  manualTrigger?: boolean;
}

// ─── Engine result ───────────────────────────────────────────

export type SignalEngineResult =
  | { success: true; signal: Signal }
  | { success: false; error: string; code: SignalErrorCode };

export type SignalErrorCode =
  | "NO_STRATEGY"
  | "NO_PROMPT"
  | "NO_API_KEY"
  | "MARKET_DATA_FAILED"
  | "FILTERED"
  | "CLAUDE_API_ERROR"
  | "CLAUDE_TIMEOUT"
  | "INVALID_RESPONSE"
  | "PARSE_ERROR"
  | "UNKNOWN";
