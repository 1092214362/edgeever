import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createCloudflareStorageAdapter } from "../apps/api/src/cloudflare-storage-adapter";
import { createSelfHostedStorageAdapter } from "../apps/api/src/self-hosted-storage-adapter";
import { SELF_HOSTED_DATABASE_DIALECT } from "../apps/api/src/self-hosted-storage-adapter";

describe("storage adapter", () => {
  test("wraps Cloudflare bindings without changing their identity", () => {
    const db = { prepare: () => undefined, batch: () => undefined };
    const resources = { get: async () => null, put: async () => undefined, delete: async () => undefined };
    const adapter = createCloudflareStorageAdapter({ DB: db, RESOURCES: resources } as never);

    expect(adapter.db).toBe(db);
    expect(adapter.resources).toBe(resources);
  });

  test("keeps the self-hosted database dialect explicit", () => {
    expect(SELF_HOSTED_DATABASE_DIALECT).toBe("sqlite");
  });

  test("stores attachments in a persistent filesystem directory", async () => {
    const directory = await mkdtemp(`${tmpdir()}/edgeever-storage-`);
    const sqlite = {
      query: () => ({ all: () => [], get: () => null, run: () => undefined }),
      transaction: (callback: () => void) => () => callback(),
    };

    try {
      const adapter = createSelfHostedStorageAdapter(sqlite, directory);
      await adapter.resources.put("workspace/memo/image.bin", new Uint8Array([1, 2, 3]));

      expect(await readFile(`${directory}/workspace/memo/image.bin`)).toEqual(new Uint8Array([1, 2, 3]));
      expect(await adapter.resources.get("workspace/memo/image.bin")).not.toBeNull();
      await adapter.resources.delete("workspace/memo/image.bin");
      expect(await adapter.resources.get("workspace/memo/image.bin")).toBeNull();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("rejects attachment path traversal", async () => {
    const directory = await mkdtemp(`${tmpdir()}/edgeever-storage-`);
    const sqlite = {
      query: () => ({ all: () => [], get: () => null, run: () => undefined }),
      transaction: (callback: () => void) => () => callback(),
    };

    try {
      const adapter = createSelfHostedStorageAdapter(sqlite, directory);
      await expect(adapter.resources.put("../outside", new Uint8Array([1]))).rejects.toThrow(
        "Invalid resource object key",
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
