import {
  claudeSignalResponseSchema,
  type ClaudeSignalResponse,
  type SignalAction,
} from "@/types/signal";

// ─── Types ───────────────────────────────────────────────────

export interface ParseOptions {
  /** Minimum confidence to accept BUY/SELL (below → forced NO_TRADE) */
  minConfidence?: number;
}

export type ParseResult =
  | { success: true; data: ClaudeSignalResponse }
  | { success: false; error: string; rawContent: string };

// ─── Parser ──────────────────────────────────────────────────

export function parseClaudeResponse(
  rawContent: string,
  options: ParseOptions = {}
): ParseResult {
  const { minConfidence = 0 } = options;

  // Step 1: Extract JSON
  const jsonStr = extractJson(rawContent);
  if (!jsonStr) {
    return {
      success: false,
      error: "No valid JSON found in Claude response",
      rawContent,
    };
  }

  // Step 2: Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    return {
      success: false,
      error: `JSON parse error: ${err instanceof Error ? err.message : "unknown"}`,
      rawContent,
    };
  }

  // Step 3: Validate against flexible schema
  const result = claudeSignalResponseSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    return {
      success: false,
      error: `Schema validation failed: ${issues}`,
      rawContent,
    };
  }

  // Step 4: Normalize to ClaudeSignalResponse
  const raw = result.data;

  // Resolve action: "signal" key (new format) or "action" key (old format)
  const action: SignalAction = (raw.signal ?? raw.action)!;

  // Normalize confidence: if > 1, treat as 0-100 scale → convert to 0-1
  let confidence = raw.confidence;
  if (confidence > 1) {
    confidence = confidence / 100;
  }

  // Normalize reasoning: array → joined string
  const reasoning = Array.isArray(raw.reasoning)
    ? raw.reasoning.filter(Boolean).join(" | ")
    : raw.reasoning;

  // Normalize entry price: entry_zone.min or entry_price
  const entryPrice =
    raw.entry_price ??
    raw.entry_zone?.min ??
    null;

  // Normalize take profit: take_profit_1 or take_profit
  const takeProfit = raw.take_profit_1 ?? raw.take_profit ?? null;
  const takeProfit2 = raw.take_profit_2 ?? null;

  // Normalize R:R: parse from string like "1:3" or use numeric
  let rrRatio = raw.risk_reward_ratio ?? null;
  if (rrRatio == null && raw.risk_reward_estimate) {
    const match = raw.risk_reward_estimate.match(/1:(\d+(?:\.\d+)?)/);
    if (match) rrRatio = parseFloat(match[1]);
  }

  // Normalize invalidation
  const invalidation = raw.invalidation_condition || raw.invalidation || "";

  // Normalize market context
  const marketContext = [
    raw.market_state,
    raw.market_context,
    raw.bias ? `Bias: ${raw.bias}` : "",
    raw.setup_type ? `Setup: ${raw.setup_type}` : "",
  ]
    .filter(Boolean)
    .join(" | ") || "";

  const data: ClaudeSignalResponse = {
    action,
    confidence,
    reasoning,
    entry_price: entryPrice,
    stop_loss: raw.stop_loss,
    take_profit: takeProfit,
    risk_reward_ratio: rrRatio,
    invalidation,
    market_context: marketContext,
    market_state: raw.market_state ?? "",
    bias: raw.bias ?? "",
    setup_type: raw.setup_type ?? "",
    take_profit_2: takeProfit2,
    warning: raw.warning ?? "",
  };

  // Step 5: Business logic validation

  if (data.confidence < 0 || data.confidence > 1) {
    return {
      success: false,
      error: `Confidence ${data.confidence} out of range [0, 1]`,
      rawContent,
    };
  }

  if (data.action === "BUY" || data.action === "SELL") {
    // Require entry_price
    if (data.entry_price == null) {
      return {
        success: false,
        error: `${data.action} signal requires entry_price or entry_zone`,
        rawContent,
      };
    }

    // Require stop_loss
    if (data.stop_loss == null) {
      return {
        success: false,
        error: `${data.action} signal requires stop_loss`,
        rawContent,
      };
    }

    // Enforce minimum confidence
    if (data.confidence < minConfidence) {
      data.action = "NO_TRADE";
      data.reasoning = `[LOW CONFIDENCE: ${Math.round(data.confidence * 100)}% < ${Math.round(minConfidence * 100)}% min] ${data.reasoning}`;
    }

    // Verify R:R consistency
    if (
      data.action !== "NO_TRADE" &&
      data.entry_price != null &&
      data.stop_loss != null &&
      data.take_profit != null &&
      data.risk_reward_ratio != null
    ) {
      const risk = Math.abs(data.entry_price - data.stop_loss);
      const reward = Math.abs(data.take_profit - data.entry_price);
      const computedRR = risk > 0 ? reward / risk : 0;
      const claimedRR = data.risk_reward_ratio;

      if (
        computedRR > 0 &&
        claimedRR > 0 &&
        Math.abs(computedRR - claimedRR) / computedRR > 0.3
      ) {
        data.risk_reward_ratio = Math.round(computedRR * 100) / 100;
        data.reasoning += ` [R:R corrected from ${claimedRR.toFixed(2)} to ${data.risk_reward_ratio.toFixed(2)}]`;
      }
    }
  }

  return { success: true, data };
}

// ─── JSON extraction ─────────────────────────────────────────

function extractJson(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return null;
}
