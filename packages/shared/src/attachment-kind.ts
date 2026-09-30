export const ATTACHMENT_KINDS = [
  "image",
  "audio",
  "video",
  "pdf",
  "spreadsheet",
  "document",
  "presentation",
  "archive",
  "code",
  "text",
  "executable",
  "book",
  "font",
  "diskimage",
  "database",
  "file",
] as const;

export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

const extensionOf = (filename: string | null | undefined) =>
  filename?.trim().toLowerCase().match(/\.([a-z0-9]+)(?:[?#].*)?$/)?.[1] ?? "";

const AUDIO_MIME_TYPES_BY_EXTENSION: Readonly<Record<string, string>> = {
  aac: "audio/aac",
  aiff: "audio/aiff",
  ape: "audio/x-ape",
  flac: "audio/flac",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  oga: "audio/ogg",
  ogg: "audio/ogg",
  opus: "audio/ogg",
  wav: "audio/wav",
  weba: "audio/webm",
  wma: "audio/x-ms-wma",
};

/** Resolve an audio MIME type without overriding a specific type supplied by storage. */
export const resolveAudioMimeType = (
  mimeType: string | null | undefined,
  filename: string | null | undefined,
) => {
  const mime = mimeType?.trim().toLowerCase() ?? "";
  if (mime.startsWith("audio/")) return mime;
  return AUDIO_MIME_TYPES_BY_EXTENSION[extensionOf(filename)] ?? null;
};

const VIDEO_MIME_TYPES_BY_EXTENSION: Readonly<Record<string, string>> = {
  m4v: "video/mp4",
  mov: "video/quicktime",
  mp4: "video/mp4",
  ogv: "video/ogg",
  webm: "video/webm",
};

/** Resolve a video MIME type without overriding a specific type supplied by storage. */
export const resolveVideoMimeType = (
  mimeType: string | null | undefined,
  filename: string | null | undefined,
) => {
  const mime = mimeType?.trim().toLowerCase() ?? "";
  if (mime.startsWith("video/")) return mime;
  return VIDEO_MIME_TYPES_BY_EXTENSION[extensionOf(filename)] ?? null;
};

/** Audio or browser-native video MIME used for inline playback and Content-Type. */
export const resolvePlayableMediaMimeType = (
  mimeType: string | null | undefined,
  filename: string | null | undefined,
) => resolveAudioMimeType(mimeType, filename) ?? resolveVideoMimeType(mimeType, filename);

export const resolveAttachmentKind = (
  mimeType: string | null | undefined,
  filename: string | null | undefined,
): AttachmentKind => {
  const mime = mimeType?.trim().toLowerCase() ?? "";
  const extension = extensionOf(filename);

  if (mime.startsWith("image/")) return "image";
  if (resolveAudioMimeType(mime, filename)) return "audio";
  if (resolveVideoMimeType(mime, filename)) return "video";
  if (mime === "application/pdf" || extension === "pdf") return "pdf";

  if (
    mime.includes("spreadsheet") || mime.includes("excel") ||
    ["xls", "xlsx", "xlsm", "ods", "csv"].includes(extension)
  ) return "spreadsheet";

  if (
    mime.includes("word") || mime.includes("wordprocessingml") ||
    ["doc", "docx", "odt", "rtf"].includes(extension)
  ) return "document";

  if (
    mime.includes("presentation") || mime.includes("powerpoint") ||
    ["ppt", "pptx", "odp", "key"].includes(extension)
  ) return "presentation";

  if (
    mime.includes("android.package-archive") ||
    mime.includes("application/x-msdownload") ||
    mime.includes("application/x-msi") ||
    mime.includes("application/x-apple-diskimage") ||
    mime.includes("application/x-debian-package") ||
    mime.includes("application/x-redhat-package-manager") ||
    mime.includes("application/x-executable") ||
    ["apk", "xapk", "apks", "aab", "ipa", "exe", "msi", "dmg", "pkg", "deb", "rpm", "appimage"].includes(extension)
  ) return "executable";

  if (
    mime.includes("epub") || mime.includes("mobipocket") ||
    ["epub", "mobi", "azw", "azw3", "fb2", "djvu"].includes(extension)
  ) return "book";

  if (
    mime.startsWith("font/") || mime.includes("font") ||
    ["ttf", "otf", "woff", "woff2", "eot"].includes(extension)
  ) return "font";

  if (
    mime.includes("iso9660") ||
    ["iso", "img", "vmdk", "qcow2", "vdi"].includes(extension)
  ) return "diskimage";

  if (
    mime.includes("sqlite") ||
    ["sqlite", "sqlite3", "db", "db3"].includes(extension)
  ) return "database";

  if (
    mime.includes("zip") || mime.includes("compressed") || mime.includes("tar") ||
    mime.includes("rar") || mime.includes("gzip") ||
    ["zip", "rar", "7z", "tar", "gz", "bz2", "xz"].includes(extension)
  ) return "archive";

  if (
    mime.includes("javascript") || mime.includes("typescript") || mime.includes("json") ||
    mime.includes("xml") || mime.includes("yaml") ||
    [
      "js", "jsx", "ts", "tsx", "json", "xml", "yaml", "yml", "html", "css", "scss", "less",
      "sh", "bash", "zsh", "py", "java", "go", "rs", "c", "cpp", "h", "hpp", "cs",
      "swift", "kt", "kts", "rb", "php", "lua", "sql", "toml", "ini", "conf", "env",
    ].includes(extension)
  ) return "code";

  if (mime.startsWith("text/") || ["txt", "md", "log"].includes(extension)) return "text";
  return "file";
};
