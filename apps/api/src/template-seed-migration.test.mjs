import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";

const migration = (name) => readFileSync(`migrations/${name}`, "utf8");

describe("editable template migration", () => {
  test("replaces untouched legacy seed and preserves a user-edited copy", () => {
    const sqlite = new Database(":memory:");
    sqlite.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE workspaces (id TEXT PRIMARY KEY);
      INSERT INTO workspaces (id) VALUES ('ws_clean'), ('ws_edited');
    `);
    sqlite.exec(migration("0016_templates.sql"));
    sqlite.exec(migration("0017_seed_default_templates.sql"));
    sqlite.exec(migration("0018_fix_seed_template_markdown.sql"));
    sqlite.query(`
      UPDATE memo_templates
      SET name = '我的项目周报', updated_at = '2099-01-01T00:00:00.000Z'
      WHERE workspace_id = 'ws_edited'
    `).run();

    sqlite.exec(migration("0030_unify_editable_note_templates.sql"));

    const clean = sqlite.query(`SELECT id, name FROM memo_templates WHERE workspace_id = ? ORDER BY id`).all("ws_clean");
    const edited = sqlite.query(`SELECT id, name FROM memo_templates WHERE workspace_id = ? ORDER BY id`).all("ws_edited");
    expect(clean).toHaveLength(6);
    expect(clean.some((row) => row.id === "ws_clean_template_project_weekly")).toBe(false);
    expect(edited).toHaveLength(7);
    expect(edited.some((row) => row.name === "我的项目周报")).toBe(true);
    expect(clean.every((row) => !row.name.includes("内置"))).toBe(true);
  });
});
