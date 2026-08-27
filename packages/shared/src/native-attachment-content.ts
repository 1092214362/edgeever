import { resolveAttachmentKind } from "./attachment-kind";
import { FILE_ATTACHMENT_NODE_TYPE } from "./file-attachment";
import { PDF_ATTACHMENT_NODE_TYPE } from "./pdf-attachment";
import type { TiptapDoc, TiptapMark, TiptapNode, TiptapTextNode } from "./content";

const ATTACHMENT_NODE_TYPES = new Set<string>([
  FILE_ATTACHMENT_NODE_TYPE,
  PDF_ATTACHMENT_NODE_TYPE,
]);

const getStringAttr = (node: TiptapNode, key: string) => {
  const value = node.attrs?.[key];
  return typeof value === "string" ? value : "";
};

const ATTACHMENT_KIND_CLASS_PREFIX = "edgeever-attachment-kind-";

const normalizeAttachmentFilename = (label: string) =>
  label.replace(/^\s*(?:附件[：:]|Attachment:)\s*/i, "").trim();

export const getNativeAttachmentLinkClass = (
  filename: string,
  mimeType?: string | null,
  existingClass?: unknown,
) => {
  const preservedClasses = typeof existingClass === "string"
    ? existingClass.split(/\s+/).filter((className) =>
        className &&
        className !== "edgeever-attachment-link" &&
        !className.startsWith(ATTACHMENT_KIND_CLASS_PREFIX)
      )
    : [];
  const kind = resolveAttachmentKind(mimeType, normalizeAttachmentFilename(filename));
  return [
    ...preservedClasses,
    "edgeever-attachment-link",
    `${ATTACHMENT_KIND_CLASS_PREFIX}${kind}`,
  ].join(" ");
};

export const getMobileAttachmentLinkClass = getNativeAttachmentLinkClass;

const isAttachmentMark = (mark: TiptapMark) => {
  if (mark.type !== "link") return false;
  const href = typeof mark.attrs?.href === "string" ? mark.attrs.href : "";
  const className = typeof mark.attrs?.class === "string" ? mark.attrs.class : "";
  return className.split(/\s+/).includes("edgeever-attachment-link") || href.includes("/api/v1/resources/");
};

const withAttachmentKindClass = (node: TiptapTextNode): TiptapTextNode => {
  if (!node.marks?.some(isAttachmentMark)) return node;
  return {
    ...node,
    marks: node.marks.map((mark) => isAttachmentMark(mark)
      ? {
          ...mark,
          attrs: {
            ...mark.attrs,
            class: getNativeAttachmentLinkClass(node.text, null, mark.attrs?.class),
          },
        }
      : mark),
  };
};

const toLegacyAttachmentLink = (node: TiptapNode): TiptapTextNode => {
  const url = getStringAttr(node, "url");
  const label = getStringAttr(node, "label") || getStringAttr(node, "filename") || "Attachment";
  const mimeType = getStringAttr(node, "mimeType");

  return {
    type: "text",
    text: label,
    ...(url
      ? {
          marks: [{
            type: "link",
            attrs: {
              href: url,
              target: "_blank",
              class: getNativeAttachmentLinkClass(label, mimeType),
            },
          }],
        }
      : {}),
  };
};

/** Converts rich attachment nodes into the stable native resource-link schema. */
export const resolveNativeAttachmentContent = (doc: TiptapDoc): TiptapDoc => {
  const visit = (node: TiptapNode | TiptapTextNode): TiptapNode | TiptapTextNode => {
    if (ATTACHMENT_NODE_TYPES.has(node.type)) {
      return toLegacyAttachmentLink(node as TiptapNode);
    }

    if ("content" in node && node.content) {
      return { ...node, content: node.content.map(visit) };
    }

    if (node.type === "text") {
      return withAttachmentKindClass(node as TiptapTextNode);
    }

    return node;
  };

  return {
    ...doc,
    content: doc.content.map((node) => visit(node) as TiptapNode),
  };
};

export const resolveMobileAttachmentContent = resolveNativeAttachmentContent;
