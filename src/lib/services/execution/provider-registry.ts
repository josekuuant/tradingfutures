import { log } from "@/lib/logger";
import { getRawCredentials } from "@/lib/services/connections";
import { MockExecutionAdapter } from "./adapter-mock";
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
  const adapter = adapters.get(provider);
  if (adapter) {
    adapter.disconnect().catch(() => {});
    adapters.delete(provider);
    log.execution.info(`Unregistered execution adapter: ${provider}`);
  }
}

// ─── Auto-initialize from stored credentials ────────────────

let initialized = false;

export async function ensureAdaptersInitialized(): Promise<void> {
  if (initialized) return;
  initialized = true;

  const providers: ExecutionProvider[] = [
    "tradovate",
    "rithmic",
    "ninjatrader",
    "topstepx",
  ];

  for (const provider of providers) {
    try {
      const creds = await getRawCredentials(provider);
      if (creds && Object.values(creds).some((v) => v && String(v).length > 0)) {
        // Real adapters will be registered here as they're implemented.
        // For now, register mock adapters for development.
        const adapter = new MockExecutionAdapter(provider);
        registerAdapter(adapter);
        log.execution.info(
          `${provider}: credentials found, mock adapter registered (replace with real adapter when ready)`
        );
      }
    } catch {
      // No credentials stored — skip
    }
  }

  // Always have at least one mock for development
  if (adapters.size === 0) {
    registerAdapter(new MockExecutionAdapter("tradovate"));
    log.execution.info(
      "No execution credentials found — tradovate mock registered"
    );
  }
}
