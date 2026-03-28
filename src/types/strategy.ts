import { z } from "zod";
import { INSTRUMENTS, TIMEFRAMES } from "@/types/market";

// Re-export from market.ts (single source of truth)
export { INSTRUMENTS, TIMEFRAMES };

// ─── Strategy schema ─────────────────────────────────────────

export const strategySchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  description: z.string().max(5000).optional().default(""),
  tag: z.string().max(30).optional().default(""),
  instrument: z.enum(INSTRUMENTS).default("NQ").catch("NQ"),
  timeframes: z.preprocess(
    (val) => {
      // Accept string "5m" → ["5m"], or array, or comma-separated
      if (typeof val === "string") return [val];
      if (Array.isArray(val)) return val;
      return ["5m"];
    },
    z.array(z.string()).min(1).default(["5m"])
  ),

  // Context conditions
  contextConditions: z.string().max(10000).optional().default(""),

  // Entry conditions
  entryConditions: z.string().max(10000).optional().default(""),

  // Invalidation
  invalidation: z.string().max(5000).optional().default(""),

  // Risk management
  tp1: z.string().max(2000).optional().default(""),
  tp2: z.string().max(2000).optional().default(""),
  minRR: z.coerce.number().min(0).max(20).optional().default(2),

  // Filters
  volatilityFilter: z.string().max(5000).optional().default(""),
  volumeFilter: z.string().max(5000).optional().default(""),
  scheduleFilter: z.string().max(5000).optional().default(""),
  newsFilter: z.string().max(5000).optional().default(""),

  // No-trade rules
  noTradeRules: z.string().max(10000).optional().default(""),

  // Claude prompt
  promptTemplate: z.string().max(10000).optional().default(""),
});

export type StrategyFormData = z.infer<typeof strategySchema>;

// ─── Full strategy (with DB fields) ─────────────────────────

export interface Strategy extends StrategyFormData {
  id: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── API payloads ────────────────────────────────────────────

export const createStrategySchema = strategySchema;
export const updateStrategySchema = strategySchema.partial();

export type CreateStrategyPayload = z.infer<typeof createStrategySchema>;
export type UpdateStrategyPayload = z.infer<typeof updateStrategySchema>;

// ─── Section config (for accordion UI) ──────────────────────

export interface StrategySection {
  id: string;
  label: string;
  fields: StrategySectionField[];
}

export interface StrategySectionField {
  key: keyof StrategyFormData;
  label: string;
  type: "text" | "textarea" | "number" | "select" | "multiselect";
  placeholder: string;
  required?: boolean;
  options?: { value: string; label: string }[];
}

export const STRATEGY_SECTIONS: StrategySection[] = [
  {
    id: "general",
    label: "General",
    fields: [
      { key: "name", label: "Strategy Name", type: "text", placeholder: "e.g. NQ Momentum Breakout", required: true },
      { key: "description", label: "Description", type: "textarea", placeholder: "Brief description of the strategy thesis..." },
      { key: "tag", label: "Tag", type: "text", placeholder: "e.g. breakout, reversal, scalp" },
      { key: "instrument", label: "Instrument", type: "select", placeholder: "", options: INSTRUMENTS.map((i) => ({ value: i, label: i })) },
      { key: "timeframes", label: "Timeframes", type: "multiselect", placeholder: "", required: true, options: TIMEFRAMES.map((t) => ({ value: t, label: t })) },
    ],
  },
  {
    id: "conditions",
    label: "Conditions",
    fields: [
      { key: "contextConditions", label: "Context / Bias Conditions", type: "textarea", placeholder: "e.g. Price above VWAP, daily trend bullish, above previous day high..." },
      { key: "entryConditions", label: "Entry Conditions", type: "textarea", placeholder: "e.g. Pullback to VWAP with bullish engulfing on 5m, volume spike > 2x avg..." },
      { key: "invalidation", label: "Invalidation", type: "textarea", placeholder: "e.g. Break below opening range low, failed breakout retest..." },
    ],
  },
  {
    id: "risk",
    label: "Risk Management",
    fields: [
      { key: "tp1", label: "Take Profit 1", type: "text", placeholder: "e.g. 1:1 at session high or +20 pts" },
      { key: "tp2", label: "Take Profit 2", type: "text", placeholder: "e.g. 1:2 runner with trailing stop" },
      { key: "minRR", label: "Minimum R:R", type: "number", placeholder: "2" },
    ],
  },
  {
    id: "filters",
    label: "Filters",
    fields: [
      { key: "volatilityFilter", label: "Volatility Filter", type: "textarea", placeholder: "e.g. ATR(14) > 15 pts on 5m, avoid low-vol consolidation days..." },
      { key: "volumeFilter", label: "Volume Filter", type: "textarea", placeholder: "e.g. Volume > 50% of 20-day avg by 10:00 AM ET..." },
      { key: "scheduleFilter", label: "Schedule Filter", type: "textarea", placeholder: "e.g. Only trade 09:30–11:30 and 14:00–15:30 ET, avoid first 5 min..." },
      { key: "newsFilter", label: "News Risk Filter", type: "textarea", placeholder: "e.g. No trades 15 min before/after FOMC, CPI, NFP, GDP..." },
    ],
  },
  {
    id: "notrade",
    label: "No-Trade Rules",
    fields: [
      { key: "noTradeRules", label: "No-Trade Conditions", type: "textarea", placeholder: "e.g. Choppy inside day, no clear bias, wide spread > 2 pts, FOMC day before announcement..." },
    ],
  },
  {
    id: "prompt",
    label: "Claude Prompt",
    fields: [
      { key: "promptTemplate", label: "Prompt Template", type: "textarea", placeholder: "Custom prompt for Claude analysis. Use {{instrument}}, {{timeframe}}, {{ohlcv_data}}, {{current_price}}, {{session_levels}}..." },
    ],
  },
];
