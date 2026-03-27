import {
  claudeSignalResponseSchema,
  type ClaudeSignalResponse,
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

  // Step 1: Extract JSON from response (Claude sometimes wraps in markdown)
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

  // Step 3: Validate against schema
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

  // Step 4: Business logic validation
  const data = result.data;

  if (data.confidence < 0 || data.confidence > 1) {
    return {
      success: false,
      error: `Confidence ${data.confidence} out of range [0, 1]`,
      rawContent,
    };
  }

  if (data.action === "BUY" || data.action === "SELL") {
    // B2: Require entry_price
    if (data.entry_price == null) {
      return {
        success: false,
        error: `${data.action} signal requires entry_price`,
        rawContent,
      };
    }

    // B2: Require stop_loss for risk management
    if (data.stop_loss == null) {
      return {
        success: false,
        error: `${data.action} signal requires stop_loss`,
        rawContent,
      };
    }

    // B3: Enforce minimum confidence
    if (data.confidence < minConfidence) {
      // Don't reject — downgrade to NO_TRADE with original reasoning
      data.action = "NO_TRADE";
      data.reasoning = `[LOW CONFIDENCE: ${Math.round(data.confidence * 100)}% < ${Math.round(minConfidence * 100)}% min] ${data.reasoning}`;
    }

    // M6: Verify R:R consistency if all three prices present
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

      // Allow 30% tolerance — flag but don't reject
      if (
        computedRR > 0 &&
        claimedRR > 0 &&
        Math.abs(computedRR - claimedRR) / computedRR > 0.3
      ) {
        // Override with computed value
        data.risk_reward_ratio = Math.round(computedRR * 100) / 100;
        data.reasoning += ` [R:R corrected from ${claimedRR.toFixed(2)} to ${data.risk_reward_ratio.toFixed(2)}]`;
      }
    }
  }

  return { success: true, data };
}

// ─── JSON extraction ─────────────────────────────────────────

function extractJson(text: string): string | null {
  // Try the whole string first
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  // Try to extract from markdown code block
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // Try to find first { ... } block
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return null;
}
