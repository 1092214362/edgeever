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
  branding?: boolean;
  fallbackTitle: string;
  format: NoteImageFormat;
  background?: NoteImageBackground;
  styles: string;
};

export type PreparedNoteImage = {
  blob: Blob;
  filename: string;
  height: number;
  images: HtmlImageEmbedResult;
  mimeType: "image/jpeg" | "image/png";
  width: number;
};

export const NOTE_IMAGE_EXPORT_WIDTH = 768;
export const NOTE_IMAGE_EXPORT_PIXEL_RATIO = 1.5;

const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const NOTE_IMAGE_BACKGROUND_COLORS: Record<NoteImageBackground, string> = {
  mint: "#ecfdf5",
  slate: "#f8fafc",
  warm: "#fffbeb",
};
const NOTE_IMAGE_SHARE_STYLES = `
  .edgeever-image-share { padding: 40px 28px 32px; }
  .edgeever-image-share .edgeever-html-document { border-radius: 16px; padding: 40px 36px 32px; }
  .edgeever-image-share .edgeever-html-title { margin-bottom: 14px; font-size: 36px; letter-spacing: -0.02em; line-height: 1.24; }
  .edgeever-image-share .edgeever-html-meta { margin-bottom: 28px; padding-bottom: 18px; }
  .edgeever-image-share .edgeever-html-content { font-size: 17px; line-height: 1.82; }
  .edgeever-image-share .edgeever-image-brand { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 20px; color: #64748b; font-size: 13px; font-weight: 650; letter-spacing: 0.01em; }
  .edgeever-image-share .edgeever-image-brand-mark { width: 9px; height: 9px; border-radius: 3px; background: #16a06e; }
  .edgeever-image-share .edgeever-image-brand-name { color: #07130b; font-weight: 760; }
`;

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
  return { blob: await canvasToImageBlob(canvas, format), height: canvas.height, width: canvas.width };
};

export const createNoteImage = async ({
  bodyHtml,
  branding = false,
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
  style.textContent = `${styles}\n${NOTE_IMAGE_SHARE_STYLES}`;
  host.appendChild(style);
  host.insertAdjacentHTML("beforeend", buildNoteHtmlContentMarkup({
    title,
    notebook,
    tags,
    updatedAt,
    bodyHtml: prepared.bodyHtml,
  }));
  const source = host.lastElementChild as HTMLElement;
  source.classList.add("edgeever-image-share");
  if (branding) {
    const footer = document.createElement("footer");
    footer.className = "edgeever-image-brand";
    footer.innerHTML = '<span class="edgeever-image-brand-mark"></span><span>Made with <span class="edgeever-image-brand-name">EdgeEver</span></span>';
    source.querySelector(".edgeever-html-document")?.appendChild(footer);
  }
  source.style.width = `${NOTE_IMAGE_EXPORT_WIDTH}px`;
  source.style.maxWidth = "none";
  source.style.margin = "0";
  source.style.backgroundColor = NOTE_IMAGE_BACKGROUND_COLORS[background];
  document.body.appendChild(host);

  try {
    const image = await renderImage(source, format, NOTE_IMAGE_BACKGROUND_COLORS[background]);
    const basename = buildImageExportBasename(title, fallbackTitle);
    const extension = format === "jpeg" ? "jpg" : "png";
    const filename = `${basename}.${extension}`;
    return {
      blob: image.blob,
      filename,
      height: image.height,
      images: prepared.images,
      mimeType: format === "jpeg" ? "image/jpeg" : "image/png",
      width: image.width,
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
