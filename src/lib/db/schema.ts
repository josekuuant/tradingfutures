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
