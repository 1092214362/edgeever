import { beforeEach, describe, expect, test } from "bun:test";
import { hasUnseenDeployedUpdate, markDeployedUpdateSeen } from "./pwa-update-notice";

const values = new Map();

beforeEach(() => {
  values.clear();
  globalThis.window = {
    dispatchEvent: () => true,
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
    },
  };
});

describe("deployed update notice", () => {
  test("uses the first observed release as a read baseline", () => {
    expect(hasUnseenDeployedUpdate("v1.0.0")).toBe(false);
    expect(hasUnseenDeployedUpdate("v1.0.0")).toBe(false);
  });

  test("stays visible after the formal release changes until the user views it", () => {
    expect(hasUnseenDeployedUpdate("v1.0.0")).toBe(false);
    expect(hasUnseenDeployedUpdate("v1.1.0")).toBe(true);
    expect(hasUnseenDeployedUpdate("v1.1.0")).toBe(true);

    markDeployedUpdateSeen("v1.1.0");
    expect(hasUnseenDeployedUpdate("v1.1.0")).toBe(false);
  });
});
