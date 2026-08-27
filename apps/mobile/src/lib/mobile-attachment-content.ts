import {
  FILE_ATTACHMENT_NODE_TYPE,
  PDF_ATTACHMENT_NODE_TYPE,
  type TiptapDoc,
  type TiptapNode,
  type TiptapTextNode,
} from "@edgeever/shared";

const ATTACHMENT_NODE_TYPES = new Set<string>([
  FILE_ATTACHMENT_NODE_TYPE,
  PDF_ATTACHMENT_NODE_TYPE,
]);

const getStringAttr = (node: TiptapNode, key: string) => {
  const value = node.attrs?.[key];
  return typeof value === "string" ? value : "";
};

const toLegacyAttachmentLink = (node: TiptapNode): TiptapTextNode => {
  const url = getStringAttr(node, "url");
  const label = getStringAttr(node, "label") || getStringAttr(node, "filename") || "Attachment";

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
              class: "edgeever-attachment-link",
            },
          }],
        }
      : {}),
  };
};

/**
 * The native WebView editor intentionally keeps the stable link-based attachment
 * schema used by its resource action bridge. Convert richer cross-client nodes at
 * the boundary so Tiptap never rejects an otherwise valid note as unknown content.
 */
export const resolveMobileAttachmentContent = (doc: TiptapDoc): TiptapDoc => {
  const visit = (node: TiptapNode | TiptapTextNode): TiptapNode | TiptapTextNode => {
    if (ATTACHMENT_NODE_TYPES.has(node.type)) {
      return toLegacyAttachmentLink(node as TiptapNode);
    }

    if ("content" in node && node.content) {
      return { ...node, content: node.content.map(visit) };
    }

    return node;
  };

  return {
    ...doc,
    content: doc.content.map((node) => visit(node) as TiptapNode),
  };
};
