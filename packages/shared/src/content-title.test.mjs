import { describe, expect, test } from "bun:test";
import { deriveMemoTitleDuringInitialEdit, deriveMemoTitleFromContent, markdownToDoc } from "./content.ts";

describe("deriveMemoTitleFromContent", () => {
  test("uses the first non-empty H1", () => {
    expect(deriveMemoTitleFromContent(markdownToDoc("\n#  Product   plan  \n\nBody"))).toBe("Product plan");
  });

  test("does not use a later H1 when body content comes first", () => {
    expect(deriveMemoTitleFromContent(markdownToDoc("Intro\n\n# Product plan"))).toBeNull();
  });

  test("does not use lower-level headings", () => {
    expect(deriveMemoTitleFromContent(markdownToDoc("## Product plan"))).toBeNull();
  });

  test("does not skip meaningful non-text blocks before the H1", () => {
    expect(deriveMemoTitleFromContent({
      type: "doc",
      content: [
        { type: "image", attrs: { src: "/cover.png" } },
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Product plan" }] },
      ],
    })).toBeNull();
  });

  test("limits generated titles to the persisted title length", () => {
    expect(deriveMemoTitleFromContent(markdownToDoc(`# ${"a".repeat(200)}`))).toHaveLength(160);
  });
});

describe("deriveMemoTitleDuringInitialEdit", () => {
  test("keeps filling the title as the initial H1 is typed", () => {
    const first = deriveMemoTitleDuringInitialEdit("", markdownToDoc("# 浏"), false);
    expect(first).toBe("浏");
    expect(deriveMemoTitleDuringInitialEdit(first, markdownToDoc("# 浏览器真实回归"), true))
      .toBe("浏览器真实回归");
  });

  test("does not replace a manually entered title", () => {
    expect(deriveMemoTitleDuringInitialEdit("我的标题", markdownToDoc("# 正文标题"), false)).toBeNull();
  });
});
