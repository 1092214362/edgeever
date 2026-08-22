import { describe, expect, test } from "bun:test";
import {
  buildImageExportBasename,
} from "./note-image-export.ts";

describe("note image export helpers", () => {
  test("sanitizes portable filenames and protects Windows device names", () => {
    expect(buildImageExportBasename(" Roadmap: Q3/Q4. ", "Untitled")).toBe("Roadmap- Q3-Q4");
    expect(buildImageExportBasename("CON", "Untitled")).toBe("_CON");
    expect(buildImageExportBasename("   ", "Untitled")).toBe("Untitled");
  });
});
