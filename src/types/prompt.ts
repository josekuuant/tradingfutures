import { z } from "zod";

// ─── Template variables available for injection ──────────────

export const TEMPLATE_VARIABLES = [
  { key: "instrument", description: "Active instrument (NQ or MNQ)" },
  { key: "timeframe", description: "Active timeframe (e.g. 5m)" },
  { key: "current_price", description: "Last traded price" },
  { key: "bid", description: "Current bid price" },
  { key: "ask", description: "Current ask price" },
  { key: "spread", description: "Bid-ask spread" },
  { key: "volume", description: "Session volume" },
  { key: "ohlcv_data", description: "Recent OHLCV candles as JSON" },
  { key: "session_high", description: "Today's session high" },
  { key: "session_low", description: "Today's session low" },
  { key: "vwap", description: "Volume-weighted average price" },
  { key: "overnight_high", description: "Overnight session high" },
  { key: "overnight_low", description: "Overnight session low" },
  { key: "prev_day_high", description: "Previous day high" },
  { key: "prev_day_low", description: "Previous day low" },
  { key: "prev_day_close", description: "Previous day close" },
  { key: "opening_range_high", description: "Opening range high" },
  { key: "opening_range_low", description: "Opening range low" },
  { key: "strategy_name", description: "Active strategy name" },
  { key: "context_conditions", description: "Strategy context conditions" },
  { key: "entry_conditions", description: "Strategy entry conditions" },
  { key: "invalidation", description: "Strategy invalidation rules" },
  { key: "no_trade_rules", description: "Strategy no-trade rules" },
  { key: "timestamp", description: "Current UTC timestamp" },
] as const;

// ─── Prompt schema ───────────────────────────────────────────

export const promptSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional().default(""),
  tag: z.string().max(30).optional().default(""),

  // Core prompt content
  systemPrompt: z.string().max(15000).optional().default(""),
  userPromptTemplate: z.string().min(1, "User prompt is required").max(15000),

  // Expected output
  outputSchema: z.string().max(5000).optional().default(""),
  outputValidationRules: z.string().max(2000).optional().default(""),
});

export type PromptFormData = z.infer<typeof promptSchema>;
export const createPromptSchema = promptSchema;
export const updatePromptSchema = promptSchema.partial();
export type CreatePromptPayload = z.infer<typeof createPromptSchema>;
export type UpdatePromptPayload = z.infer<typeof updatePromptSchema>;

// ─── Full prompt (with DB fields) ────────────────────────────

export interface Prompt extends PromptFormData {
  id: string;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Prompt version snapshot ─────────────────────────────────

export interface PromptVersion {
  id: string;
  promptId: string;
  version: number;
  systemPrompt: string;
  userPromptTemplate: string;
  outputSchema: string;
  outputValidationRules: string;
  createdAt: string;
}

// ─── Test run ────────────────────────────────────────────────

export interface PromptTestRun {
  id: string;
  promptId: string;
  inputVariables: string; // JSON
  renderedPrompt: string;
  response: string;
  durationMs: number;
  createdAt: string;
}

// ─── Default output schema ───────────────────────────────────

export const DEFAULT_OUTPUT_SCHEMA = `{
  "action": "BUY" | "SELL" | "NO_TRADE",
  "confidence": 0.0 - 1.0,
  "reasoning": "string",
  "entry_price": number | null,
  "stop_loss": number | null,
  "take_profit": number | null,
  "risk_reward_ratio": number | null
}`;
