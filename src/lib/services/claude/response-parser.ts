import {
  claudeSignalResponseSchema,
  type ClaudeSignalResponse,
} from "@/types/signal";

// ─── Types ───────────────────────────────────────────────────

export type ParseResult =
  | { success: true; data: ClaudeSignalResponse }
  | { success: false; error: string; rawContent: string };

// ─── Parser ──────────────────────────────────────────────────

export function parseClaudeResponse(rawContent: string): ParseResult {
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

  if (
    (data.action === "BUY" || data.action === "SELL") &&
    data.entry_price == null
  ) {
    return {
      success: false,
      error: `${data.action} signal requires entry_price`,
      rawContent,
    };
  }

  if (data.confidence < 0 || data.confidence > 1) {
    return {
      success: false,
      error: `Confidence ${data.confidence} out of range [0, 1]`,
      rawContent,
    };
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
