import { toCanvas } from "html-to-image";
import type { HtmlImageEmbedResult, NoteHtmlExportMeta } from "@/lib/note-html-export";
import {
  buildNoteHtmlContentMarkup,
  prepareNoteBodyHtmlForExport,
} from "@/lib/note-html-export";

export type NoteImageFormat = "jpeg" | "png";
export type NoteImageBackground = "mint" | "slate" | "warm";

export type DownloadNoteImageOptions = NoteHtmlExportMeta & {
  bodyHtml: string;
  fallbackTitle: string;
  format: NoteImageFormat;
  background?: NoteImageBackground;
  styles: string;
};

export type PreparedNoteImage = {
  blob: Blob;
  filename: string;
  images: HtmlImageEmbedResult;
  mimeType: "image/jpeg" | "image/png";
};

export const NOTE_IMAGE_EXPORT_WIDTH = 768;
export const NOTE_IMAGE_EXPORT_PIXEL_RATIO = 1.5;

const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const NOTE_IMAGE_BACKGROUND_COLORS: Record<NoteImageBackground, string> = {
  mint: "#ecfdf5",
  slate: "#f8fafc",
  warm: "#fffbeb",
};

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

export const downloadPreparedNoteImage = ({ blob, filename }: Pick<PreparedNoteImage, "blob" | "filename">) => {
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

const renderImage = async (source: HTMLElement, format: NoteImageFormat, backgroundColor: string) => {
  await document.fonts?.ready;
  await waitForImages(source);
  const totalHeight = Math.max(1, Math.ceil(source.getBoundingClientRect().height));
  const canvas = await toCanvas(source, {
    backgroundColor,
    cacheBust: false,
    height: totalHeight,
    pixelRatio: NOTE_IMAGE_EXPORT_PIXEL_RATIO,
    skipFonts: true,
    width: NOTE_IMAGE_EXPORT_WIDTH,
  });
  return canvasToImageBlob(canvas, format);
};

export const createNoteImage = async ({
  bodyHtml,
  title,
  notebook,
  tags,
  updatedAt,
  fallbackTitle,
  format,
  background = "slate",
  styles,
}: DownloadNoteImageOptions): Promise<PreparedNoteImage> => {
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
  source.style.backgroundColor = NOTE_IMAGE_BACKGROUND_COLORS[background];
  document.body.appendChild(host);

  try {
    const blob = await renderImage(source, format, NOTE_IMAGE_BACKGROUND_COLORS[background]);
    const basename = buildImageExportBasename(title, fallbackTitle);
    const extension = format === "jpeg" ? "jpg" : "png";
    const filename = `${basename}.${extension}`;
    return {
      blob,
      filename,
      images: prepared.images,
      mimeType: format === "jpeg" ? "image/jpeg" : "image/png",
    };
  } finally {
    host.remove();
  }
};

export const downloadNoteImage = async (options: DownloadNoteImageOptions) => {
  const prepared = await createNoteImage(options);
  downloadPreparedNoteImage(prepared);
  return prepared;
};
