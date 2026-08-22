import { expect, test, type APIRequestContext, type Download, type Page } from "@playwright/test";
import sharp from "sharp";

const E2E_USERNAME = process.env.EDGE_EVER_E2E_USERNAME || "admin";
const E2E_PASSWORD = process.env.EDGE_EVER_E2E_PASSWORD || "admin123";

const login = async (request: APIRequestContext) => {
  const response = await request.post("/api/v1/auth/login", {
    data: { username: E2E_USERNAME, password: E2E_PASSWORD },
  });
  expect(response.ok(), `login failed: ${response.status()} ${await response.text()}`).toBe(true);
};

const downloadImage = async (page: Page, format: "JPEG" | "PNG") => {
  await page.getByRole("button", { name: /笔记更多操作|More note actions/ }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: new RegExp(`导出 ${format}|Export ${format}`, "i") }).click();
  return downloadPromise;
};

const inspectDownload = async (download: Download) => {
  const path = await download.path();
  expect(path).not.toBeNull();
  const image = sharp(path!);
  const metadata = await image.metadata();
  const statistics = await image.stats();
  return { metadata, statistics };
};

test("exports a long note as one non-blank PNG and JPEG", async ({ page, request }) => {
  test.setTimeout(90_000);
  await login(request);
  const notebooksResponse = await request.get("/api/v1/notebooks");
  expect(notebooksResponse.ok()).toBe(true);
  const notebooks = (await notebooksResponse.json() as { notebooks: Array<{ id: string; name: string }> }).notebooks;
  const notebook = notebooks[0];
  expect(notebook).toBeTruthy();

  const title = `e2e-image-export-${Date.now()}`;
  const contentMarkdown = Array.from(
    { length: 80 },
    (_, index) => `## Section ${index + 1}\n\nVisible export content ${index + 1}: EdgeEver image regression test.`,
  ).join("\n\n");
  const createResponse = await request.post("/api/v1/memos", {
    data: { notebookId: notebook.id, title, contentMarkdown },
  });
  expect(createResponse.status(), await createResponse.text()).toBe(201);
  const memoId = (await createResponse.json() as { memo: { id: string } }).memo.id;

  try {
    await page.goto("/");
    await page.getByRole("button", { name: new RegExp(notebook.name) }).click();
    await page.locator(`[data-memo-id="${memoId}"]`).locator("button").first().click();
    await expect(page.locator(".ProseMirror")).toContainText("Visible export content 80");

    for (const format of ["PNG", "JPEG"] as const) {
      const download = await downloadImage(page, format);
      expect(download.suggestedFilename()).toMatch(format === "PNG" ? /\.png$/i : /\.jpg$/i);
      expect(download.suggestedFilename()).not.toMatch(/\.zip$/i);

      const { metadata, statistics } = await inspectDownload(download);
      expect(metadata.format).toBe(format === "PNG" ? "png" : "jpeg");
      expect(metadata.width).toBeGreaterThan(700);
      expect(metadata.height).toBeGreaterThan(4_800);
      expect(statistics.channels.some((channel) => channel.stdev > 5)).toBe(true);
    }
  } finally {
    await request.delete(`/api/v1/memos/${memoId}`);
    await request.delete(`/api/v1/memos/${memoId}?permanent=1`);
  }
});
