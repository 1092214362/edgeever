import { describe, expect, test } from "bun:test";
import { isMountedInstallerPath } from "./installation-location.mjs";

describe("macOS installation location", () => {
  test("recognizes an app launched from a mounted volume", () => {
    expect(isMountedInstallerPath("/Volumes/EdgeEver/EdgeEver.app/Contents/Resources/app.asar", "darwin")).toBe(true);
  });

  test("does not reject the installed Applications copy", () => {
    expect(isMountedInstallerPath("/Applications/EdgeEver.app/Contents/Resources/app.asar", "darwin")).toBe(false);
  });

  test("does not apply the macOS rule on other platforms", () => {
    expect(isMountedInstallerPath("/Volumes/EdgeEver/EdgeEver.app/Contents/Resources/app.asar", "win32")).toBe(false);
  });
});
