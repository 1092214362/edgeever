import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const entryPath = resolve(process.argv[2] || "apps/web/dist/index.html");
if (!existsSync(entryPath)) {
  throw new Error("Desktop renderer is missing. Run EDGE_EVER_DESKTOP_BUILD=1 bun run build:web first.");
}

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: [
    "--allow-file-access-from-files",
    // Electron permits the packaged renderer to normalize index.html to the
    // file:// root. Match that behavior so this check exercises module
    // evaluation rather than failing inside Chromium's stricter file history.
    "--disable-web-security",
  ],
});

try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto(pathToFileURL(entryPath).href, { waitUntil: "load" });
  try {
    await page.locator("#root > *").first().waitFor({ state: "attached", timeout: 10_000 });
  } catch (error) {
    if (pageErrors.length === 0) throw error;
  }

  if (pageErrors.length > 0) {
    throw new Error(`Desktop renderer raised startup errors:\n${pageErrors.join("\n")}`);
  }

  console.log("Desktop renderer mounted successfully from its file:// production build.");
} finally {
  await browser.close();
}
