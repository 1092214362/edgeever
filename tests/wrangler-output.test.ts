import { describe, expect, test } from "bun:test";
import { writeWranglerNotice } from "../scripts/wrangler-output.mjs";

describe("Wrangler wrapper output", () => {
  test("keeps diagnostics on stderr so stdout remains machine-readable", () => {
    let output = "";
    const stderr = {
      write: (chunk: string) => {
        output += chunk;
        return true;
      },
    };

    expect(writeWranglerNotice("info", "resolving D1 database", stderr)).toBe(true);
    expect(output).toBe("[info] resolving D1 database\n");
  });
});
