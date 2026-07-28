import { afterEach, describe, expect, test } from "bun:test";
import { IDBKeyRange, indexedDB } from "fake-indexeddb";

globalThis.indexedDB = indexedDB;
globalThis.IDBKeyRange = IDBKeyRange;

const { localDb } = await import("./local-db.ts");
const { api } = await import("./api.ts");
const { createWebRepository } = await import("./repository.ts");

afterEach(async () => {
  await localDb.transaction("rw", [localDb.templates, localDb.notebooks, localDb.memos, localDb.resources, localDb.revisions, localDb.syncMeta], async () => {
    await Promise.all([
      localDb.templates.clear(),
      localDb.notebooks.clear(),
      localDb.memos.clear(),
      localDb.resources.clear(),
      localDb.revisions.clear(),
      localDb.syncMeta.clear(),
    ]);
  });
});

describe("web repository offline boundaries", () => {
  test("falls back to the remote detail when the local database read is blocked", async () => {
    const previousOnline = globalThis.navigator?.onLine;
    if (globalThis.navigator) Object.defineProperty(globalThis.navigator, "onLine", { configurable: true, value: true });
    const scope = "https://demo.edgeever.org|user-1";
    const remoteMemo = {
      id: "memo-blocked",
      notebookId: "nb-1",
      title: "Remote detail",
      excerpt: "Remote excerpt",
      tags: [],
      isPinned: false,
      isArchived: false,
      isDeleted: false,
      revision: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      deletedAt: null,
      contentJson: { type: "doc", content: [] },
      contentMarkdown: "remote",
      contentText: "remote",
      contentHash: "remote",
      sourceMemoIds: [],
    };
    const originalLocalGet = localDb.memos.get;
    const originalLocalPut = localDb.memos.put;
    const originalApiGetMemo = api.getMemo;
    localDb.memos.get = async () => new Promise(() => {});
    localDb.memos.put = async () => new Promise(() => {});
    api.getMemo = async () => ({ memo: remoteMemo });

    try {
      const repository = createWebRepository(scope);
      const startedAt = Date.now();
      expect((await repository.getMemo("memo-blocked")).memo.title).toBe("Remote detail");
      expect(Date.now() - startedAt).toBeLessThan(1_000);
    } finally {
      localDb.memos.get = originalLocalGet;
      localDb.memos.put = originalLocalPut;
      api.getMemo = originalApiGetMemo;
      if (globalThis.navigator) Object.defineProperty(globalThis.navigator, "onLine", { configurable: true, value: previousOnline });
    }
  });

  test("returns cached detail immediately and refreshes it in the background", async () => {
    const previousOnline = globalThis.navigator?.onLine;
    if (globalThis.navigator) Object.defineProperty(globalThis.navigator, "onLine", { configurable: true, value: true });
    const scope = "https://demo.edgeever.org|user-1";
    const localMemo = {
      id: "memo-1",
      notebookId: "nb-1",
      title: "Cached title",
      excerpt: "Cached excerpt",
      tags: [],
      isPinned: false,
      isArchived: false,
      isDeleted: false,
      revision: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      deletedAt: null,
      contentJson: { type: "doc", content: [] },
      contentMarkdown: "cached",
      contentText: "cached",
      contentHash: "cached",
      sourceMemoIds: [],
    };
    const remoteMemo = { ...localMemo, title: "Remote title", contentMarkdown: "remote", contentText: "remote", revision: 2 };
    await localDb.memos.put({ ...localMemo, scope });
    const originalGetMemo = api.getMemo;
    api.getMemo = async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { memo: remoteMemo };
    };

    try {
      const repository = createWebRepository(scope);
      expect((await repository.getMemo("memo-1")).memo.title).toBe("Cached title");
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect((await localDb.memos.get([scope, "memo-1"])).title).toBe("Remote title");
    } finally {
      api.getMemo = originalGetMemo;
      if (globalThis.navigator) Object.defineProperty(globalThis.navigator, "onLine", { configurable: true, value: previousOnline });
    }
  });

  test("returns empty initialized collections without cloud fallbacks", async () => {
    const previousOnline = globalThis.navigator?.onLine;
    if (globalThis.navigator) Object.defineProperty(globalThis.navigator, "onLine", { configurable: true, value: false });
    const scope = "https://demo.edgeever.org|user-1";
    await localDb.syncMeta.put({ scope, key: "identity", value: "sync-1", updatedAt: new Date().toISOString() });
    const original = {
      listTags: api.listTags,
      listTemplates: api.listTemplates,
      listResources: api.listResources,
      listNotebooks: api.listNotebooks,
    };
    api.listTags = async () => { throw new Error("cloud fallback"); };
    api.listTemplates = async () => { throw new Error("cloud fallback"); };
    api.listResources = async () => { throw new Error("cloud fallback"); };
    api.listNotebooks = async () => { throw new Error("cloud fallback"); };

    try {
      const repository = createWebRepository(scope);
      expect(await repository.listTags()).toEqual({ tags: [] });
      expect(await repository.listTemplates()).toEqual({ templates: [] });
      expect(await repository.listResources()).toEqual({ resources: [], summary: { totalCount: 0, totalBytes: 0, imageCount: 0, attachmentCount: 0 } });
      expect((await repository.listNotebooks()).notebooks).toEqual([]);
    } finally {
      api.listTags = original.listTags;
      api.listTemplates = original.listTemplates;
      api.listResources = original.listResources;
      api.listNotebooks = original.listNotebooks;
      if (globalThis.navigator) Object.defineProperty(globalThis.navigator, "onLine", { configurable: true, value: previousOnline });
    }
  });
});
