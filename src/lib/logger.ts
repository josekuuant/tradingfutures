import type { LogModule, LogLevel, LogEntry } from "@/types/log";

// ─── In-memory log store (ring buffer) ───────────────────────

const MAX_LOGS = 500;
const logs: LogEntry[] = [];
let logIdCounter = 0;
const startTime = Date.now();

function pushLog(entry: Omit<LogEntry, "id" | "timestamp">): LogEntry {
  const full: LogEntry = {
    ...entry,
    id: String(++logIdCounter),
    timestamp: new Date().toISOString(),
  };

  logs.unshift(full);
  if (logs.length > MAX_LOGS) {
    logs.length = MAX_LOGS;
  }

  // Also output to console with structured prefix
  const prefix = `[${full.module.toUpperCase()}]`;
  switch (full.level) {
    case "error":
    case "critical":
      console.error(prefix, full.message, full.payload ?? "");
      break;
    case "warn":
      console.warn(prefix, full.message, full.payload ?? "");
      break;
    default:
      console.log(prefix, full.message);
      break;
  }

  return full;
}

// ─── Public API ──────────────────────────────────────────────

function createModuleLogger(module: LogModule) {
  return {
    debug: (message: string, payload?: Record<string, unknown>) =>
      pushLog({ module, level: "debug", message, payload }),
    info: (message: string, payload?: Record<string, unknown>) =>
      pushLog({ module, level: "info", message, payload }),
    warn: (message: string, payload?: Record<string, unknown>) =>
      pushLog({ module, level: "warn", message, payload }),
    error: (message: string, payload?: Record<string, unknown>) =>
      pushLog({ module, level: "error", message, payload }),
    critical: (message: string, payload?: Record<string, unknown>) =>
      pushLog({ module, level: "critical", message, payload }),
  };
}

export const log = {
  market: createModuleLogger("market"),
  claude: createModuleLogger("claude"),
  engine: createModuleLogger("engine"),
  strategy: createModuleLogger("strategy"),
  execution: createModuleLogger("execution"),
  system: createModuleLogger("system"),
};

// ─── Query API ───────────────────────────────────────────────

export interface LogQuery {
  module?: LogModule;
  level?: LogLevel;
  minLevel?: LogLevel;
  limit?: number;
  search?: string;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  critical: 4,
};

export function queryLogs(query: LogQuery = {}): LogEntry[] {
  const limit = query.limit ?? 100;
  let result = logs;

  if (query.module) {
    result = result.filter((l) => l.module === query.module);
  }

  if (query.level) {
    result = result.filter((l) => l.level === query.level);
  }

  if (query.minLevel) {
    const min = LEVEL_PRIORITY[query.minLevel];
    result = result.filter((l) => LEVEL_PRIORITY[l.level] >= min);
  }

  if (query.search) {
    const s = query.search.toLowerCase();
    result = result.filter(
      (l) =>
        l.message.toLowerCase().includes(s) ||
        (l.payload && JSON.stringify(l.payload).toLowerCase().includes(s))
    );
  }

  return result.slice(0, limit);
}

export function getLogCounts(): Record<LogLevel, number> {
  const counts: Record<LogLevel, number> = {
    debug: 0,
    info: 0,
    warn: 0,
    error: 0,
    critical: 0,
  };
  for (const l of logs) {
    counts[l.level]++;
  }
  return counts;
}

export function getUptimeString(): string {
  const ms = Date.now() - startTime;
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export function getModuleLastActivity(): Record<LogModule, string | null> {
  const result: Record<string, string | null> = {
    market: null,
    claude: null,
    engine: null,
    strategy: null,
    execution: null,
    system: null,
  };
  for (const l of logs) {
    if (!result[l.module]) {
      result[l.module] = l.timestamp;
    }
  }
  return result as Record<LogModule, string | null>;
}

export function getModuleErrorCounts(): Record<LogModule, number> {
  const counts: Record<string, number> = {
    market: 0,
    claude: 0,
    engine: 0,
    strategy: 0,
    execution: 0,
    system: 0,
  };
  for (const l of logs) {
    if (l.level === "error" || l.level === "critical") {
      counts[l.module]++;
    }
  }
  return counts as Record<LogModule, number>;
}

// Log system startup
log.system.info("Logger initialized");
