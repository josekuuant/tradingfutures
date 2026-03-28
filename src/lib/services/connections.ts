import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { encrypt, decrypt, isEncrypted } from "@/lib/crypto";
import { log } from "@/lib/logger";
import {
  type Provider,
  type ConnectionResponse,
  type UpdateConnectionPayload,
  type TestConnectionResponse,
  credentialSchemas,
} from "@/types/connections";

// ─── Helpers ─────────────────────────────────────────────────

/** Mask a credential value for safe display */
function maskValue(value: string): string {
  if (!value || value.length <= 4) return "••••";
  return "••••" + value.slice(-4);
}

/** Mask all credential values */
function maskCredentials(
  credentials: Record<string, unknown>
): Record<string, string> {
  const masked: Record<string, string> = {};
  for (const [key, val] of Object.entries(credentials)) {
    if (typeof val === "string") {
      masked[key] = maskValue(val);
    } else if (typeof val === "number") {
      masked[key] = String(val);
    } else {
      masked[key] = String(val ?? "");
    }
  }
  return masked;
}

/** Read credentials from DB, decrypting if needed */
function readCredentials(raw: string): Record<string, unknown> {
  try {
    if (isEncrypted(raw)) {
      return JSON.parse(decrypt(raw));
    }
    // Legacy: unencrypted JSON — parse but log warning for migration
    const parsed = JSON.parse(raw);
    log.system.warn("Legacy unencrypted credentials detected — will be encrypted on next save");
    return parsed;
  } catch (err) {
    log.system.error(`Failed to read credentials: ${err instanceof Error ? err.message : "unknown"}`);
    return {};
  }
}

/** Map DB row to API response (never exposes raw credentials) */
function toResponse(row: schema.ApiConnection): ConnectionResponse {
  const creds = readCredentials(row.credentials);
  return {
    id: row.id,
    provider: row.provider,
    isEnabled: row.isEnabled,
    environment: row.environment,
    status: row.status,
    lastTestedAt: row.lastTestedAt,
    lastError: row.lastError,
    maskedCredentials: maskCredentials(creds),
    updatedAt: row.updatedAt,
  };
}

// ─── Service ─────────────────────────────────────────────────

export async function getAllConnections(): Promise<ConnectionResponse[]> {
  const rows = await db.select().from(schema.apiConnections);
  return rows.map(toResponse);
}

export async function getConnection(
  provider: Provider
): Promise<ConnectionResponse | null> {
  const rows = await db
    .select()
    .from(schema.apiConnections)
    .where(eq(schema.apiConnections.provider, provider))
    .limit(1);
  return rows.length > 0 ? toResponse(rows[0]) : null;
}

export async function upsertConnection(
  payload: UpdateConnectionPayload
): Promise<ConnectionResponse> {
  const { provider, isEnabled, environment, credentials } = payload;

  // Validate credentials against provider schema
  const providerSchema = credentialSchemas[provider];
  const validatedCreds = providerSchema.parse(credentials);

  // Encrypt before storing
  const encrypted = encrypt(JSON.stringify(validatedCreds));

  // Check if exists
  const existing = await db
    .select()
    .from(schema.apiConnections)
    .where(eq(schema.apiConnections.provider, provider))
    .limit(1);

  const now = new Date().toISOString();

  if (existing.length > 0) {
    await db
      .update(schema.apiConnections)
      .set({
        isEnabled,
        environment,
        credentials: encrypted,
        status: "untested",
        lastError: null,
        updatedAt: now,
      })
      .where(eq(schema.apiConnections.provider, provider));
  } else {
    await db.insert(schema.apiConnections).values({
      provider,
      isEnabled,
      environment,
      credentials: encrypted,
      status: "untested",
      updatedAt: now,
    });
  }

  const result = await getConnection(provider);
  return result!;
}

