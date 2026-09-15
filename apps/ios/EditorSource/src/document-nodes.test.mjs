import { describe, expect, test } from "bun:test";
import { getSchema } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import { Markdown, MarkdownManager } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import {
  docToMarkdown,
  IMAGE_GALLERY_NODE_TYPE,
  markdownToDoc,
  MERGE_DIVIDER_MARKDOWN_MARKER,
  MERGE_DIVIDER_NODE_TYPE,
  MergeDivider as SharedMergeDivider,
} from "@edgeever/shared";
import { createIosImageGallery, ImageGallery, MergeDivider } from "./document-nodes.ts";

const galleryDoc = {
  type: "doc",
  content: [{
    type: IMAGE_GALLERY_NODE_TYPE,
    attrs: { layout: "2" },
    content: [
      { type: "image", attrs: { src: "/one.png", alt: "one" } },
      { type: "image", attrs: { src: "/two.png", alt: "two" } },
    ],
  }],
};

const iosMarkdownManager = new MarkdownManager({
  extensions: [
    StarterKit.configure({ codeBlock: false, link: false }),
    Image,
    MergeDivider,
    createIosImageGallery(() => "en-US"),
    Markdown.configure({
      markedOptions: { gfm: true },
    }),
  ],
});

describe("iOS document nodes share the web schema", () => {
  test("uses the shared MergeDivider implementation", () => {
    expect(MergeDivider).toBe(SharedMergeDivider);
  });

  test("native ImageGallery.extend keeps the shared node name and gallery layout", () => {
    const iosGallery = createIosImageGallery(() => "zh-CN");
    expect(iosGallery.name).toBe(IMAGE_GALLERY_NODE_TYPE);

    const sharedSchema = getSchema([StarterKit, Image, MergeDivider, ImageGallery]);
    const iosSchema = getSchema([StarterKit, Image, MergeDivider, iosGallery]);
    expect(iosSchema.nodeFromJSON(galleryDoc).toJSON()).toEqual(sharedSchema.nodeFromJSON(galleryDoc).toJSON());
    expect(iosSchema.nodeFromJSON(galleryDoc).firstChild.attrs.layout).toBe("2");
  });

  test("parses merge-divider Markdown the same as the web codec", () => {
    const markdown = `alpha\n\n${MERGE_DIVIDER_MARKDOWN_MARKER}\n\n---\n\nbeta`;
    const webDoc = markdownToDoc(markdown);
    const iosDoc = iosMarkdownManager.parse(markdown);

    expect(webDoc.content.map((node) => node.type)).toEqual([
      "paragraph",
      MERGE_DIVIDER_NODE_TYPE,
      "paragraph",
    ]);
    expect(iosDoc.content.map((node) => node.type)).toEqual(webDoc.content.map((node) => node.type));
    expect(docToMarkdown(iosDoc)).toBe(docToMarkdown(webDoc));
  });

  test("round-trips gallery JSON layout and matches the web Markdown projection", () => {
    const iosDoc = iosMarkdownManager.parse(iosMarkdownManager.serialize(galleryDoc));
    const persisted = getSchema([StarterKit, Image, MergeDivider, createIosImageGallery(() => "en-US")])
      .nodeFromJSON(galleryDoc)
      .toJSON();

    expect(docToMarkdown(galleryDoc)).toBe("![one](/one.png)\n\n![two](/two.png)");
    expect(iosMarkdownManager.serialize(galleryDoc).trim()).toBe(docToMarkdown(galleryDoc));
    expect(iosDoc.content.every((node) => node.type === "image" || node.type === "paragraph")).toBe(true);
    expect(persisted.content[0]).toMatchObject({
      type: IMAGE_GALLERY_NODE_TYPE,
      attrs: { layout: "2" },
    });
    expect(persisted.content[0].content.map((node) => node.attrs.src)).toEqual(["/one.png", "/two.png"]);
  });
});
