import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = path.join(process.cwd(), "data", "tradingfutures.db");

const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

// ─── Create tables ───────────────────────────────────────────
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS api_connections (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL CHECK (provider IN ('databento', 'tradovate', 'claude')),
    is_enabled INTEGER NOT NULL DEFAULT 0,
    environment TEXT NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox', 'production')),
    credentials TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'untested' CHECK (status IN ('untested', 'connected', 'error')),
    last_tested_at TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_api_connections_provider
    ON api_connections(provider);
`);

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS strategies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    tag TEXT NOT NULL DEFAULT '',
    instrument TEXT NOT NULL DEFAULT 'NQ',
    timeframes TEXT NOT NULL DEFAULT '["5m"]',
    context_conditions TEXT NOT NULL DEFAULT '',
    entry_conditions TEXT NOT NULL DEFAULT '',
    invalidation TEXT NOT NULL DEFAULT '',
    tp1 TEXT NOT NULL DEFAULT '',
    tp2 TEXT NOT NULL DEFAULT '',
    min_rr INTEGER NOT NULL DEFAULT 2,
    volatility_filter TEXT NOT NULL DEFAULT '',
    volume_filter TEXT NOT NULL DEFAULT '',
    schedule_filter TEXT NOT NULL DEFAULT '',
    news_filter TEXT NOT NULL DEFAULT '',
    no_trade_rules TEXT NOT NULL DEFAULT '',
    prompt_template TEXT NOT NULL DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

console.log("✓ Database migrated successfully");
sqlite.close();
