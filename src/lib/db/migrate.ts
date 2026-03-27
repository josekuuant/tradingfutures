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

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS prompts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    tag TEXT NOT NULL DEFAULT '',
    system_prompt TEXT NOT NULL DEFAULT '',
    user_prompt_template TEXT NOT NULL,
    output_schema TEXT NOT NULL DEFAULT '',
    output_validation_rules TEXT NOT NULL DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS prompt_versions (
    id TEXT PRIMARY KEY,
    prompt_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    system_prompt TEXT NOT NULL DEFAULT '',
    user_prompt_template TEXT NOT NULL,
    output_schema TEXT NOT NULL DEFAULT '',
    output_validation_rules TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_prompt_versions_prompt
    ON prompt_versions(prompt_id, version DESC);
`);

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS prompt_test_runs (
    id TEXT PRIMARY KEY,
    prompt_id TEXT NOT NULL,
    input_variables TEXT NOT NULL DEFAULT '{}',
    rendered_prompt TEXT NOT NULL,
    response TEXT NOT NULL DEFAULT '',
    duration_ms INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_prompt_test_runs_prompt
    ON prompt_test_runs(prompt_id, created_at DESC);
`);

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS signals (
    id TEXT PRIMARY KEY,
    strategy_id TEXT NOT NULL,
    strategy_name TEXT NOT NULL,
    prompt_id TEXT NOT NULL,
    prompt_name TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('BUY', 'SELL', 'NO_TRADE')),
    confidence INTEGER NOT NULL,
    reasoning TEXT NOT NULL,
    entry_price TEXT,
    stop_loss TEXT,
    take_profit TEXT,
    risk_reward_ratio TEXT,
    invalidation TEXT NOT NULL DEFAULT '',
    market_context TEXT NOT NULL DEFAULT '',
    instrument TEXT NOT NULL,
    timeframe TEXT NOT NULL,
    current_price TEXT NOT NULL,
    claude_model TEXT NOT NULL,
    system_prompt_sent TEXT NOT NULL,
    user_prompt_sent TEXT NOT NULL,
    raw_response TEXT NOT NULL,
    duration_ms INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_signals_created
    ON signals(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_signals_action
    ON signals(action);
`);

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS backtest_runs (
    id TEXT PRIMARY KEY,
    config TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    progress INTEGER NOT NULL DEFAULT 0,
    signals TEXT NOT NULL DEFAULT '[]',
    results TEXT,
    error TEXT,
    strategy_name TEXT NOT NULL,
    prompt_name TEXT NOT NULL,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_backtest_runs_started
    ON backtest_runs(started_at DESC);
`);

console.log("✓ Database migrated successfully");
sqlite.close();
