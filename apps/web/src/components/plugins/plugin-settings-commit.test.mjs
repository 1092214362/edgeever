import { describe, expect, test } from "bun:test";
import {
  createPluginSettingWriteQueue,
  pluginSettingLoadSignature,
  revertBooleanSettingAfterFailedWrite,
} from "./plugin-settings-commit.ts";

describe("plugin setting commits", () => {
  test("stores an idle switch write before the click handler continues", () => {
    const queue = createPluginSettingWriteQueue();
    const stored = [];
    queue.enqueue("digest.auto-enabled", () => {
      stored.push(true);
      return Promise.resolve();
    });
    expect(stored).toEqual([true]);
  });

  test("keeps an older switch write from landing after a newer one", async () => {
    const queue = createPluginSettingWriteQueue();
    const stored = [];
    let releaseOlder = () => {};
    const older = queue.enqueue("digest.auto-enabled", () => new Promise((resolve) => {
      releaseOlder = () => {
        stored.push(false);
        resolve();
      };
    }));
    const newer = queue.enqueue("digest.auto-enabled", async () => {
      stored.push(true);
    });

    expect(stored).toEqual([]);
    releaseOlder();
    await older;
    await newer;
    expect(stored).toEqual([false, true]);
  });

  test("a failed write does not block the next switch position", async () => {
    const queue = createPluginSettingWriteQueue();
    const stored = [];
    await expect(queue.enqueue("digest.auto-enabled", async () => {
      throw new Error("storage unavailable");
    })).rejects.toThrow("storage unavailable");
    await queue.enqueue("digest.auto-enabled", async () => {
      stored.push(true);
    });
    expect(stored).toEqual([true]);
  });

  test("a failed write only snaps the switch back when the user has not moved it", () => {
    expect(revertBooleanSettingAfterFailedWrite(true, true)).toBe(false);
    expect(revertBooleanSettingAfterFailedWrite(false, false)).toBe(true);
    expect(revertBooleanSettingAfterFailedWrite(false, true)).toBe(false);
    expect(revertBooleanSettingAfterFailedWrite(true, false)).toBe(true);
  });

  test("reloads stored values when fields change, not when the manifest object is copied", () => {
    const fields = [
      { key: "digest.auto-enabled", type: "boolean", default: false },
      { key: "digest.generation-time", type: "select", default: "08:00" },
    ];
    expect(pluginSettingLoadSignature(fields)).toBe(pluginSettingLoadSignature(fields.map((field) => ({ ...field }))));
    expect(pluginSettingLoadSignature(fields)).not.toBe(pluginSettingLoadSignature([
      ...fields,
      { key: "digest.window-hours", type: "number", default: 24 },
    ]));
  });
});
