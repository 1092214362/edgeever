import { describe, expect, test } from "bun:test";
import { parseDiagramDocument } from "@edgeever/shared";
import {
  decodeDemoAttachment,
  DEMO_SEED_ATTACHMENT_RESOURCES,
  DEMO_SEED_MEMOS,
  DEMO_SEED_NOTEBOOKS,
  DEMO_SEED_REVISIONS,
} from "./demo-seed-data.ts";

describe("demo seed catalog", () => {
  test("keeps bilingual memos attached to valid notebooks", () => {
    const notebookIds = new Set(DEMO_SEED_NOTEBOOKS.map((notebook) => notebook.id));
    const memoIds = new Set(DEMO_SEED_MEMOS.map((memo) => memo.id));

    expect(notebookIds.size).toBe(DEMO_SEED_NOTEBOOKS.length);
    expect(memoIds.size).toBe(DEMO_SEED_MEMOS.length);
    expect(memoIds.has("memo_demo_overview")).toBe(true);
    expect(memoIds.has("memo_demo_overview_en")).toBe(true);
    expect(memoIds.has("memo_demo_architecture")).toBe(true);
    expect(memoIds.has("memo_demo_architecture_en")).toBe(true);
    expect(memoIds.has("memo_demo_flowchart")).toBe(true);
    expect(memoIds.has("memo_demo_flowchart_en")).toBe(true);
    expect(memoIds.has("memo_demo_mind_map")).toBe(true);
    expect(memoIds.has("memo_demo_mind_map_en")).toBe(true);
    for (const memo of DEMO_SEED_MEMOS) {
      expect(notebookIds.has(memo.notebookId)).toBe(true);
    }
    for (const revision of DEMO_SEED_REVISIONS) {
      expect(memoIds.has(revision.memoId)).toBe(true);
    }
  });

  test("seeds one editable example for every native diagram kind in each language", () => {
    for (const suffix of ["", "_en"]) {
      const examples = [
        ["architecture", `memo_demo_architecture${suffix}`],
        ["flowchart", `memo_demo_flowchart${suffix}`],
        ["mind-map", `memo_demo_mind_map${suffix}`],
      ];

      for (const [kind, memoId] of examples) {
        const memo = DEMO_SEED_MEMOS.find((candidate) => candidate.id === memoId);
        expect(memo).toBeDefined();
        expect(parseDiagramDocument(memo?.markdown)).toMatchObject({ kind });
      }
    }
  });

  test("keeps every seeded resource decodable and owned by a seeded memo", () => {
    const memoIds = new Set(DEMO_SEED_MEMOS.map((memo) => memo.id));
    const resourceIds = new Set();

    for (const resource of DEMO_SEED_ATTACHMENT_RESOURCES) {
      expect(resourceIds.has(resource.id)).toBe(false);
      resourceIds.add(resource.id);
      expect(memoIds.has(resource.memoId)).toBe(true);
      const bytes = "svg" in resource
        ? new TextEncoder().encode(resource.svg)
        : decodeDemoAttachment(resource);
      expect(bytes.byteLength).toBeGreaterThan(0);
    }
  });
});
