import { describe, expect, test } from "bun:test";
import { resolveMobileAttachmentContent } from "./mobile-attachment-content";

describe("resolveMobileAttachmentContent", () => {
  test("converts PDF and file attachment nodes into mobile-safe links", () => {
    expect(resolveMobileAttachmentContent({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{
            type: "edgeeverPdfAttachment",
            attrs: {
              url: "/api/v1/resources/res_pdf/blob",
              label: "附件：报告.pdf",
              displayMode: "compact",
            },
          }],
        },
        {
          type: "paragraph",
          content: [{
            type: "edgeeverFileAttachment",
            attrs: {
              url: "/api/v1/resources/res_doc/blob",
              label: "附件：说明.docx",
              filename: "说明.docx",
              mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            },
          }],
        },
      ],
    })).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{
            type: "text",
            text: "附件：报告.pdf",
            marks: [{
              type: "link",
              attrs: {
                href: "/api/v1/resources/res_pdf/blob",
                target: "_blank",
                class: "edgeever-attachment-link",
              },
            }],
          }],
        },
        {
          type: "paragraph",
          content: [{
            type: "text",
            text: "附件：说明.docx",
            marks: [{
              type: "link",
              attrs: {
                href: "/api/v1/resources/res_doc/blob",
                target: "_blank",
                class: "edgeever-attachment-link",
              },
            }],
          }],
        },
      ],
    });
  });

  test("preserves surrounding rich content and falls back for incomplete nodes", () => {
    const originalParagraph = {
      type: "paragraph",
      content: [{ type: "text", text: "正文", marks: [{ type: "bold" }] }],
    };
    const result = resolveMobileAttachmentContent({
      type: "doc",
      content: [
        originalParagraph,
        {
          type: "paragraph",
          content: [{
            type: "edgeeverFileAttachment",
            attrs: { filename: "fallback.zip" },
          }],
        },
      ],
    });

    expect(result.content[0]).toEqual(originalParagraph);
    expect(result.content[1]).toEqual({
      type: "paragraph",
      content: [{ type: "text", text: "fallback.zip" }],
    });
  });
});
