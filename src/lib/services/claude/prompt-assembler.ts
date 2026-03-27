import type { Strategy } from "@/types/strategy";
import type { Prompt } from "@/types/prompt";
import type { MarketSnapshot } from "@/types/market";
import { renderTemplate } from "@/lib/services/prompts";
import { INSTITUTIONAL_SYSTEM_PROMPT } from "./system-prompt";

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
  snapshot: MarketSnapshot,
  candleCount = 50
): AssembledPrompt {
  const variables = buildVariables(strategy, snapshot, candleCount);

  // Render user prompt template with variables
  const userPrompt = renderTemplate(prompt.userPromptTemplate, variables);

  // System prompt priority:
  // 1. Custom system prompt from Prompt Studio (if defined)
  // 2. Institutional default system prompt
  let systemPrompt: string;
  if (prompt.systemPrompt && prompt.systemPrompt.trim().length > 0) {
    systemPrompt = renderTemplate(prompt.systemPrompt, variables);
  } else {
    systemPrompt = INSTITUTIONAL_SYSTEM_PROMPT;
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
  snapshot: MarketSnapshot,
  candleCount: number
): Record<string, string> {
  const q = snapshot.quote;
  const l = snapshot.levels;
  const candles = snapshot.recentCandles;

  const recentCandles = candles.slice(-candleCount);
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
    candle_count: String(recentCandles.length),
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
    tp1_rule: strategy.tp1 || "Not specified",
    tp2_rule: strategy.tp2 || "Not specified",
    min_rr: String(strategy.minRR),
    volatility_filter: strategy.volatilityFilter || "None",
    volume_filter: strategy.volumeFilter || "None",
    schedule_filter: strategy.scheduleFilter || "None",
    news_filter: strategy.newsFilter || "None",
    timestamp: new Date().toISOString(),
  };
}

function fmt(v: number | null): string {
  return v != null ? v.toFixed(2) : "N/A";
}
