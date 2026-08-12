import {
  AiPromptTemplateCreateSchema,
  AiPromptTemplateUpdateSchema,
  type AiPromptTemplate,
} from "@edgeever/shared";
import { zValidator } from "@hono/zod-validator";
import type { Hono } from "hono";
import type { AppContext, AppEnv, Bindings } from "./api-context";
import { restoreMissingDefaultAiPrompts } from "./ai-prompt-seed";
import { audit } from "./audit";
import { createId, isoNow } from "./entity-utils";
import { forbidden, notFound } from "./http-errors";
import { getAuditActor, getWorkspaceId, requireUser } from "./request-auth";

export type AiPromptTemplateRow = {
  id: string;
  name: string;
  description: string | null;
  instruction: string;
  created_at: string;
  updated_at: string;
};

type AiPromptRouteDependencies = {
  isDemoMode: (environment: Bindings) => boolean;
};

const mapAiPromptTemplateRow = (row: AiPromptTemplateRow): AiPromptTemplate => ({
  id: row.id,
  name: row.name,
  description: row.description,
  instruction: row.instruction,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const getAiPromptTemplateRow = async (
  context: AppContext,
  id: string,
): Promise<AiPromptTemplateRow | null> =>
  context.env.storage.db.prepare(
    `SELECT id, name, description, instruction, created_at, updated_at
     FROM ai_prompt_templates
     WHERE id = ? AND workspace_id = ?`,
  ).bind(id, getWorkspaceId(context)).first<AiPromptTemplateRow>();

const denyMutation = (context: AppContext, dependencies: AiPromptRouteDependencies) => {
  const denied = requireUser(context);
  if (denied) return denied;
  if (dependencies.isDemoMode(context.env)) {
    return forbidden(context, "Custom prompts cannot be changed in demo mode.");
  }
  return null;
};

export const registerAiPromptRoutes = (
  app: Hono<AppEnv>,
  dependencies: AiPromptRouteDependencies,
) => {
  app.get("/api/v1/ai/prompts", async (context) => {
    const denied = requireUser(context);
    if (denied) return denied;

    const rows = await context.env.storage.db.prepare(
      `SELECT id, name, description, instruction, created_at, updated_at
       FROM ai_prompt_templates
       WHERE workspace_id = ?
       ORDER BY updated_at DESC, name ASC`,
    ).bind(getWorkspaceId(context)).all<AiPromptTemplateRow>();

    return context.json({ prompts: rows.results.map(mapAiPromptTemplateRow) });
  });

  app.post(
    "/api/v1/ai/prompts",
    zValidator("json", AiPromptTemplateCreateSchema),
    async (context) => {
      const denied = denyMutation(context, dependencies);
      if (denied) return denied;

      const input = context.req.valid("json");
      const workspaceId = getWorkspaceId(context);
      const id = createId("aiprompt");
      const now = isoNow();
      const name = input.name.trim();
      const description = input.description?.trim() || null;
      const instruction = input.instruction.trim();

      await context.env.storage.db.prepare(
        `INSERT INTO ai_prompt_templates (
           id, workspace_id, name, description, instruction, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(id, workspaceId, name, description, instruction, now, now).run();

      const row = await getAiPromptTemplateRow(context, id);
      const actor = getAuditActor(context);
      await audit(
        context.env.storage.db,
        actor.actorType,
        actor.actorId,
        "ai_prompt.create",
        "ai_prompt",
        id,
        {},
      );
      return context.json({ prompt: mapAiPromptTemplateRow(row!) }, 201);
    },
  );

  app.patch(
    "/api/v1/ai/prompts/:id",
    zValidator("json", AiPromptTemplateUpdateSchema),
    async (context) => {
      const denied = denyMutation(context, dependencies);
      if (denied) return denied;

      const id = context.req.param("id");
      const input = context.req.valid("json");
      const current = await getAiPromptTemplateRow(context, id);
      if (!current) return notFound(context, "Prompt not found");

      const name = input.name?.trim() ?? current.name;
      const description = input.description !== undefined
        ? (input.description?.trim() || null)
        : current.description;
      const instruction = input.instruction?.trim() ?? current.instruction;
      const now = isoNow();

      await context.env.storage.db.prepare(
        `UPDATE ai_prompt_templates
         SET name = ?, description = ?, instruction = ?, updated_at = ?
         WHERE id = ? AND workspace_id = ?`,
      ).bind(name, description, instruction, now, id, getWorkspaceId(context)).run();

      const row = await getAiPromptTemplateRow(context, id);
      const actor = getAuditActor(context);
      await audit(
        context.env.storage.db,
        actor.actorType,
        actor.actorId,
        "ai_prompt.update",
        "ai_prompt",
        id,
        {},
      );
      return context.json({ prompt: mapAiPromptTemplateRow(row!) });
    },
  );

  app.delete("/api/v1/ai/prompts/:id", async (context) => {
    const denied = denyMutation(context, dependencies);
    if (denied) return denied;

    const id = context.req.param("id");
    const current = await getAiPromptTemplateRow(context, id);
    if (!current) return notFound(context, "Prompt not found");

    await context.env.storage.db.prepare(
      `DELETE FROM ai_prompt_templates WHERE id = ? AND workspace_id = ?`,
    ).bind(id, getWorkspaceId(context)).run();

    const actor = getAuditActor(context);
    await audit(
      context.env.storage.db,
      actor.actorType,
      actor.actorId,
      "ai_prompt.delete",
      "ai_prompt",
      id,
      {},
    );
    return context.json({ ok: true });
  });

  /** Re-insert any factory defaults that were deleted. Does not overwrite edited defaults. */
  app.post("/api/v1/ai/prompts/restore-defaults", async (context) => {
    const denied = denyMutation(context, dependencies);
    if (denied) return denied;

    const workspaceId = getWorkspaceId(context);
    const { restoredCount, restoredIds } = await restoreMissingDefaultAiPrompts(
      context.env.storage.db,
      workspaceId,
    );

    const rows = await context.env.storage.db.prepare(
      `SELECT id, name, description, instruction, created_at, updated_at
       FROM ai_prompt_templates
       WHERE workspace_id = ?
       ORDER BY updated_at DESC, name ASC`,
    ).bind(workspaceId).all<AiPromptTemplateRow>();

    if (restoredCount > 0) {
      const actor = getAuditActor(context);
      await audit(
        context.env.storage.db,
        actor.actorType,
        actor.actorId,
        "ai_prompt.restore_defaults",
        "workspace",
        workspaceId,
        { restoredCount, restoredIds },
      );
    }

    return context.json({
      prompts: rows.results.map(mapAiPromptTemplateRow),
      restoredCount,
    });
  });
};
