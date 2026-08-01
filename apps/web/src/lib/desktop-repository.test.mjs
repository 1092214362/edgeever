import { describe, expect, test } from "bun:test";

let lastRequest = null;

globalThis.window = {
  location: { hostname: "notes.example.com", origin: "https://notes.example.com" },
  edgeeverDesktop: {
    isAvailable: true,
    sidecarRequest: async (method, params) => {
      lastRequest = { method, params };
      return { memos: [], totalCount: 0, nextCursor: null };
    },
  },
};

const { createDesktopRepository } = await import("./desktop-repository.ts");

describe("desktop repository notebook filters", () => {
  test("uses the notebook subtree without also restricting results to the parent", async () => {
    await createDesktopRepository().listMemos({
      notebookId: "parent",
      notebookIds: ["parent", "child"],
    });

    expect(lastRequest).toEqual({
      method: "memo.list",
      params: {
        notebookId: null,
        notebookIds: ["parent", "child"],
      },
    });
  });
});
