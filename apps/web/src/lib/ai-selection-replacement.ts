import {
  docToMarkdown,
  markdownToDoc,
  type TiptapNode,
  type TiptapTextNode,
} from "@edgeever/shared";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Selection } from "@tiptap/pm/state";

type TiptapInlineContent = NonNullable<TiptapNode["content"]>;

const INLINE_SENTINEL = "edgeever-inline-sentinel";

const isTextNode = (node: TiptapNode | TiptapTextNode): node is TiptapTextNode =>
  node.type === "text" && "text" in node;

export type RichTextAiSelectionContext = {
  from: number;
  to: number;
  contentMarkdown: string;
  isInline: boolean;
};

/** AI output may be streamed with formatting whitespace around the response. */
export const normalizeAiSelectionReplacement = (draft: string): string => draft.trim();

/**
 * Resolve the text that should be sent to AI and the range that should later
 * be replaced. Selecting a whole list item can include its ordered/bullet-list
 * wrappers even though it contains only one editable paragraph. In that case,
 * keep the wrappers in the document and narrow the operation to that textblock.
 */
export const getRichTextAiSelectionContext = (
  doc: ProseMirrorNode,
  selection: Selection,
): RichTextAiSelectionContext | null => {
  if (selection.empty) return null;

  const selectedTextblocks: Array<{
    node: ProseMirrorNode;
    contentFrom: number;
    contentTo: number;
    from: number;
    to: number;
  }> = [];

  doc.nodesBetween(selection.from, selection.to, (node, pos) => {
    if (!node.isTextblock) return true;

    const contentFrom = pos + 1;
    const contentTo = contentFrom + node.content.size;
    const from = Math.max(selection.from, contentFrom);
    const to = Math.min(selection.to, contentTo);
    if (to > from) selectedTextblocks.push({ node, contentFrom, contentTo, from, to });
    return false;
  });

  if (selectedTextblocks.length === 1) {
    const block = selectedTextblocks[0];
    const selectedBlock = block.node.cut(
      block.from - block.contentFrom,
      block.to - block.contentFrom,
    ).toJSON() as TiptapNode;
    const contentMarkdown = (
      docToMarkdown({
        type: "doc",
        content: [{ type: "paragraph", content: selectedBlock.content }],
      }) || doc.textBetween(block.from, block.to, "\n")
    ).trim();

    return contentMarkdown
      ? { from: block.from, to: block.to, contentMarkdown, isInline: true }
      : null;
  }

  const selectedContent = selection.content().content.toJSON() as TiptapNode[];
  const contentMarkdown = (
    docToMarkdown({ type: "doc", content: selectedContent }) ||
    doc.textBetween(selection.from, selection.to, "\n")
  ).trim();

  return contentMarkdown
    ? {
        from: selection.from,
        to: selection.to,
        contentMarkdown,
        isInline: false,
      }
    : null;
};

/**
 * Parse an AI draft for a rich-text selection.
 *
 * A Markdown parser treats list-like text such as `1. - review` as a block.
 * Inserting that block into a selection inside a paragraph splits the paragraph
 * and creates an unwanted line break. Prefixing inline selections with an
 * internal sentinel keeps single-block output in an inline parsing context;
 * the sentinel is removed before insertion. Genuine multi-block output still
 * falls back to normal block Markdown parsing.
 */
export const getRichTextAiSelectionReplacement = (
  draft: string,
  selectionIsInline: boolean,
): TiptapInlineContent => {
  const blockContent = markdownToDoc(draft).content;
  if (!selectionIsInline) return blockContent;

  const inlineDoc = markdownToDoc(`${INLINE_SENTINEL}${draft}`);
  if (inlineDoc.content.length !== 1 || inlineDoc.content[0]?.type !== "paragraph") {
    return blockContent;
  }

  const inlineContent = inlineDoc.content[0].content ?? [];
  const firstNode = inlineContent[0];
  if (!firstNode || !isTextNode(firstNode) || !firstNode.text.startsWith(INLINE_SENTINEL)) {
    return blockContent;
  }

  const firstText = firstNode.text.slice(INLINE_SENTINEL.length);
  return [
    ...(firstText ? [{ ...firstNode, text: firstText }] : []),
    ...inlineContent.slice(1),
  ];
};
