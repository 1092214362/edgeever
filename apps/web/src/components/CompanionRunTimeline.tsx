import type { CompanionTodo, CompanionToolCall, CompanionToolEffect } from "@edgeever/shared";
import { Check, Circle, FileText, Loader2, RotateCcw, Undo2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export function CompanionRunTimeline({
  tools, todos, busy, onOpenNote, onNotesChanged,
}: {
  tools: CompanionToolCall[]; todos: CompanionTodo[]; busy: boolean;
  onOpenNote: (id: string, notebookId: string) => void; onNotesChanged: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const restore = async (effect: CompanionToolEffect, key: string) => {
    if (!effect.memoId || busy) return;
    setPending(key); setMessage(null);
    try {
      if (effect.kind === "trashed") await api.restoreMemo(effect.memoId);
      else if (effect.kind === "updated" && effect.previousRevision != null) {
        const { revisions } = await api.listMemoRevisions(effect.memoId);
        const match = revisions.find(revision => revision.revision === effect.previousRevision);
        if (!match) throw new Error("missing revision");
        await api.restoreMemoRevision(effect.memoId, match.id);
      }
      await onNotesChanged();
      setMessage(t("companion.timeline.restored"));
    } catch {
      setMessage(t("companion.timeline.restoreFailed"));
    } finally { setPending(null); }
  };
  if (!tools.length && !todos.length) return null;
  return (
    <div className="space-y-2 rounded-md border border-slate-200/80 bg-slate-50/70 p-2.5">
      {todos.length ? (
        <div>
          <p className="text-[11px] font-semibold text-slate-500">{t("companion.todos.title")}</p>
          <ul className="mt-1 space-y-1">
            {todos.map(todo => (
              <li key={todo.id} className="flex items-start gap-1.5 text-xs text-slate-700">
                {todo.status === "completed" ? <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" /> : todo.status === "in_progress"
                  ? <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin text-emerald-600" />
                  : <Circle className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />}
                <span className={todo.status === "completed" ? "text-slate-500 line-through" : ""}>{todo.content}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {tools.length ? (
        <div>
          <p className="text-[11px] font-semibold text-slate-500">{t("companion.timeline.title")}</p>
          <ul className="mt-1 space-y-1.5">
            {tools.map(tool => (
              <li key={tool.id} className="text-xs text-slate-700">
                <p className="font-medium">
                  {t(`companion.actions.tools.${tool.name}`, { defaultValue: tool.name })}
                  {tool.status === "running" ? <span className="ml-1 font-normal text-slate-400">{t("companion.timeline.running")}</span> : null}
                  {tool.status === "error" ? <span className="ml-1 font-normal text-rose-600">{tool.error || t("companion.timeline.error")}</span> : null}
                </p>
                {tool.effects.filter(effect => effect.memoId).map((effect, index) => {
                  const key = `${tool.id}-${effect.memoId}-${index}`;
                  return (
                    <div key={key} className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 pl-0.5">
                      <button type="button" disabled={busy} className="inline-flex max-w-full items-center gap-1 font-medium hover:text-emerald-600 hover:underline"
                        onClick={() => onOpenNote(effect.memoId!, effect.notebookId || "")}>
                        <FileText className="h-3 w-3 shrink-0 text-slate-400" />
                        <span className="truncate">{effect.title || t("common.untitledMemo")}</span>
                      </button>
                      {effect.kind === "trashed" ? (
                        <Button type="button" size="sm" variant="ghost" className="h-6 px-1.5 text-[11px]" disabled={busy || pending === key}
                          onClick={() => void restore(effect, key)}>
                          <RotateCcw className="h-3 w-3" />{t("companion.timeline.restore")}
                        </Button>
                      ) : null}
                      {effect.kind === "updated" && effect.previousRevision != null ? (
                        <Button type="button" size="sm" variant="ghost" className="h-6 px-1.5 text-[11px]" disabled={busy || pending === key}
                          onClick={() => void restore(effect, key)}>
                          <Undo2 className="h-3 w-3" />{t("companion.timeline.restoreRevision")}
                        </Button>
                      ) : null}
                    </div>
                  );
                })}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {message ? <p className="text-[11px] text-slate-500">{message}</p> : null}
    </div>
  );
}
