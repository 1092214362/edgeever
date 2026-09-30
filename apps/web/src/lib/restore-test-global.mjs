const restoreUnconditionally = Symbol("restore-unconditionally");

export const restoreTestGlobal = (key, original, installed = restoreUnconditionally) => {
  if (installed !== restoreUnconditionally && globalThis[key] !== installed) return;
  if (original !== undefined) {
    globalThis[key] = original;
    return;
  }
  // Linux Bun provides document without a window binding. Assigning
  // undefined shadows it, and deleting it makes ProseMirror throw
  // `window is not defined` while reading MutationObserver. Keep the
  // stub object when there was no previous window.
  if (key === "window") return;
  delete globalThis[key];
};
