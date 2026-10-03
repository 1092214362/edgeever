import { describe, expect, test } from "bun:test";
import { sidebarCompanionFocus, sidebarLocalContextText } from "./ai-sidebar-context.ts";

const note = {
  memoId: "note-1",
  notebookId: "book-1",
  notebookTitle: "音乐",
  noteTitle: "QQ 音乐等级",
  contentMarkdown: "关于 QQ 音乐等级的长篇笔记",
};

describe("AI sidebar note context", () => {
  test("a request receives the open note identity without its body", () => {
    expect(sidebarCompanionFocus(note, false)).toEqual({ memoId: "note-1", title: "QQ 音乐等级" });
    const localContext = sidebarLocalContextText(note, false);
    expect(localContext).toContain("ID: note-1");
    expect(localContext).toContain("Title (data): QQ 音乐等级");
    expect(localContext).toContain("get_memo");
    expect(localContext).not.toContain(note.contentMarkdown);
  });

  test("explicitly including the current note works for both assistant modes", () => {
    expect(sidebarCompanionFocus(note, true)).toEqual({
      memoId: "note-1",
      notebookId: "book-1",
      notebookTitle: "音乐",
      title: "QQ 音乐等级",
      contentMarkdown: "关于 QQ 音乐等级的长篇笔记",
    });
    expect(sidebarLocalContextText(note, true)).toContain("关于 QQ 音乐等级的长篇笔记");
  });

  test("an explicitly pinned selection is retained without the rest of the note", () => {
    const selected = { ...note, selectionMarkdown: "  需要解释的句子  " };
    expect(sidebarCompanionFocus(selected, false)).toEqual({ memoId: "note-1", title: "QQ 音乐等级", selectionMarkdown: "需要解释的句子" });
    expect(sidebarLocalContextText(selected, false)).toContain("需要解释的句子");
    expect(sidebarLocalContextText(selected, false)).not.toContain(note.contentMarkdown);
  });

  test("switching notes sends only the newly open note identity", () => {
    const switched = { ...note, memoId: "note-2", noteTitle: "第二篇", contentMarkdown: "第二篇正文" };
    expect(sidebarCompanionFocus(switched, false)).toEqual({ memoId: "note-2", title: "第二篇" });
    expect(sidebarLocalContextText(switched, false)).toContain("ID: note-2");
    expect(sidebarLocalContextText(switched, false)).not.toContain("note-1");
  });
});
