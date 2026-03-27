import { z } from "zod";

// ─── Signal action ───────────────────────────────────────────

export const SIGNAL_ACTIONS = ["BUY", "SELL", "NO_TRADE"] as const;
export type SignalAction = (typeof SIGNAL_ACTIONS)[number];

// ─── Claude response schema (strict) ────────────────────────

export const claudeSignalResponseSchema = z.object({
  action: z.enum(SIGNAL_ACTIONS),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1),
  entry_price: z.number().nullable(),
  stop_loss: z.number().nullable(),
  take_profit: z.number().nullable(),
  risk_reward_ratio: z.number().nullable(),
  invalidation: z.string().optional().default(""),
  market_context: z.string().optional().default(""),
});

export type ClaudeSignalResponse = z.infer<typeof claudeSignalResponseSchema>;

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
  riskRewardRatio: number | null;
  invalidation: string;
  marketContext: string;
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
