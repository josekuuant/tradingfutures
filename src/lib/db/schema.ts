import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ─── API Connections ─────────────────────────────────────────
export const apiConnections = sqliteTable("api_connections", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  provider: text("provider", {
    enum: ["databento", "tradovate", "claude"],
  }).notNull(),
  isEnabled: integer("is_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  environment: text("environment", {
    enum: ["sandbox", "production"],
  })
    .notNull()
    .default("sandbox"),
  // Encrypted/stored credentials as JSON blob
  // Each provider has different fields — stored as JSON to stay flexible
  credentials: text("credentials").notNull().default("{}"),
  // Connection health tracking
  status: text("status", {
    enum: ["untested", "connected", "error"],
  })
    .notNull()
    .default("untested"),
  lastTestedAt: text("last_tested_at"),
  lastError: text("last_error"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// Type helpers
export type ApiConnection = typeof apiConnections.$inferSelect;
export type NewApiConnection = typeof apiConnections.$inferInsert;

// ─── Strategies ──────────────────────────────────────────────
export const strategies = sqliteTable("strategies", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  tag: text("tag").notNull().default(""),
  instrument: text("instrument").notNull().default("NQ"),
  timeframes: text("timeframes").notNull().default('["5m"]'), // JSON array
  contextConditions: text("context_conditions").notNull().default(""),
  entryConditions: text("entry_conditions").notNull().default(""),
  invalidation: text("invalidation").notNull().default(""),
  tp1: text("tp1").notNull().default(""),
  tp2: text("tp2").notNull().default(""),
  minRR: integer("min_rr").notNull().default(2),
  volatilityFilter: text("volatility_filter").notNull().default(""),
  volumeFilter: text("volume_filter").notNull().default(""),
  scheduleFilter: text("schedule_filter").notNull().default(""),
  newsFilter: text("news_filter").notNull().default(""),
  noTradeRules: text("no_trade_rules").notNull().default(""),
  promptTemplate: text("prompt_template").notNull().default(""),
  isActive: integer("is_active", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export type StrategyRow = typeof strategies.$inferSelect;
export type NewStrategyRow = typeof strategies.$inferInsert;

// ─── Prompts ─────────────────────────────────────────────────
export const prompts = sqliteTable("prompts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  tag: text("tag").notNull().default(""),
  systemPrompt: text("system_prompt").notNull().default(""),
  userPromptTemplate: text("user_prompt_template").notNull(),
  outputSchema: text("output_schema").notNull().default(""),
  outputValidationRules: text("output_validation_rules").notNull().default(""),
  isActive: integer("is_active", { mode: "boolean" })
    .notNull()
    .default(false),
  version: integer("version").notNull().default(1),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export type PromptRow = typeof prompts.$inferSelect;

// ─── Prompt Versions (snapshots) ─────────────────────────────
export const promptVersions = sqliteTable("prompt_versions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  promptId: text("prompt_id").notNull(),
  version: integer("version").notNull(),
  systemPrompt: text("system_prompt").notNull().default(""),
  userPromptTemplate: text("user_prompt_template").notNull(),
  outputSchema: text("output_schema").notNull().default(""),
  outputValidationRules: text("output_validation_rules").notNull().default(""),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export type PromptVersionRow = typeof promptVersions.$inferSelect;

// ─── Prompt Test Runs ────────────────────────────────────────
export const promptTestRuns = sqliteTable("prompt_test_runs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  promptId: text("prompt_id").notNull(),
  inputVariables: text("input_variables").notNull().default("{}"),
  renderedPrompt: text("rendered_prompt").notNull(),
  response: text("response").notNull().default(""),
  durationMs: integer("duration_ms").notNull().default(0),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export type PromptTestRunRow = typeof promptTestRuns.$inferSelect;

// ─── Signals ─────────────────────────────────────────────────
export const signals = sqliteTable("signals", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  strategyId: text("strategy_id").notNull(),
  strategyName: text("strategy_name").notNull(),
  promptId: text("prompt_id").notNull(),
  promptName: text("prompt_name").notNull(),
  action: text("action").notNull(), // BUY | SELL | NO_TRADE
  confidence: integer("confidence").notNull(), // stored as 0-100
  reasoning: text("reasoning").notNull(),
  entryPrice: text("entry_price"), // stored as text to preserve decimals
  stopLoss: text("stop_loss"),
  takeProfit: text("take_profit"),
  riskRewardRatio: text("risk_reward_ratio"),
  invalidation: text("invalidation").notNull().default(""),
  marketContext: text("market_context").notNull().default(""),
  instrument: text("instrument").notNull(),
  timeframe: text("timeframe").notNull(),
  currentPrice: text("current_price").notNull(),
  claudeModel: text("claude_model").notNull(),
  systemPromptSent: text("system_prompt_sent").notNull(),
  userPromptSent: text("user_prompt_sent").notNull(),
  rawResponse: text("raw_response").notNull(),
  durationMs: integer("duration_ms").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export type SignalRow = typeof signals.$inferSelect;

// ─── Backtest Runs ───────────────────────────────────────────
export const backtestRuns = sqliteTable("backtest_runs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  config: text("config").notNull(),         // JSON BacktestConfig
  status: text("status").notNull().default("pending"),
  progress: integer("progress").notNull().default(0),
  signals: text("signals").notNull().default("[]"),  // JSON BacktestSignal[]
  results: text("results"),                 // JSON BacktestResults | null
  error: text("error"),
  strategyName: text("strategy_name").notNull(),
  promptName: text("prompt_name").notNull(),
  startedAt: text("started_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  completedAt: text("completed_at"),
});

export type BacktestRunRow = typeof backtestRuns.$inferSelect;
