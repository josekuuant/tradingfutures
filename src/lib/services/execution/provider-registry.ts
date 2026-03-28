import { log } from "@/lib/logger";
import { getRawCredentials } from "@/lib/services/connections";
import { MockExecutionAdapter } from "./adapter-mock";
import { TradovateAdapter } from "./adapter-tradovate";
import { TopstepXAdapter } from "./adapter-topstepx";
import { RithmicAdapter } from "./adapter-rithmic";
import { NinjaTraderAdapter } from "./adapter-ninjatrader";
import { PolymarketAdapter } from "./adapter-polymarket";

const DEFAULT_NT_PORT = 8080;
import type {
  ExecutionProvider,
  ExecutionProviderAdapter,
} from "@/types/execution";

// ─── Registry ────────────────────────────────────────────────

const adapters = new Map<ExecutionProvider, ExecutionProviderAdapter>();

export function getRegisteredProviders(): ExecutionProvider[] {
  return Array.from(adapters.keys());
}

export function getAdapter(
  provider: ExecutionProvider
): ExecutionProviderAdapter | null {
  return adapters.get(provider) ?? null;
}

export function registerAdapter(adapter: ExecutionProviderAdapter): void {
  adapters.set(adapter.provider, adapter);
  log.execution.info(`Registered execution adapter: ${adapter.name}`);
}

export function unregisterAdapter(provider: ExecutionProvider): void {
  const existing = adapters.get(provider);
  if (existing) {
    existing.disconnect().catch((err) => {
      log.execution.warn(`Disconnect failed for ${provider}: ${err}`);
    });
    adapters.delete(provider);
    log.execution.info(`Unregistered execution adapter: ${provider}`);
  }
}

/** Reset initialization so next call to ensureAdaptersInitialized re-runs */
export function resetInitialization(): void {
  initPromise = null;
}

// ─── Auto-initialize from stored credentials ────────────────

let initPromise: Promise<void> | null = null;

export async function ensureAdaptersInitialized(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = doInit();
  return initPromise;
}

async function doInit(): Promise<void> {

  // Tradovate
  try {
    const creds = await getRawCredentials("tradovate");
    if (creds?.username && creds?.password) {
      const env = (creds.environment as "demo" | "production") ?? "demo";
      const adapter = new TradovateAdapter(
        {
          username: String(creds.username),
          password: String(creds.password),
          appId: creds.appId ? String(creds.appId) : undefined,
          cid: creds.cid ? String(creds.cid) : undefined,
          sec: creds.sec ? String(creds.sec) : undefined,
        },
        env
      );
      registerAdapter(adapter);
      log.execution.info("Tradovate adapter initialized from stored credentials");
    }
  } catch {
    // No Tradovate credentials
  }

  // TopstepX
  try {
    const creds = await getRawCredentials("topstepx");
    if (creds?.apiKey) {
      const env = (creds.environment as "demo" | "production") ?? "demo";
      const adapter = new TopstepXAdapter(
        {
          apiKey: String(creds.apiKey),
          username: creds.username ? String(creds.username) : undefined,
          accountId: creds.accountId ? String(creds.accountId) : undefined,
        },
        env
      );
      registerAdapter(adapter);
      log.execution.info("TopstepX adapter initialized from stored credentials");
    }
  } catch {
    // No TopstepX credentials
  }

  // Rithmic — real R|Protocol WebSocket adapter
  try {
    const creds = await getRawCredentials("rithmic");
    if (creds?.username && creds?.password) {
      const adapter = new RithmicAdapter({
        username: String(creds.username),
        password: String(creds.password),
        systemName: String(creds.systemName || "Rithmic Paper Trading"),
        gateway: (creds.gateway as "paper-chicago" | "prod-chicago") ?? "paper-chicago",
        appName: creds.appName ? String(creds.appName) : undefined,
      });
      registerAdapter(adapter);
      log.execution.info("Rithmic adapter initialized from stored credentials");
    }
  } catch {
    // No Rithmic credentials
  }

  // NinjaTrader — REST bridge adapter (requires NT8 desktop + bridge add-on)
  try {
    const creds = await getRawCredentials("ninjatrader");
    if (creds?.host || creds?.apiKey) {
      const adapter = new NinjaTraderAdapter({
        host: String(creds.host || "localhost"),
        port: Number(creds.port) || DEFAULT_NT_PORT,
        apiKey: creds.apiKey ? String(creds.apiKey) : undefined,
        mode: (creds.mode as "crosstrade" | "custom_bridge") ?? "crosstrade",
      });
      registerAdapter(adapter);
      log.execution.info("NinjaTrader adapter initialized from stored credentials");
    }
  } catch {
    // No NinjaTrader credentials
  }

  // Polymarket
  try {
    const creds = await getRawCredentials("polymarket");
    if (creds?.privateKey) {
      const adapter = new PolymarketAdapter({
        privateKey: String(creds.privateKey),
        apiKey: creds.apiKey ? String(creds.apiKey) : undefined,
        apiSecret: creds.apiSecret ? String(creds.apiSecret) : undefined,
        apiPassphrase: creds.apiPassphrase ? String(creds.apiPassphrase) : undefined,
      });
      registerAdapter(adapter);
      log.execution.info("Polymarket adapter initialized from stored credentials");
    }
  } catch {
    // No Polymarket credentials
  }

  // Fallback: always have a mock for development
  if (adapters.size === 0) {
    registerAdapter(new MockExecutionAdapter("tradovate"));
    log.execution.info("No execution credentials found — tradovate mock registered");
  }
}
