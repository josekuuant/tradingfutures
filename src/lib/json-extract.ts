/**
 * Robust JSON extraction from Claude responses.
 * Handles every format Claude might return:
 * - Raw JSON
 * - ```json\n{...}\n```
 * - ```{...}```
 * - Text before/after JSON
 * - Multiple code blocks (takes the one with JSON)
 */
export function extractJsonFromResponse(text: string): string {
  const trimmed = text.trim();

  // 1. Raw JSON — starts with { and ends with }
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  // 2. Strip ALL markdown code fences (handles any whitespace/newline combo)
  // Match: ```json ... ``` or ``` ... ``` with any spacing
  const stripped = trimmed
    .replace(/^```(?:json)?[\s\r\n]*/gm, "")
    .replace(/[\s\r\n]*```$/gm, "")
    .trim();

  if (stripped.startsWith("{") && stripped.endsWith("}")) {
    return stripped;
  }

  // 3. Find JSON object within the text — first { to last }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  // 4. Return as-is — JSON.parse will give a clear error
  return trimmed;
}
