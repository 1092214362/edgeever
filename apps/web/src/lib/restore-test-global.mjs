const restoreUnconditionally = Symbol("restore-unconditionally");

export const restoreTestGlobal = (key, original, installed = restoreUnconditionally) => {
  if (installed !== restoreUnconditionally && globalThis[key] !== installed) return;
  if (original === undefined) delete globalThis[key];
  else globalThis[key] = original;
};
