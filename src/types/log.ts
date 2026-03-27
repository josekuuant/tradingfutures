// ─── Log entry types ─────────────────────────────────────────

export const LOG_MODULES = [
  "market",
  "claude",
  "engine",
  "strategy",
  "execution",
  "system",
] as const;

export type LogModule = (typeof LOG_MODULES)[number];

export const LOG_LEVELS = ["debug", "info", "warn", "error", "critical"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface LogEntry {
  id: string;
  timestamp: string;
  module: LogModule;
  level: LogLevel;
  message: string;
  payload?: Record<string, unknown>;
}

// ─── Health ──────────────────────────────────────────────────

export type HealthStatus = "healthy" | "degraded" | "down" | "unknown";

export interface ModuleHealth {
  module: LogModule;
  status: HealthStatus;
  lastActivity: string | null;
  errorCount: number;
  message: string;
}

export interface SystemHealth {
  overall: HealthStatus;
  modules: ModuleHealth[];
  uptime: string;
  timestamp: string;
}
