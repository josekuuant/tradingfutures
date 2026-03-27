import Anthropic from "@anthropic-ai/sdk";
import { getRawCredentials } from "@/lib/services/connections";

// ─── Types ───────────────────────────────────────────────────

export interface ClaudeRequest {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ClaudeResponse {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

// ─── Client ──────────────────────────────────────────────────

const TIMEOUT_MS = 60_000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 2_000;

export async function callClaude(
  request: ClaudeRequest
): Promise<ClaudeResponse> {
  // Get credentials from DB
  const creds = await getRawCredentials("claude");
  if (!creds || !creds.apiKey) {
    throw new ClaudeClientError("Claude API key not configured", "NO_API_KEY");
  }

  const apiKey = creds.apiKey as string;
  const model = request.model || (creds.model as string) || "claude-sonnet-4-6";
  const maxTokens = request.maxTokens || (creds.maxTokens as number) || 4096;

  const client = new Anthropic({ apiKey });

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      console.log(`[Claude] Retry ${attempt}/${MAX_RETRIES}...`);
      await sleep(RETRY_DELAY_MS * attempt);
    }

    const start = Date.now();

    try {
      const response = await Promise.race([
        client.messages.create({
          model,
          max_tokens: maxTokens,
          temperature: request.temperature ?? 0.3,
          system: request.systemPrompt || undefined,
          messages: [
            {
              role: "user",
              content: request.userPrompt,
            },
          ],
        }),
        timeout(TIMEOUT_MS),
      ]);

      const durationMs = Date.now() - start;

      // Extract text content
      const textBlock = response.content.find(
        (block) => block.type === "text"
      );
      if (!textBlock || textBlock.type !== "text") {
        throw new ClaudeClientError(
          "No text content in Claude response",
          "EMPTY_RESPONSE"
        );
      }

      console.log(
        `[Claude] ${model} responded in ${durationMs}ms (${response.usage.input_tokens}+${response.usage.output_tokens} tokens)`
      );

      return {
        content: textBlock.text,
        model: response.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        durationMs,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Don't retry on auth errors or invalid requests
      if (err instanceof Anthropic.AuthenticationError) {
        throw new ClaudeClientError(
          "Invalid Claude API key",
          "AUTH_ERROR"
        );
      }
      if (err instanceof Anthropic.BadRequestError) {
        throw new ClaudeClientError(
          `Bad request: ${err.message}`,
          "BAD_REQUEST"
        );
      }
      if (err instanceof ClaudeClientError && err.code === "TIMEOUT") {
        // Allow retry on timeout
        continue;
      }
      if (err instanceof Anthropic.RateLimitError) {
        // Allow retry on rate limit
        continue;
      }
      if (err instanceof Anthropic.InternalServerError) {
        // Allow retry on server error
        continue;
      }

      // Unknown error — don't retry
      throw err;
    }
  }

  throw new ClaudeClientError(
    `Failed after ${MAX_RETRIES + 1} attempts: ${lastError?.message}`,
    "EXHAUSTED_RETRIES"
  );
}

// ─── Errors ──────────────────────────────────────────────────

export type ClaudeErrorCode =
  | "NO_API_KEY"
  | "AUTH_ERROR"
  | "BAD_REQUEST"
  | "TIMEOUT"
  | "EMPTY_RESPONSE"
  | "EXHAUSTED_RETRIES";

export class ClaudeClientError extends Error {
  constructor(
    message: string,
    public readonly code: ClaudeErrorCode
  ) {
    super(message);
    this.name = "ClaudeClientError";
  }
}

// ─── Helpers ─────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(
      () => reject(new ClaudeClientError(`Timeout after ${ms}ms`, "TIMEOUT")),
      ms
    )
  );
}
