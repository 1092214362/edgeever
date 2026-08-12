import { describe, expect, test } from "bun:test";
import { globSync, readFileSync } from "node:fs";
import { Database } from "bun:sqlite";
import { Hono } from "hono";
import {
  AiPromptTemplateCreateSchema,
  AiPromptTemplateUpdateSchema,
  DEFAULT_AI_PROMPT_SEEDS,
  defaultAiPromptId,
} from "@edgeever/shared";
import { registerAiPromptRoutes } from "./ai-prompt-routes.ts";

const auth = {
  kind: "user",
  actorType: "user",
  actorId: "usr_member",
  username: "member",
  displayName: "Member",
  scopes: [],
  workspaceId: "ws_member",
  role: "member",
};

class SqliteD1PreparedStatement {
  constructor(db, sql, bindings = []) {
    this.db = db;
    this.sql = sql;
    this.bindings = bindings;
  }

  bind(...bindings) {
    return new SqliteD1PreparedStatement(this.db, this.sql, bindings);
  }

  async all() {
    return { results: this.db.query(this.sql).all(...this.bindings), success: true, meta: {} };
  }

  async first() {
    return this.db.query(this.sql).get(...this.bindings) ?? null;
  }

  async run() {
    this.db.query(this.sql).run(...this.bindings);
    return { success: true, meta: {} };
  }
}

class SqliteD1Database {
  constructor(db) {
    this.db = db;
  }

  prepare(sql) {
    return new SqliteD1PreparedStatement(this.db, sql);
  }

  async batch(statements) {
    return this.db.transaction(() => statements.map((statement) =>
      this.db.query(statement.sql).run(...statement.bindings)))();
  }
}

const createDatabaseEnvironment = () => {
  const sqlite = new Database(":memory:");
  for (const migration of globSync("migrations/*.sql").sort()) {
    sqlite.exec(readFileSync(migration, "utf8"));
  }
  sqlite.query("INSERT INTO workspaces (id, name, is_personal) VALUES (?, ?, 1)")
    .run("ws_member", "Member workspace");
  sqlite.query("INSERT INTO workspaces (id, name, is_personal) VALUES (?, ?, 1)")
    .run("ws_other", "Other workspace");
  return {
    sqlite,
    environment: {
      storage: { db: new SqliteD1Database(sqlite), resources: {} },
    },
  };
};

const createApp = ({ currentAuth = auth, demoMode = false } = {}) => {
  const app = new Hono();
  app.use("/api/v1/*", async (context, next) => {
    context.set("auth", currentAuth);
    await next();
  });
  registerAiPromptRoutes(app, { isDemoMode: () => demoMode });
  return app;
};

describe("AI prompt template routes", () => {
  test("validates create and update payloads", () => {
    expect(AiPromptTemplateCreateSchema.safeParse({
      name: "Weekly digest",
      instruction: "Summarize progress and risks.",
    }).success).toBe(true);
    expect(AiPromptTemplateCreateSchema.safeParse({
      name: "",
      instruction: "Body",
    }).success).toBe(false);
    expect(AiPromptTemplateUpdateSchema.safeParse({
      instruction: "Updated instruction",
    }).success).toBe(true);
    expect(AiPromptTemplateUpdateSchema.safeParse({}).success).toBe(false);
  });

  test("supports create list update and delete within a workspace", async () => {
    const { environment } = createDatabaseEnvironment();
    const app = createApp();

    const created = await app.request(
      "/api/v1/ai/prompts",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "会议待办",
          description: "提取行动项",
          instruction: "提取明确待办，输出 Markdown 任务列表。",
        }),
      },
      environment,
    );
    expect(created.status).toBe(201);
    const createdBody = await created.json();
    expect(createdBody.prompt).toMatchObject({
      name: "会议待办",
      description: "提取行动项",
      instruction: "提取明确待办，输出 Markdown 任务列表。",
    });
    expect(createdBody.prompt.id).toMatch(/^aiprompt_/);

    const listed = await app.request("/api/v1/ai/prompts", {}, environment);
    expect(listed.status).toBe(200);
    const listedBody = await listed.json();
    expect(listedBody.prompts).toHaveLength(1);
    expect(listedBody.prompts[0].id).toBe(createdBody.prompt.id);

    const updated = await app.request(
      `/api/v1/ai/prompts/${createdBody.prompt.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instruction: "只提取有负责人的待办。" }),
      },
      environment,
    );
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({
      prompt: {
        id: createdBody.prompt.id,
        name: "会议待办",
        instruction: "只提取有负责人的待办。",
      },
    });

    const deleted = await app.request(
      `/api/v1/ai/prompts/${createdBody.prompt.id}`,
      { method: "DELETE" },
      environment,
    );
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toEqual({ ok: true });

    const empty = await app.request("/api/v1/ai/prompts", {}, environment);
    expect(await empty.json()).toEqual({ prompts: [] });
  });

  test("does not leak prompts across workspaces", async () => {
    const { environment } = createDatabaseEnvironment();
    const memberApp = createApp();
    const otherApp = createApp({
      currentAuth: { ...auth, workspaceId: "ws_other", actorId: "usr_other" },
    });

    const created = await memberApp.request(
      "/api/v1/ai/prompts",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Private", instruction: "Keep this private." }),
      },
      environment,
    );
    const { prompt } = await created.json();

    const listed = await otherApp.request("/api/v1/ai/prompts", {}, environment);
    expect(await listed.json()).toEqual({ prompts: [] });

    const missing = await otherApp.request(
      `/api/v1/ai/prompts/${prompt.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Hijacked" }),
      },
      environment,
    );
    expect(missing.status).toBe(404);
  });

  test("blocks prompt mutations in demo mode", async () => {
    const { environment } = createDatabaseEnvironment();
    const app = createApp({ demoMode: true });
    const response = await app.request(
      "/api/v1/ai/prompts",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Demo", instruction: "Should fail." }),
      },
      environment,
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "forbidden" } });
  });

  test("restores only missing default prompts without overwriting edits", async () => {
    const { environment } = createDatabaseEnvironment();
    const app = createApp();
    const workspaceId = auth.workspaceId;

    const first = await app.request(
      "/api/v1/ai/prompts/restore-defaults",
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
      environment,
    );
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.restoredCount).toBe(DEFAULT_AI_PROMPT_SEEDS.length);
    expect(firstBody.prompts).toHaveLength(DEFAULT_AI_PROMPT_SEEDS.length);

    const summarizeId = defaultAiPromptId(workspaceId, "summarize");
    await app.request(
      `/api/v1/ai/prompts/${summarizeId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instruction: "用户改过的总结指令" }),
      },
      environment,
    );

    const todosId = defaultAiPromptId(workspaceId, "extract-todos");
    await app.request(`/api/v1/ai/prompts/${todosId}`, { method: "DELETE" }, environment);

    const second = await app.request(
      "/api/v1/ai/prompts/restore-defaults",
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
      environment,
    );
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.restoredCount).toBe(1);
    expect(secondBody.prompts).toHaveLength(DEFAULT_AI_PROMPT_SEEDS.length);

    const summarize = secondBody.prompts.find((prompt) => prompt.id === summarizeId);
    expect(summarize?.instruction).toBe("用户改过的总结指令");

    const third = await app.request(
      "/api/v1/ai/prompts/restore-defaults",
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
      environment,
    );
    expect(await third.json()).toMatchObject({ restoredCount: 0 });
  });
});
