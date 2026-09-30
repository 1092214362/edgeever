import { describe, expect, test } from "bun:test";
import {
  resolveAttachmentKind,
  resolveAudioMimeType,
  resolvePlayableMediaMimeType,
  resolveVideoMimeType,
} from "./attachment-kind.ts";

describe("attachment kind", () => {
  test("uses MIME types for media and filenames for common documents", () => {
    expect(resolveAttachmentKind("audio/mpeg", "recording.bin")).toBe("audio");
    expect(resolveAttachmentKind("application/octet-stream", "recording.FLAC")).toBe("audio");
    expect(resolveAttachmentKind(null, "archive.ape")).toBe("audio");
    expect(resolveAttachmentKind("video/mp4", "clip.bin")).toBe("video");
    expect(resolveAttachmentKind("application/octet-stream", "demo.MP4")).toBe("video");
    expect(resolveAttachmentKind(null, "screen.mov")).toBe("video");
    expect(resolveAttachmentKind(null, "report.PDF")).toBe("pdf");
    expect(resolveAttachmentKind(null, "budget.xlsx")).toBe("spreadsheet");
    expect(resolveAttachmentKind(null, "proposal.docx")).toBe("document");
    expect(resolveAttachmentKind(null, "pitch.pptx")).toBe("presentation");
    expect(resolveAttachmentKind(null, "source.ts")).toBe("code");
    expect(resolveAttachmentKind(null, "backup.7z")).toBe("archive");
  });

  test("normalizes common audio MIME types from filenames", () => {
    expect(resolveAudioMimeType("application/octet-stream", "voice.mp3")).toBe("audio/mpeg");
    expect(resolveAudioMimeType("", "lossless.flac")).toBe("audio/flac");
    expect(resolveAudioMimeType("audio/x-custom", "voice.mp3")).toBe("audio/x-custom");
    expect(resolveAudioMimeType("application/octet-stream", "payload.bin")).toBeNull();
  });

  test("normalizes browser-native video MIME types from filenames", () => {
    expect(resolveVideoMimeType("application/octet-stream", "clip.mp4")).toBe("video/mp4");
    expect(resolveVideoMimeType("", "walkthrough.webm")).toBe("video/webm");
    expect(resolveVideoMimeType("", "screen.MOV")).toBe("video/quicktime");
    expect(resolveVideoMimeType("video/quicktime", "clip.mp4")).toBe("video/quicktime");
    expect(resolveVideoMimeType("application/octet-stream", "payload.bin")).toBeNull();
    expect(resolveVideoMimeType("application/octet-stream", "movie.mkv")).toBeNull();
    expect(resolveAttachmentKind("application/octet-stream", "movie.mkv")).toBe("file");
    expect(resolveAttachmentKind("video/x-matroska", "movie.mkv")).toBe("video");
    expect(resolvePlayableMediaMimeType("application/octet-stream", "demo.mp4")).toBe("video/mp4");
    expect(resolvePlayableMediaMimeType("application/octet-stream", "voice.mp3")).toBe("audio/mpeg");
  });

  test("identifies executables, books, fonts, disk images, and databases", () => {
    expect(resolveAttachmentKind("application/vnd.android.package-archive", "app.apk")).toBe("executable");
    expect(resolveAttachmentKind("application/octet-stream", "EdgeEver-Setup.exe")).toBe("executable");
    expect(resolveAttachmentKind(null, "EdgeEver-arm64.dmg")).toBe("executable");
    expect(resolveAttachmentKind(null, "installer.msi")).toBe("executable");
    expect(resolveAttachmentKind(null, "package.deb")).toBe("executable");
    expect(resolveAttachmentKind(null, "package.rpm")).toBe("executable");
    expect(resolveAttachmentKind(null, "app.AppImage")).toBe("executable");
    expect(resolveAttachmentKind("application/zip", "app.apk")).toBe("executable");

    expect(resolveAttachmentKind("application/epub+zip", "manual.epub")).toBe("book");
    expect(resolveAttachmentKind(null, "novel.mobi")).toBe("book");
    expect(resolveAttachmentKind(null, "guide.azw3")).toBe("book");

    expect(resolveAttachmentKind("font/woff2", "inter.woff2")).toBe("font");
    expect(resolveAttachmentKind(null, "roboto.ttf")).toBe("font");
    expect(resolveAttachmentKind(null, "opensans.otf")).toBe("font");

    expect(resolveAttachmentKind("application/x-iso9660-image", "ubuntu.iso")).toBe("diskimage");
    expect(resolveAttachmentKind(null, "system.img")).toBe("diskimage");

    expect(resolveAttachmentKind(null, "app.sqlite")).toBe("database");
    expect(resolveAttachmentKind(null, "data.db")).toBe("database");

    expect(resolveAttachmentKind(null, "schema.sql")).toBe("code");
    expect(resolveAttachmentKind(null, "Cargo.toml")).toBe("code");
    expect(resolveAttachmentKind(null, "main.rs")).toBe("code");
    expect(resolveAttachmentKind(null, "main.go")).toBe("code");
    expect(resolveAttachmentKind(null, "Main.java")).toBe("code");
    expect(resolveAttachmentKind(null, "script.py")).toBe("code");
  });

  test("falls back predictably for text and unknown files", () => {
    expect(resolveAttachmentKind("text/plain", "README")).toBe("text");
    expect(resolveAttachmentKind("application/octet-stream", "payload.bin")).toBe("file");
  });
});
