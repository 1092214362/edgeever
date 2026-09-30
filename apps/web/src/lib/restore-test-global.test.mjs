import { expect, test } from "bun:test";
import { ensureTestWindowDom, restoreTestGlobal } from "./restore-test-global.mjs";

test("restoreTestGlobal keeps a window object when nothing was there before", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  delete globalThis.window;
  const stub = { localStorage: {} };
  globalThis.window = stub;
  restoreTestGlobal("window", undefined, stub);
  expect(globalThis.window).toBe(stub);
  expect(typeof globalThis.window.addEventListener).toBe("function");
  expect(typeof globalThis.window.removeEventListener).toBe("function");
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

test("ensureTestWindowDom fills event methods on a leftover window", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const stub = { edgeeverDesktop: { isAvailable: true } };
  globalThis.window = stub;
  ensureTestWindowDom();
  expect(typeof stub.addEventListener).toBe("function");
  expect(typeof stub.getComputedStyle).toBe("function");
  expect(stub.edgeeverDesktop.isAvailable).toBe(true);
  ensureTestWindowDom();
  if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
  else delete globalThis.window;
});
