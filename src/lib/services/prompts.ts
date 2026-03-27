import { db, schema } from "@/lib/db";
import { eq, desc } from "drizzle-orm";
import { pickDefined } from "@/lib/utils";
import type {
  Prompt,
  PromptVersion,
  PromptTestRun,
  CreatePromptPayload,
  UpdatePromptPayload,
} from "@/types/prompt";

// ─── Row → Domain ────────────────────────────────────────────

function toPrompt(row: schema.PromptRow): Prompt {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    tag: row.tag,
    systemPrompt: row.systemPrompt,
    userPromptTemplate: row.userPromptTemplate,
    outputSchema: row.outputSchema,
    outputValidationRules: row.outputValidationRules,
    isActive: row.isActive,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toVersion(row: schema.PromptVersionRow): PromptVersion {
  return {
    id: row.id,
    promptId: row.promptId,
    version: row.version,
    systemPrompt: row.systemPrompt,
    userPromptTemplate: row.userPromptTemplate,
    outputSchema: row.outputSchema,
    outputValidationRules: row.outputValidationRules,
    createdAt: row.createdAt,
  };
}

function toTestRun(row: schema.PromptTestRunRow): PromptTestRun {
  return {
    id: row.id,
    promptId: row.promptId,
    inputVariables: row.inputVariables,
    renderedPrompt: row.renderedPrompt,
    response: row.response,
    durationMs: row.durationMs,
    createdAt: row.createdAt,
  };
}

// ─── CRUD ────────────────────────────────────────────────────

export async function listPrompts(limit = 100): Promise<Prompt[]> {
  const rows = await db
    .select()
    .from(schema.prompts)
    .orderBy(desc(schema.prompts.updatedAt))
    .limit(limit);
  return rows.map(toPrompt);
}

export async function getPrompt(id: string): Promise<Prompt | null> {
  const rows = await db
    .select()
    .from(schema.prompts)
    .where(eq(schema.prompts.id, id))
    .limit(1);
  return rows.length > 0 ? toPrompt(rows[0]) : null;
}

export async function createPrompt(data: CreatePromptPayload): Promise<Prompt> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(schema.prompts).values({
    id,
    name: data.name,
    description: data.description ?? "",
    tag: data.tag ?? "",
    systemPrompt: data.systemPrompt ?? "",
    userPromptTemplate: data.userPromptTemplate,
    outputSchema: data.outputSchema ?? "",
    outputValidationRules: data.outputValidationRules ?? "",
    isActive: false,
    version: 1,
    createdAt: now,
    updatedAt: now,
  });

  // Save initial version
  await saveVersion(id, 1, data);

  return (await getPrompt(id))!;
}

