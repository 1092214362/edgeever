import { expect, test } from "bun:test";
import { restoreTestGlobal } from "./restore-test-global.mjs";

test("restoreTestGlobal deletes a missing global instead of shadowing it with undefined", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  delete globalThis.window;
  globalThis.window = { localStorage: {} };
  restoreTestGlobal("window", undefined, globalThis.window);
  expect(Object.hasOwn(globalThis, "window")).toBe(false);
  if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
});

test("restoreTestGlobal leaves a global that another file replaced", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
  const installed = { owned: true };
  const replacement = { owned: false };
  globalThis.document = installed;
  globalThis.document = replacement;
  restoreTestGlobal("document", undefined, installed);
  expect(globalThis.document).toBe(replacement);
  if (descriptor) Object.defineProperty(globalThis, "document", descriptor);
  else delete globalThis.document;
});
