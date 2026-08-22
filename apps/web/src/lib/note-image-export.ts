import { toCanvas } from "html-to-image";
import type { HtmlImageEmbedResult, NoteHtmlExportMeta } from "@/lib/note-html-export";
import {
  buildNoteHtmlContentMarkup,
  prepareNoteBodyHtmlForExport,
} from "@/lib/note-html-export";

export type NoteImageFormat = "jpeg" | "png";

export type DownloadNoteImageOptions = NoteHtmlExportMeta & {
  bodyHtml: string;
  fallbackTitle: string;
  format: NoteImageFormat;
  styles: string;
};

export type DownloadNoteImageResult = {
  filename: string;
  images: HtmlImageEmbedResult;
};

export const NOTE_IMAGE_EXPORT_WIDTH = 768;
export const NOTE_IMAGE_EXPORT_PIXEL_RATIO = 1.5;

const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

export const buildImageExportBasename = (title: string, fallback: string) => {
  const sanitized = title
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 100);
  const basename = sanitized || fallback;
  return WINDOWS_RESERVED_NAME.test(basename) ? `_${basename}` : basename;
};

const canvasToImageBlob = (canvas: HTMLCanvasElement, format: NoteImageFormat) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("Image renderer returned an empty file")),
      format === "jpeg" ? "image/jpeg" : "image/png",
      format === "jpeg" ? 0.9 : 1,
    );
  });

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

const waitForImages = async (root: HTMLElement) => {
  await Promise.all(Array.from(root.querySelectorAll("img")).map(async (image) => {
    if (image.complete) return;
    try {
      await image.decode();
    } catch {
      // The HTML preparation stage reports resources that could not be embedded.
    }
  }));
};

const renderImage = async (source: HTMLElement, format: NoteImageFormat) => {
  await document.fonts?.ready;
  await waitForImages(source);
  const totalHeight = Math.max(1, Math.ceil(source.getBoundingClientRect().height));
  const canvas = await toCanvas(source, {
    backgroundColor: "#f8fafc",
    cacheBust: false,
    height: totalHeight,
    pixelRatio: NOTE_IMAGE_EXPORT_PIXEL_RATIO,
    skipFonts: true,
    width: NOTE_IMAGE_EXPORT_WIDTH,
  });
  return canvasToImageBlob(canvas, format);
};

export const downloadNoteImage = async ({
  bodyHtml,
  title,
  notebook,
  tags,
  updatedAt,
  fallbackTitle,
  format,
  styles,
}: DownloadNoteImageOptions): Promise<DownloadNoteImageResult> => {
  const prepared = await prepareNoteBodyHtmlForExport(bodyHtml);
  const host = document.createElement("div");
  host.style.cssText = [
    "position:fixed",
    "left:-100000px",
    "top:0",
    `width:${NOTE_IMAGE_EXPORT_WIDTH}px`,
    "pointer-events:none",
  ].join(";");
  const style = document.createElement("style");
  style.textContent = styles;
  host.appendChild(style);
  host.insertAdjacentHTML("beforeend", buildNoteHtmlContentMarkup({
    title,
    notebook,
    tags,
    updatedAt,
    bodyHtml: prepared.bodyHtml,
  }));
  const source = host.lastElementChild as HTMLElement;
  source.style.width = `${NOTE_IMAGE_EXPORT_WIDTH}px`;
  source.style.maxWidth = "none";
  source.style.margin = "0";
  document.body.appendChild(host);

  try {
    const image = await renderImage(source, format);
    const basename = buildImageExportBasename(title, fallbackTitle);
    const extension = format === "jpeg" ? "jpg" : "png";
    const filename = `${basename}.${extension}`;
    downloadBlob(image, filename);

    return { filename, images: prepared.images };
  } finally {
    host.remove();
  }
};
