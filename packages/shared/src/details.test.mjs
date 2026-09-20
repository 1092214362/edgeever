import { describe, expect, test } from "bun:test";
import { flattenDetailsForLinearHtml, wrapDetailsContentHtml } from "./details.ts";

describe("details HTML helpers", () => {
  test("wraps GitHub details bodies for the TipTap schema", () => {
    if (typeof DOMParser === "undefined") return;

    const wrapped = wrapDetailsContentHtml(
      `<details><summary>图</summary><img src="https://example.com/a.png" alt="pic"></details>`,
    );
    expect(wrapped).toContain('data-type="detailsContent"');
    expect(wrapped).toContain("<summary>图</summary>");
    expect(wrapped).toContain('src="https://example.com/a.png"');
  });

  test("unwraps details to a visible title for linear HTML sinks", () => {
    if (typeof DOMParser === "undefined") return;

    const root = new DOMParser().parseFromString(
      `<details><summary>提示</summary><div data-type="detailsContent"><p>hidden</p></div></details>`,
      "text/html",
    ).body;
    flattenDetailsForLinearHtml(root);
    expect(root.querySelector("details")).toBeNull();
    expect(root.textContent).toContain("提示");
    expect(root.textContent).toContain("hidden");
  });
});
