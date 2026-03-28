/**
 * Robust JSON extraction from Claude responses.
 * Handles: raw JSON, markdown code blocks, JSON with surrounding text.
 */
export function extractJsonFromResponse(text: string): string {
  const trimmed = text.trim();

  // 1. If it starts with { and ends with }, it's raw JSON
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  // 2. Extract from markdown code block (greedy — takes the LAST complete block)
  const codeBlockRegex = /```(?:json)?\s*\n([\s\S]*?)\n\s*```/g;
  let lastMatch: string | null = null;
  let m;
  while ((m = codeBlockRegex.exec(trimmed)) !== null) {
    const candidate = m[1].trim();
    if (candidate.startsWith("{")) {
      lastMatch = candidate;
    }
  }
  if (lastMatch) return lastMatch;

  // 3. Find the outermost { ... } block
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  // 4. Return as-is (will fail at JSON.parse with a clear error)
  return trimmed;
}
