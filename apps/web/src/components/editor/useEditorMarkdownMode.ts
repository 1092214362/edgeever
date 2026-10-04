import {
  useCallback,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from "react";
import type { Editor } from "@tiptap/react";
import type { TiptapDoc } from "@edgeever/shared";
import {
  createMarkdownModeSnapshot,
  resolveMarkdownModeContent,
  selectMarkdownSourceForDocument,
  shouldKeepLiveMarkdownSource,
  type MarkdownModeSnapshot,
} from "./editor-mode-content";
import { getEditorScrollProgress, restoreEditorScrollProgress } from "./editor-mode-scroll";
import { markdownOffsetToRichPosition, richPositionToMarkdownOffset } from "./editor-mode-selection";
import type { MarkdownSourceEditorRef } from "./MarkdownSourceEditor";
import { isEditorReady } from "./editor-pane-helpers";

export const useEditorMarkdownMode = ({
  editor,
  editorScrollContainerRef,
  effectiveReadOnly,
  getMemoId,
  hydratingRef,
}: {
  editor: Editor | null;
  editorScrollContainerRef: RefObject<HTMLDivElement | null>;
  effectiveReadOnly: boolean;
  getMemoId: () => string | null | undefined;
  hydratingRef: MutableRefObject<boolean>;
}) => {
  const [isMarkdownMode, setIsMarkdownMode] = useState(false);
  const [markdownSource, setMarkdownSource] = useState("");
  const markdownSourceRef = useRef(markdownSource);
  markdownSourceRef.current = markdownSource;
  const markdownSourceEditorRef = useRef<MarkdownSourceEditorRef | null>(null);
  const markdownModeSnapshotRef = useRef<MarkdownModeSnapshot | null>(null);
  const pendingSourceSelectionRef = useRef<{ memoId: string; from: number; to: number } | null>(null);
  const getMemoIdRef = useRef(getMemoId);
  getMemoIdRef.current = getMemoId;

  const handleMarkdownSourceReady = useCallback(() => {
    const sourceEditor = markdownSourceEditorRef.current;
    if (!sourceEditor) return;
    const pending = pendingSourceSelectionRef.current;
    pendingSourceSelectionRef.current = null;
    if (pending && pending.memoId === getMemoIdRef.current()) {
      sourceEditor.setSelection(pending.from, pending.to);
    }
    sourceEditor.focus();
  }, []);

  const restoreScrollAfterModeChange = useCallback((targetMode: "markdown" | "rich", progress: number) => {
    const restore = (attempt: number) => {
      const target = targetMode === "markdown"
        ? markdownSourceEditorRef.current?.getScrollContainer() ?? null
        : editorScrollContainerRef.current;

      if (restoreEditorScrollProgress(target, progress) || attempt >= 2) {
        return;
      }

      window.requestAnimationFrame(() => restore(attempt + 1));
    };

    window.requestAnimationFrame(() => restore(0));
  }, [editorScrollContainerRef]);

  const applyMarkdownSourceToRichText = useCallback((scrollProgress: number) => {
    if (!isEditorReady(editor)) {
      return;
    }

    const currentMemoId = getMemoId();
    const content = resolveMarkdownModeContent(
      markdownModeSnapshotRef.current,
      currentMemoId,
      markdownSourceRef.current,
    );
    const sourceSelection = markdownSourceEditorRef.current?.getSelection();
    hydratingRef.current = true;
    editor.commands.setContent(content);
    const richFrom = sourceSelection
      ? markdownOffsetToRichPosition(editor.schema, editor.state.doc, markdownSourceRef.current, sourceSelection.from)
      : null;
    const richTo = sourceSelection?.to === sourceSelection?.from
      ? richFrom
      : sourceSelection
        ? markdownOffsetToRichPosition(editor.schema, editor.state.doc, markdownSourceRef.current, sourceSelection.to)
        : null;
    const hasMappedSelection = richFrom !== null && richTo !== null;
    if (hasMappedSelection) editor.commands.setTextSelection({ from: richFrom, to: richTo });
    markdownModeSnapshotRef.current = currentMemoId
      ? createMarkdownModeSnapshot(currentMemoId, content, markdownSourceRef.current)
      : null;
    setIsMarkdownMode(false);
    if (!hasMappedSelection) restoreScrollAfterModeChange("rich", scrollProgress);
    window.requestAnimationFrame(() => {
      if (getMemoId() === currentMemoId && !markdownSourceEditorRef.current) editor.view.focus();
    });
    window.setTimeout(() => {
      hydratingRef.current = false;
    }, 0);
  }, [editor, getMemoId, hydratingRef, restoreScrollAfterModeChange]);

  const handleMarkdownModeChange = useCallback(() => {
    if (effectiveReadOnly || !isEditorReady(editor)) {
      return;
    }

    const scrollProgress = getEditorScrollProgress(
      isMarkdownMode ? (markdownSourceEditorRef.current?.getScrollContainer() ?? null) : editorScrollContainerRef.current,
    );

    if (isMarkdownMode) {
      applyMarkdownSourceToRichText(scrollProgress);
      return;
    }

    const currentMemoId = getMemoId();
    if (!currentMemoId) {
      return;
    }
    const contentJson = editor.getJSON() as TiptapDoc;
    const serialized = createMarkdownModeSnapshot(currentMemoId, contentJson);
    const markdown = selectMarkdownSourceForDocument(
      markdownModeSnapshotRef.current,
      currentMemoId,
      contentJson,
      serialized.markdownSource,
    );
    const { from, to } = editor.state.selection;
    const sourceFrom = richPositionToMarkdownOffset(editor.state.doc, markdown, from);
    const sourceTo = to === from
      ? sourceFrom
      : richPositionToMarkdownOffset(editor.state.doc, markdown, to);
    pendingSourceSelectionRef.current = sourceFrom !== null && sourceTo !== null
      ? { memoId: currentMemoId, from: sourceFrom, to: sourceTo }
      : null;
    markdownModeSnapshotRef.current = createMarkdownModeSnapshot(
      currentMemoId,
      contentJson,
      markdown,
    );
    setMarkdownSource(markdown);
    setIsMarkdownMode(true);
    if (!pendingSourceSelectionRef.current) restoreScrollAfterModeChange("markdown", scrollProgress);
  }, [
    applyMarkdownSourceToRichText,
    editor,
    editorScrollContainerRef,
    effectiveReadOnly,
    getMemoId,
    isMarkdownMode,
    restoreScrollAfterModeChange,
  ]);

  const resetMarkdownMode = useCallback(() => {
    markdownModeSnapshotRef.current = null;
    pendingSourceSelectionRef.current = null;
    setMarkdownSource("");
    setIsMarkdownMode(false);
  }, []);

  const hydrateMarkdownSource = useCallback((
    memoId: string,
    content: TiptapDoc,
    markdown: string,
    options?: { force?: boolean },
  ) => {
    const keepLiveSource = !options?.force
      && isMarkdownMode
      && shouldKeepLiveMarkdownSource({
        snapshot: markdownModeSnapshotRef.current,
        memoId,
        liveMarkdownSource: markdownSourceRef.current,
        incomingMarkdown: markdown,
        incomingContent: content,
      });
    const nextSource = keepLiveSource ? markdownSourceRef.current : markdown;
    if (!keepLiveSource) {
      setMarkdownSource(markdown);
    }
    markdownModeSnapshotRef.current = createMarkdownModeSnapshot(memoId, content, nextSource);
    return keepLiveSource;
  }, [isMarkdownMode]);

  const clearMarkdownSnapshot = useCallback(() => {
    markdownModeSnapshotRef.current = null;
  }, []);

  return {
    applyMarkdownSourceToRichText,
    clearMarkdownSnapshot,
    handleMarkdownModeChange,
    handleMarkdownSourceReady,
    hydrateMarkdownSource,
    isMarkdownMode,
    markdownModeSnapshotRef,
    markdownSource,
    markdownSourceEditorRef,
    resetMarkdownMode,
    setIsMarkdownMode,
    setMarkdownSource,
  };
};
