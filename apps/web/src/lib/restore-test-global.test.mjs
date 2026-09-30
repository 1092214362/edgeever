import { expect, test } from "bun:test";
import { restoreTestGlobal } from "./restore-test-global.mjs";

test("restoreTestGlobal keeps a window object when nothing was there before", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  delete globalThis.window;
  const stub = { localStorage: {} };
  globalThis.window = stub;
  restoreTestGlobal("window", undefined, stub);
  expect(globalThis.window).toBe(stub);
  if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
  else delete globalThis.window;
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