export async function updatePrompt(
  id: string,
  data: UpdatePromptPayload
): Promise<Prompt | null> {
  const existing = await getPrompt(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const contentChanged =
    (data.systemPrompt !== undefined && data.systemPrompt !== existing.systemPrompt) ||
    (data.userPromptTemplate !== undefined && data.userPromptTemplate !== existing.userPromptTemplate) ||
    (data.outputSchema !== undefined && data.outputSchema !== existing.outputSchema) ||
    (data.outputValidationRules !== undefined && data.outputValidationRules !== existing.outputValidationRules);

  const newVersion = contentChanged ? existing.version + 1 : existing.version;

  const values = {
    ...pickDefined({
      name: data.name,
      description: data.description,
      tag: data.tag,
      systemPrompt: data.systemPrompt,
      userPromptTemplate: data.userPromptTemplate,
      outputSchema: data.outputSchema,
      outputValidationRules: data.outputValidationRules,
    }),
    updatedAt: now,
    ...(contentChanged ? { version: newVersion } : {}),
  };

  await db
    .update(schema.prompts)
    .set(values)
    .where(eq(schema.prompts.id, id));

  // Save version snapshot if content changed
  if (contentChanged) {
    const updated = await getPrompt(id);
    if (updated) {
      await saveVersion(id, newVersion, {
        systemPrompt: updated.systemPrompt,
        userPromptTemplate: updated.userPromptTemplate,
        outputSchema: updated.outputSchema,
        outputValidationRules: updated.outputValidationRules,
      });
    }
  }

  return getPrompt(id);
}

export async function deletePrompt(id: string): Promise<boolean> {
  // Delete test runs and versions first
  await db.delete(schema.promptTestRuns).where(eq(schema.promptTestRuns.promptId, id));
  await db.delete(schema.promptVersions).where(eq(schema.promptVersions.promptId, id));
  const result = await db.delete(schema.prompts).where(eq(schema.prompts.id, id));
  return (result as unknown as { changes: number }).changes > 0;
}

export async function duplicatePrompt(sourceId: string): Promise<Prompt | null> {
  const source = await getPrompt(sourceId);
  if (!source) return null;

  return createPrompt({
    name: `${source.name} (copy)`,
    description: source.description,
    tag: source.tag,
    systemPrompt: source.systemPrompt,
    userPromptTemplate: source.userPromptTemplate,
    outputSchema: source.outputSchema,
    outputValidationRules: source.outputValidationRules,
  });
}

export async function activatePrompt(id: string): Promise<Prompt | null> {
  const now = new Date().toISOString();
  await db.update(schema.prompts).set({ isActive: false, updatedAt: now });
  await db
    .update(schema.prompts)
    .set({ isActive: true, updatedAt: now })
    .where(eq(schema.prompts.id, id));
  return getPrompt(id);
}

export async function deactivatePrompt(id: string): Promise<Prompt | null> {
  const now = new Date().toISOString();
  await db
    .update(schema.prompts)
    .set({ isActive: false, updatedAt: now })
    .where(eq(schema.prompts.id, id));
  return getPrompt(id);
}

// ─── Versions ────────────────────────────────────────────────

async function saveVersion(
  promptId: string,
  version: number,
  data: Partial<CreatePromptPayload>
): Promise<void> {
  await db.insert(schema.promptVersions).values({
    promptId,
    version,
    systemPrompt: data.systemPrompt ?? "",
    userPromptTemplate: data.userPromptTemplate ?? "",
    outputSchema: data.outputSchema ?? "",
    outputValidationRules: data.outputValidationRules ?? "",
  });
}

export async function listVersions(promptId: string): Promise<PromptVersion[]> {
  const rows = await db
    .select()
    .from(schema.promptVersions)
    .where(eq(schema.promptVersions.promptId, promptId))
    .orderBy(desc(schema.promptVersions.version));
  return rows.map(toVersion);
}

export async function restoreVersion(
  promptId: string,
  versionId: string
): Promise<Prompt | null> {
  const vRows = await db
    .select()
    .from(schema.promptVersions)
    .where(eq(schema.promptVersions.id, versionId))
    .limit(1);
  if (vRows.length === 0) return null;

  const v = vRows[0];
  return updatePrompt(promptId, {
    systemPrompt: v.systemPrompt,
    userPromptTemplate: v.userPromptTemplate,
    outputSchema: v.outputSchema,
    outputValidationRules: v.outputValidationRules,
  });
}

// ─── Test runs ───────────────────────────────────────────────

export async function saveTestRun(
  promptId: string,
  inputVariables: Record<string, string>,
  renderedPrompt: string,
  response: string,
  durationMs: number
): Promise<PromptTestRun> {
  const id = crypto.randomUUID();
  await db.insert(schema.promptTestRuns).values({
    id,
    promptId,
    inputVariables: JSON.stringify(inputVariables),
    renderedPrompt,
    response,
    durationMs,
  });

  const rows = await db
    .select()
    .from(schema.promptTestRuns)
    .where(eq(schema.promptTestRuns.id, id))
    .limit(1);
  return toTestRun(rows[0]);
}

export async function listTestRuns(
  promptId: string,
  limit = 20
): Promise<PromptTestRun[]> {
  const rows = await db
    .select()
    .from(schema.promptTestRuns)
    .where(eq(schema.promptTestRuns.promptId, promptId))
    .orderBy(desc(schema.promptTestRuns.createdAt))
    .limit(limit);
  return rows.map(toTestRun);
}

// ─── Template rendering ─────────────────────────────────────

export function renderTemplate(
  template: string,
  variables: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return result;
}
