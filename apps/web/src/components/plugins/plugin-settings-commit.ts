import type { PluginSettingValue } from "@edgeever/plugin-api";

export const pluginSettingLoadSignature = (fields: readonly { key: string; type: string; default?: unknown }[]) =>
  fields.map((field) => `${field.key}\0${field.type}\0${JSON.stringify(field.default ?? null)}`).join("\n");

export const revertBooleanSettingAfterFailedWrite = (
  current: PluginSettingValue | "",
  attempted: boolean,
): PluginSettingValue | "" => (current === attempted ? !attempted : current);

export const createPluginSettingWriteQueue = () => {
  const tails = new Map<string, Promise<void>>();

  return {
    enqueue(key: string, write: () => Promise<void>): Promise<void> {
      const previous = tails.get(key);
      let run: Promise<void>;
      if (previous) {
        run = previous.then(write, write);
      } else {
        try {
          run = Promise.resolve(write());
        } catch (error) {
          run = Promise.reject(error);
        }
      }
      const tail = run.then(() => undefined, () => undefined);
      tails.set(key, tail);
      void tail.finally(() => {
        if (tails.get(key) === tail) tails.delete(key);
      });
      return run;
    },
  };
};
