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
