import type { Strategy } from "@/types/strategy";
import type { Prompt } from "@/types/prompt";
import type { MarketSnapshot } from "@/types/market";
import { renderTemplate } from "@/lib/services/prompts";

// ─── Types ───────────────────────────────────────────────────

export interface AssembledPrompt {
  systemPrompt: string;
  userPrompt: string;
  variables: Record<string, string>;
}

// ─── Assembler ───────────────────────────────────────────────

export function assemblePrompt(
  prompt: Prompt,
  strategy: Strategy,
  snapshot: MarketSnapshot
): AssembledPrompt {
  const variables = buildVariables(strategy, snapshot);

  // Render user prompt template with variables
  const userPrompt = renderTemplate(prompt.userPromptTemplate, variables);

  // System prompt: use prompt's system prompt, or build a default
  let systemPrompt = prompt.systemPrompt;
  if (!systemPrompt) {
    systemPrompt = buildDefaultSystemPrompt(prompt);
  } else {
    systemPrompt = renderTemplate(systemPrompt, variables);
  }

  return {
    systemPrompt,
    userPrompt,
    variables,
  };
}

// ─── Variable builder ────────────────────────────────────────

function buildVariables(
  strategy: Strategy,
  snapshot: MarketSnapshot
): Record<string, string> {
  const q = snapshot.quote;
  const l = snapshot.levels;
  const candles = snapshot.recentCandles;

  // Limit candle data to last 20 for token efficiency
  const recentCandles = candles.slice(-20);
  const candleStr = recentCandles
    .map(
      (c) =>
        `${c.timestamp} O:${c.open} H:${c.high} L:${c.low} C:${c.close} V:${c.volume}`
    )
    .join("\n");

  return {
    instrument: q.instrument,
    timeframe: strategy.timeframes[0] ?? "5m",
    current_price: q.lastPrice.toFixed(2),
    bid: q.bidPrice.toFixed(2),
    ask: q.askPrice.toFixed(2),
    spread: q.spread.toFixed(2),
    volume: q.volume.toLocaleString(),
    ohlcv_data: candleStr,
    session_high: fmt(l.sessionHigh),
    session_low: fmt(l.sessionLow),
    vwap: fmt(l.vwap),
    overnight_high: fmt(l.overnightHigh),
    overnight_low: fmt(l.overnightLow),
    prev_day_high: fmt(l.previousDayHigh),
    prev_day_low: fmt(l.previousDayLow),
    prev_day_close: fmt(l.previousDayClose),
    opening_range_high: fmt(l.openingRangeHigh),
    opening_range_low: fmt(l.openingRangeLow),
    strategy_name: strategy.name,
    context_conditions: strategy.contextConditions || "None specified",
    entry_conditions: strategy.entryConditions || "None specified",
    invalidation: strategy.invalidation || "None specified",
    no_trade_rules: strategy.noTradeRules || "None specified",
    timestamp: new Date().toISOString(),
  };
}

function fmt(v: number | null): string {
  return v != null ? v.toFixed(2) : "N/A";
}

// ─── Default system prompt ───────────────────────────────────

function buildDefaultSystemPrompt(prompt: Prompt): string {
  let sys = `You are a professional NQ/MNQ futures analyst. Analyze the provided market data and strategy conditions to generate a trading signal.

You MUST respond with ONLY a valid JSON object matching this exact schema:
${prompt.outputSchema || DEFAULT_SCHEMA}

Rules:
- action MUST be exactly "BUY", "SELL", or "NO_TRADE"
- confidence MUST be a number between 0.0 and 1.0
- reasoning MUST be a concise explanation (2-4 sentences)
- If action is "NO_TRADE", entry_price/stop_loss/take_profit should be null
- If action is "BUY" or "SELL", provide numeric entry_price/stop_loss/take_profit
- risk_reward_ratio should be calculated as |TP - Entry| / |Entry - SL|
- Do NOT include any text before or after the JSON object`;

  if (prompt.outputValidationRules) {
    sys += `\n\nAdditional validation rules:\n${prompt.outputValidationRules}`;
  }

  return sys;
}

const DEFAULT_SCHEMA = `{
  "action": "BUY" | "SELL" | "NO_TRADE",
  "confidence": 0.0 - 1.0,
  "reasoning": "string",
  "entry_price": number | null,
  "stop_loss": number | null,
  "take_profit": number | null,
  "risk_reward_ratio": number | null,
  "invalidation": "string",
  "market_context": "string"
}`;
