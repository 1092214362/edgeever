import { useCallback, useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { ChevronDown, ListTree } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

type OutlineItem = {
  level: number;
  pos: number;
  text: string;
};

type EditorOutlineProps = {
  editor: Editor | null;
  scrollContainer: HTMLDivElement | null;
};

const getOutlineItems = (editor: Editor): OutlineItem[] => {
  const items: OutlineItem[] = [];

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "heading") {
      return;
    }

    const text = node.textContent.trim();
    if (text) {
      items.push({
        level: Number(node.attrs.level) || 1,
        pos,
        text,
      });
    }
  });

  return items;
};

export const EditorOutline = ({ editor, scrollContainer }: EditorOutlineProps) => {
  const { t } = useTranslation();
  const [items, setItems] = useState<OutlineItem[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [activePos, setActivePos] = useState<number | null>(null);

  const refresh = useCallback(() => {
    if (!editor || editor.isDestroyed) {
      setItems([]);
      return;
    }

    setItems(getOutlineItems(editor));
  }, [editor]);

  const updateActiveItem = useCallback(() => {
    if (!editor || editor.isDestroyed || items.length === 0) {
      setActivePos(null);
      return;
    }

    const selectionPos = editor.state.selection.from;
    const activeItem = items.reduce<OutlineItem | null>((current, item) => (
      item.pos <= selectionPos ? item : current
    ), null);

    setActivePos(activeItem?.pos ?? items[0]?.pos ?? null);
  }, [editor, items]);

  useEffect(() => {
    refresh();
    if (!editor) {
      return;
    }

    editor.on("update", refresh);
    editor.on("selectionUpdate", updateActiveItem);
    return () => {
      editor.off("update", refresh);
      editor.off("selectionUpdate", updateActiveItem);
    };
  }, [editor, refresh, updateActiveItem]);

  useEffect(() => {
    updateActiveItem();
  }, [updateActiveItem]);

  useEffect(() => {
    if (!scrollContainer || items.length === 0) {
      return;
    }

    const updateFromScroll = () => {
      const threshold = scrollContainer.getBoundingClientRect().top + 96;
      let activeItem: OutlineItem | null = null;

      for (const item of items) {
        const element = editor?.view.nodeDOM(item.pos);
        if (element instanceof HTMLElement && element.getBoundingClientRect().top <= threshold) {
          activeItem = item;
        }
      }

      if (activeItem) {
        setActivePos(activeItem.pos);
      }
    };

    scrollContainer.addEventListener("scroll", updateFromScroll, { passive: true });
    updateFromScroll();
    return () => scrollContainer.removeEventListener("scroll", updateFromScroll);
  }, [editor, items, scrollContainer]);

  const jumpToHeading = (item: OutlineItem) => {
    if (!editor || editor.isDestroyed) {
      return;
    }

    editor.chain().focus().setTextSelection(item.pos + 1).scrollIntoView().run();
    setActivePos(item.pos);
  };

  if (items.length === 0) {
    return null;
  }

  return (
    <aside className="sticky top-0 h-fit max-h-[calc(100vh-8rem)] w-56 shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50/80 px-4 py-5" aria-label={t("editor.outline")}>
      <div className="flex items-center gap-2">
        <ListTree className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600"
          onClick={() => setCollapsed((value) => !value)}
          aria-expanded={!collapsed}
        >
          <span>{t("editor.outline")}</span>
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", collapsed && "-rotate-90")} aria-hidden="true" />
        </button>
        <span className="text-xs text-slate-400">{items.length}</span>
      </div>
      {!collapsed && (
        <nav className="mt-3" aria-label={t("editor.outline")}>
          <ol className="space-y-0.5">
            {items.map((item) => (
              <li key={item.pos}>
                <button
                  type="button"
                  className={cn(
                    "block w-full truncate rounded px-2 py-1 text-left text-sm transition-colors",
                    activePos === item.pos
                      ? "bg-emerald-100 font-medium text-emerald-800"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  )}
                  style={{ paddingLeft: `${8 + Math.max(0, item.level - 1) * 14}px` }}
                  onClick={() => jumpToHeading(item)}
                  title={item.text}
                >
                  {item.text}
                </button>
              </li>
            ))}
          </ol>
        </nav>
      )}
    </aside>
  );
};
