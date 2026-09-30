const restoreUnconditionally = Symbol("restore-unconditionally");
const noop = () => {};

// Linux Bun exposes `document` without a `window` binding. Test files then
// install plain objects. ProseMirror and TipTap read `window.MutationObserver`
// and `window.addEventListener` from that object, so a leftover stub needs
// those methods. Do not create a window when none is installed: assigning one
// is unnecessary on hosts whose editor already resolves `window` elsewhere.
export const ensureTestWindowDom = () => {
  const current = globalThis.window;
  if (!current || typeof current !== "object") return;
  if (typeof current.addEventListener !== "function") current.addEventListener = noop;
  if (typeof current.removeEventListener !== "function") current.removeEventListener = noop;
  if (typeof current.getComputedStyle !== "function") current.getComputedStyle = () => ({ listStyle: "" });
  if (typeof current.setTimeout !== "function") current.setTimeout = globalThis.setTimeout.bind(globalThis);
  if (typeof current.clearTimeout !== "function") current.clearTimeout = globalThis.clearTimeout.bind(globalThis);
};

export const restoreTestGlobal = (key, original, installed = restoreUnconditionally) => {
  if (installed !== restoreUnconditionally && globalThis[key] !== installed) return;
  if (original !== undefined) {
    globalThis[key] = original;
    return;
  }
  // Assigning undefined shadows the host binding, and deleting window makes
  // ProseMirror throw `window is not defined`. Keep the stub and make it
  // safe for a later editor test.
  if (key === "window") {
    ensureTestWindowDom();
    return;
  }
  delete globalThis[key];
};
