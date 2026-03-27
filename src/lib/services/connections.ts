import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { encrypt, decrypt, isEncrypted } from "@/lib/crypto";
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
  if (isEncrypted(raw)) {
    return JSON.parse(decrypt(raw));
  }
  // Legacy: unencrypted JSON (will be encrypted on next save)
  return JSON.parse(raw);
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
      case "databento":
        success = Boolean(creds.apiKey && creds.apiKey.length > 0);
        message = success
          ? "Databento credentials validated. Live connection test requires Databento SDK integration."
          : "Invalid API key.";
        break;

      case "tradovate":
        success = Boolean(creds.username && creds.password);
        message = success
          ? "Tradovate credentials validated. Live connection test requires Tradovate SDK integration."
          : "Username and password are required.";
        break;

      case "claude":
        success = Boolean(creds.apiKey && creds.apiKey.startsWith("sk-ant-"));
        message = success
          ? "Claude API key format validated. Live test requires Anthropic SDK integration."
          : "Invalid API key format. Expected sk-ant-... prefix.";
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
  return readCredentials(rows[0].credentials);
}
