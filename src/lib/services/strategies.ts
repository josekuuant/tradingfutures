import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import type { Strategy, CreateStrategyPayload, UpdateStrategyPayload } from "@/types/strategy";

// ─── Row ↔ Domain mapping ────────────────────────────────────

function toStrategy(row: schema.StrategyRow): Strategy {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    tag: row.tag,
    instrument: row.instrument as Strategy["instrument"],
    timeframes: JSON.parse(row.timeframes),
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

export async function listStrategies(): Promise<Strategy[]> {
  const rows = await db
    .select()
    .from(schema.strategies)
    .orderBy(schema.strategies.updatedAt);
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
  const values: Record<string, unknown> = { updatedAt: now };

  if (data.name !== undefined) values.name = data.name;
  if (data.description !== undefined) values.description = data.description;
  if (data.tag !== undefined) values.tag = data.tag;
  if (data.instrument !== undefined) values.instrument = data.instrument;
  if (data.timeframes !== undefined) values.timeframes = JSON.stringify(data.timeframes);
  if (data.contextConditions !== undefined) values.contextConditions = data.contextConditions;
  if (data.entryConditions !== undefined) values.entryConditions = data.entryConditions;
  if (data.invalidation !== undefined) values.invalidation = data.invalidation;
  if (data.tp1 !== undefined) values.tp1 = data.tp1;
  if (data.tp2 !== undefined) values.tp2 = data.tp2;
  if (data.minRR !== undefined) values.minRR = data.minRR;
  if (data.volatilityFilter !== undefined) values.volatilityFilter = data.volatilityFilter;
  if (data.volumeFilter !== undefined) values.volumeFilter = data.volumeFilter;
  if (data.scheduleFilter !== undefined) values.scheduleFilter = data.scheduleFilter;
  if (data.newsFilter !== undefined) values.newsFilter = data.newsFilter;
  if (data.noTradeRules !== undefined) values.noTradeRules = data.noTradeRules;
  if (data.promptTemplate !== undefined) values.promptTemplate = data.promptTemplate;

  await db
    .update(schema.strategies)
    .set(values)
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
  const now = new Date().toISOString();

  // Deactivate all
  await db
    .update(schema.strategies)
    .set({ isActive: false, updatedAt: now });

  // Activate the target
  await db
    .update(schema.strategies)
    .set({ isActive: true, updatedAt: now })
    .where(eq(schema.strategies.id, id));

  return getStrategy(id);
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
