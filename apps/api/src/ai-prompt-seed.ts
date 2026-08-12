import { DEFAULT_AI_PROMPT_SEEDS, defaultAiPromptId } from "@edgeever/shared";
import type { DatabaseAdapter } from "./storage-contract";
import { isoNow } from "./entity-utils";

/**
 * Insert any missing factory-default prompts for a workspace.
 * Uses deterministic ids + INSERT OR IGNORE so:
 * - deleted defaults are re-created
 * - user-edited defaults (same id) are left alone
 * - user-created prompts (random ids) are never touched
 */
export const restoreMissingDefaultAiPrompts = async (
  db: DatabaseAdapter,
  workspaceId: string,
): Promise<{ restoredCount: number; restoredIds: string[] }> => {
  const existing = await db.prepare(
    `SELECT id FROM ai_prompt_templates WHERE workspace_id = ? AND id LIKE ?`,
  ).bind(workspaceId, `${workspaceId}_aiprompt_%`).all<{ id: string }>();

  const existingIds = new Set((existing.results ?? []).map((row) => row.id));
  const missing = DEFAULT_AI_PROMPT_SEEDS.filter(
    (seed) => !existingIds.has(defaultAiPromptId(workspaceId, seed.key)),
  );

  if (missing.length === 0) {
    return { restoredCount: 0, restoredIds: [] };
  }

  const now = isoNow();
  const restoredIds: string[] = [];
  for (const seed of missing) {
    const id = defaultAiPromptId(workspaceId, seed.key);
    await db.prepare(
      `INSERT OR IGNORE INTO ai_prompt_templates (
         id, workspace_id, name, description, instruction, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      workspaceId,
      seed.name,
      seed.description,
      seed.instruction,
      now,
      now,
    ).run();
    restoredIds.push(id);
  }

  return { restoredCount: restoredIds.length, restoredIds };
};

/** Alias used when claiming / creating a workspace. */
export const ensureWorkspaceAiPromptSeed = restoreMissingDefaultAiPrompts;