export async function testConnection(
  provider: Provider
): Promise<TestConnectionResponse> {
  const rows = await db
    .select()
    .from(schema.apiConnections)
    .where(eq(schema.apiConnections.provider, provider))
    .limit(1);

  if (rows.length === 0) {
    return {
      success: false,
      message: "Connection not configured. Save credentials first.",
      testedAt: new Date().toISOString(),
    };
  }

  const row = rows[0];
  const creds = readCredentials(row.credentials) as Record<string, string>;
  const now = new Date().toISOString();

  let success = false;
  let message = "";

  try {
    switch (provider) {
      case "databento": {
        if (!creds.apiKey) {
          message = "API key is required.";
          break;
        }
        // Real HTTP call to Databento to verify key
        const dbRes = await fetch("https://hist.databento.com/v0/metadata.list_datasets", {
          headers: { Authorization: `Basic ${Buffer.from(creds.apiKey + ":").toString("base64")}` },
          signal: AbortSignal.timeout(10_000),
        });
        success = dbRes.ok;
        message = success
          ? "Databento connected — API key verified"
          : `Databento auth failed (${dbRes.status}). Check your API key.`;
        break;
      }

      case "claude": {
        if (!creds.apiKey || !creds.apiKey.startsWith("sk-ant-")) {
          message = "Invalid API key format. Expected sk-ant-... prefix.";
          break;
        }
        // Real HTTP call to Claude API to verify key
        const clRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": creds.apiKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: creds.model || "claude-sonnet-4-6",
            max_tokens: 1,
            messages: [{ role: "user", content: "ping" }],
          }),
          signal: AbortSignal.timeout(15_000),
        });
        success = clRes.ok;
        if (success) {
          message = "Claude API connected — key verified";
        } else if (clRes.status === 401) {
          message = "Claude API key is invalid or expired.";
        } else {
          message = `Claude API error (${clRes.status}). Key may be valid but check billing.`;
          success = clRes.status === 429; // Rate limited = key is valid
        }
        break;
      }

      case "tradovate": {
        if (!creds.username || !creds.password) {
          message = "Username and password are required.";
          break;
        }
        // Real auth call to Tradovate
        const env = row.environment === "production" ? "live" : "demo";
        const tvRes = await fetch(`https://${env}.tradovateapi.com/v1/auth/accessTokenRequest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: creds.username,
            password: creds.password,
            appId: creds.appId || "TradingFutures",
            appVersion: "1.0",
            cid: creds.cid || undefined,
            sec: creds.sec || undefined,
          }),
          signal: AbortSignal.timeout(15_000),
        });
        success = tvRes.ok;
        if (success) {
          const tvData = await tvRes.json();
          message = tvData.accessToken
            ? `Tradovate connected (${env}) — authenticated as ${creds.username}`
            : "Tradovate responded but no token received.";
          success = Boolean(tvData.accessToken);
        } else {
          message = `Tradovate auth failed (${tvRes.status}). Check credentials.`;
        }
        break;
      }

      case "topstepx": {
        if (!creds.apiKey || creds.apiKey.length < 10) {
          message = "Valid API key is required.";
          break;
        }
        // Real auth call to TopstepX
        const pxEnv = row.environment === "production"
          ? "https://api.thefuturesdesk.projectx.com"
          : "https://gateway-api-demo.s2f.projectx.com";
        const pxRes = await fetch(`${pxEnv}/api/Auth/loginKey`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userName: creds.username || "",
            apiKey: creds.apiKey,
          }),
          signal: AbortSignal.timeout(15_000),
        });
        if (pxRes.ok) {
          const pxData = await pxRes.json();
          success = Boolean(pxData.token && pxData.success !== false);
          message = success
            ? "TopstepX connected — authenticated"
            : `TopstepX: ${pxData.errorMessage || "Auth failed"}`;
        } else {
          message = `TopstepX auth failed (${pxRes.status}).`;
        }
        break;
      }

      case "rithmic":
        success = Boolean(creds.username && creds.password);
        message = success
          ? "Rithmic credentials saved. Live test requires WebSocket connection (will connect on first use)."
          : "Username and password are required.";
        break;

      case "ninjatrader":
        success = Boolean(creds.host || creds.apiKey);
        message = success
          ? "NinjaTrader configuration saved. Ensure NT8 desktop + bridge are running."
          : "Host address or API key is required.";
        break;

      case "polymarket": {
        if (!creds.privateKey) {
          message = "Wallet private key is required.";
          break;
        }
        // Test Polymarket connectivity by hitting the public markets endpoint
        const pmRes = await fetch("https://gamma-api.polymarket.com/markets?limit=1", {
          signal: AbortSignal.timeout(10_000),
        });
        success = pmRes.ok;
        message = success
          ? "Polymarket API reachable. Private key saved for order signing."
          : `Polymarket API unreachable (${pmRes.status}).`;
        break;
      }

      default:
        message = `Unknown provider: ${provider}`;
        break;
    }
  } catch (err) {
    success = false;
    message = err instanceof Error ? err.message : "Unknown error";
  }

  await db
    .update(schema.apiConnections)
    .set({
      status: success ? "connected" : "error",
      lastTestedAt: now,
      lastError: success ? null : message,
      updatedAt: now,
    })
    .where(eq(schema.apiConnections.provider, provider));

  return { success, message, testedAt: now };
}

/** Get raw credentials (server-side only — never expose to client) */
export async function getRawCredentials(
  provider: Provider
): Promise<Record<string, unknown> | null> {
  const rows = await db
    .select({ credentials: schema.apiConnections.credentials })
    .from(schema.apiConnections)
    .where(eq(schema.apiConnections.provider, provider))
    .limit(1);

  if (rows.length === 0) return null;

  const raw = readCredentials(rows[0].credentials);

  // Validate against provider schema to catch corrupted data
  const providerSchema = credentialSchemas[provider];
  if (providerSchema) {
    const result = providerSchema.safeParse(raw);
    if (!result.success) {
      log.system.warn(
        `Credentials for ${provider} failed validation: ${result.error.issues.map((i) => i.message).join(", ")}`
      );
      // Return raw anyway — caller should handle gracefully
    }
  }

  return raw;
}
