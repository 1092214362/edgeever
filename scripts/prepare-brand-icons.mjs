import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { prepareDesktopIcons } from "./prepare-desktop-icons.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(projectRoot, "assets/brand/edgeever-icon.svg");
const adaptiveForegroundSourcePath = path.join(projectRoot, "apps/mobile/assets/adaptive-icon-foreground.svg");
const adaptiveTransparentSourcePath = path.join(projectRoot, "apps/mobile/assets/adaptive-icon-transparent.svg");
const source = await readFile(sourcePath);
const adaptiveForegroundSource = await readFile(adaptiveForegroundSourcePath);
const adaptiveTransparentSource = await readFile(adaptiveTransparentSourcePath);

await copyFile(sourcePath, path.join(projectRoot, "apps/web/public/favicon.svg"));
await copyFile(sourcePath, path.join(projectRoot, "apps/site/public/favicon.svg"));

const pngTargets = [
  ["apps/web/public/pwa-192x192.png", 192],
  ["apps/web/public/pwa-512x512.png", 512],
  ["apps/web/public/maskable-icon-512x512.png", 512],
  ["apps/web/public/apple-touch-icon.png", 180],
  ["apps/site/public/icon-192.png", 192],
  ["apps/site/public/icon-512.png", 512],
  ["apps/site/public/apple-touch-icon.png", 180],
  ["apps/mobile/assets/icon.png", 512],
  ["apps/ios/EdgeEver/Resources/Assets.xcassets/AppIcon.appiconset/icon.png", 1024],
  ["apps/extension/public/icons/icon-16.png", 16],
  ["apps/extension/public/icons/icon-32.png", 32],
  ["apps/extension/public/icons/icon-48.png", 48],
  ["apps/extension/public/icons/icon-128.png", 128],
];

const renderPng = async (input, destination, size, { preserveAlpha = false } = {}) => {
  const outputPath = path.join(projectRoot, destination);
  await mkdir(path.dirname(outputPath), { recursive: true });
  const pipeline = sharp(input, { density: 384 }).resize(size, size, {
    fit: "contain",
    kernel: sharp.kernel.lanczos3,
  });
  if (!preserveAlpha) {
    pipeline.flatten({ background: "#d8f3ec" }).removeAlpha();
  }
  await pipeline.png({ compressionLevel: 9 }).toFile(outputPath);
};

for (const [destination, size] of pngTargets) {
  await renderPng(source, destination, size);
}

await renderPng(adaptiveForegroundSource, "apps/mobile/assets/adaptive-icon-foreground.png", 1024, {
  preserveAlpha: true,
});
await renderPng(adaptiveTransparentSource, "apps/mobile/assets/adaptive-icon-transparent.png", 1024, {
  preserveAlpha: true,
});

const faviconPng = await sharp(source, { density: 384 }).resize(32, 32).png().toBuffer();
const icoHeader = Buffer.alloc(22);
icoHeader.writeUInt16LE(0, 0);
icoHeader.writeUInt16LE(1, 2);
icoHeader.writeUInt16LE(1, 4);
icoHeader.writeUInt8(32, 6);
icoHeader.writeUInt8(32, 7);
icoHeader.writeUInt16LE(1, 10);
icoHeader.writeUInt16LE(32, 12);
icoHeader.writeUInt32LE(faviconPng.length, 14);
icoHeader.writeUInt32LE(22, 18);
await writeFile(path.join(projectRoot, "apps/site/public/favicon.ico"), Buffer.concat([icoHeader, faviconPng]));

await prepareDesktopIcons();
console.log("[prepare-brand-icons] updated shared brand icons");
