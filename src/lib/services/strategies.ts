import { db, schema } from "@/lib/db";
import { eq, desc } from "drizzle-orm";
import { pickDefined, safeJsonParse } from "@/lib/utils";
import type { Strategy, CreateStrategyPayload, UpdateStrategyPayload } from "@/types/strategy";
import type { Timeframe } from "@/types/market";

// ─── Row ↔ Domain mapping ────────────────────────────────────

function toStrategy(row: schema.StrategyRow): Strategy {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    tag: row.tag,
    instrument: row.instrument as Strategy["instrument"],
    timeframes: safeJsonParse<Timeframe[]>(row.timeframes, ["5m"]),
    contextConditions: row.contextConditions,
    entryConditions: row.entryConditions,
    invalidation: row.invalidation,
    tp1: row.tp1,
    tp2: row.tp2,
    minRR: row.minRR,
    volatilityFilter: row.volatilityFilter,
    volumeFilter: row.volumeFilter,
    scheduleFilter: row.scheduleFilter,
    newsFilter: row.newsFilter,
    noTradeRules: row.noTradeRules,
    promptTemplate: row.promptTemplate,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ─── Service ─────────────────────────────────────────────────

export async function listStrategies(limit = 100): Promise<Strategy[]> {
  const rows = await db
    .select()
    .from(schema.strategies)
    .orderBy(desc(schema.strategies.updatedAt))
    .limit(limit);
  return rows.map(toStrategy);
}

export async function getStrategy(id: string): Promise<Strategy | null> {
  const rows = await db
    .select()
    .from(schema.strategies)
    .where(eq(schema.strategies.id, id))
    .limit(1);
  return rows.length > 0 ? toStrategy(rows[0]) : null;
}

export async function createStrategy(
  data: CreateStrategyPayload
): Promise<Strategy> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(schema.strategies).values({
    id,
    name: data.name,
    description: data.description ?? "",
    tag: data.tag ?? "",
    instrument: data.instrument ?? "NQ",
    timeframes: JSON.stringify(data.timeframes),
    contextConditions: data.contextConditions ?? "",
    entryConditions: data.entryConditions ?? "",
    invalidation: data.invalidation ?? "",
    tp1: data.tp1 ?? "",
    tp2: data.tp2 ?? "",
    minRR: data.minRR ?? 2,
    volatilityFilter: data.volatilityFilter ?? "",
    volumeFilter: data.volumeFilter ?? "",
    scheduleFilter: data.scheduleFilter ?? "",
    newsFilter: data.newsFilter ?? "",
    noTradeRules: data.noTradeRules ?? "",
    promptTemplate: data.promptTemplate ?? "",
    isActive: false,
    createdAt: now,
    updatedAt: now,
  });

  return (await getStrategy(id))!;
}

export async function updateStrategy(
  id: string,
  data: UpdateStrategyPayload
): Promise<Strategy | null> {
  const existing = await getStrategy(id);
  if (!existing) return null;

  const now = new Date().toISOString();

  const values = pickDefined({
    name: data.name,
    description: data.description,
    tag: data.tag,
    instrument: data.instrument,
    timeframes: data.timeframes ? JSON.stringify(data.timeframes) : undefined,
    contextConditions: data.contextConditions,
    entryConditions: data.entryConditions,
    invalidation: data.invalidation,
    tp1: data.tp1,
    tp2: data.tp2,
    minRR: data.minRR,
    volatilityFilter: data.volatilityFilter,
    volumeFilter: data.volumeFilter,
    scheduleFilter: data.scheduleFilter,
    newsFilter: data.newsFilter,
    noTradeRules: data.noTradeRules,
    promptTemplate: data.promptTemplate,
  });

  await db
    .update(schema.strategies)
    .set({ ...values, updatedAt: now })
    .where(eq(schema.strategies.id, id));

  return getStrategy(id);
}

export async function deleteStrategy(id: string): Promise<boolean> {
  const result = await db
    .delete(schema.strategies)
    .where(eq(schema.strategies.id, id));
  return (result as unknown as { changes: number }).changes > 0;
}

export async function duplicateStrategy(sourceId: string): Promise<Strategy | null> {
  const source = await getStrategy(sourceId);
  if (!source) return null;

  return createStrategy({
    name: `${source.name} (copy)`,
    description: source.description,
    tag: source.tag,
    instrument: source.instrument,
    timeframes: source.timeframes,
    contextConditions: source.contextConditions,
    entryConditions: source.entryConditions,
    invalidation: source.invalidation,
    tp1: source.tp1,
    tp2: source.tp2,
    minRR: source.minRR,
    volatilityFilter: source.volatilityFilter,
    volumeFilter: source.volumeFilter,
    scheduleFilter: source.scheduleFilter,
    newsFilter: source.newsFilter,
    noTradeRules: source.noTradeRules,
    promptTemplate: source.promptTemplate,
  });
}

export async function activateStrategy(id: string): Promise<Strategy | null> {
  // Verify strategy exists before modifying state
  const target = await getStrategy(id);
  if (!target) return null;

  const now = new Date().toISOString();
  // Use transaction for atomicity — deactivate all + activate target
  db.transaction((tx) => {
    tx.update(schema.strategies).set({ isActive: false, updatedAt: now }).run();
    tx.update(schema.strategies)
      .set({ isActive: true, updatedAt: now })
      .where(eq(schema.strategies.id, id))
      .run();
  });

  // Verify activation succeeded
  const result = await getStrategy(id);
  if (result && !result.isActive) {
    throw new Error(`Failed to activate strategy ${id}`);
  }
  return result;
}

export async function deactivateStrategy(id: string): Promise<Strategy | null> {
  const now = new Date().toISOString();
  await db
    .update(schema.strategies)
    .set({ isActive: false, updatedAt: now })
    .where(eq(schema.strategies.id, id));
  return getStrategy(id);
}

export async function getActiveStrategy(): Promise<Strategy | null> {
  const rows = await db
    .select()
    .from(schema.strategies)
    .where(eq(schema.strategies.isActive, true))
    .limit(1);
  return rows.length > 0 ? toStrategy(rows[0]) : null;
}
