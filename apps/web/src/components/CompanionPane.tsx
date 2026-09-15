import { companionMemoryText } from "@/lib/companion-memory";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, MessageCircle } from "lucide-react";
import type { CompanionMemory } from "@edgeever/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppConfirmDialog } from "@/components/dialogs/ConfirmDialogs";
import { api, ApiRequestError } from "@/lib/api";
import { CompanionChat } from "./CompanionChat";

type CompanionActionHandlers = {
  beforeApply: () => Promise<void>;
  onNotesChanged: () => Promise<void>;
  onOpenNote: (id: string, notebookId: string) => void;
};

export default function CompanionPane({ available, onBack, onOpenSettings, ...actionHandlers }: {
  available: boolean;
  onBack: () => void;
  onOpenSettings: () => void;
} & CompanionActionHandlers) {
  const { t } = useTranslation();
  return <section className="flex h-full min-h-0 flex-col bg-card" aria-labelledby="companion-title">
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ChevronLeft className="mr-1 h-4 w-4" />{t("companion.backToNotes")}
        </Button>
        <h1 id="companion-title" className="text-sm font-semibold text-slate-900">{t("companion.title")}</h1>
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">{t("companion.preview")}</span>
      </div>
      <Button variant="ghost" size="sm" onClick={onOpenSettings}>{t("companion.settings")}</Button>
    </header>
    {available ? <CompanionWorkspace {...actionHandlers} /> : <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-y-auto p-6 text-center">
      <MessageCircle aria-hidden="true" className="h-10 w-10 text-emerald-600" />
      <h2 className="text-lg font-semibold text-slate-900">{t("companion.emptyTitle")}</h2>
      <p className="max-w-lg text-sm leading-relaxed text-slate-500">{t("companion.intro")}</p>
      <p role="status" className="max-w-lg rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-600">{t("companion.unavailableHelp")}</p>
    </div>}
  </section>;
}

function CompanionWorkspace({ beforeApply, onNotesChanged, onOpenNote }: CompanionActionHandlers) {
  const { t, i18n } = useTranslation();
  const [memories, setMemories] = useState<CompanionMemory[]>([]);
  const [memoryContent, setMemoryContent] = useState("");
  const [editing, setEditing] = useState<CompanionMemory | null>(null);
  const [tab, setTab] = useState<"chat" | "memories">("chat");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<CompanionMemory | "history" | null>(null);
  const alive = useRef(true);
  const locked = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const explainError = (cause: unknown) => {
    const code = cause instanceof ApiRequestError ? cause.code : "";
    if (code === "ai_not_configured") return t("companion.configureModel");
    if (code === "companion_memory_conflict") return t("companion.conflict");
    if (code === "companion_history_full") return t("companion.historyFull");
    if (cause instanceof ApiRequestError && cause.status === 403) return t("companion.unavailable");
    return t("companion.failed");
  };
  const reload = async () => {
    const memoryResult = await api.listCompanionMemories();
    if (!alive.current) return;
    setMemories(memoryResult.memories);
  };
  useEffect(() => {
    alive.current = true;
    void reload().catch(cause => { if (alive.current) setError(explainError(cause)); })
      .finally(() => { if (alive.current) setLoading(false); });
    return () => { alive.current = false; };
    // This workspace owns ephemeral account-scoped state, discarded on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const perform = async (work: () => Promise<unknown>) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true); setError(null);
    try { await work(); await reload(); window.dispatchEvent(new Event("edgeever:companion-memory-changed")); }
    catch (cause) { if (alive.current) setError(explainError(cause)); }
    finally { locked.current = false; if (alive.current) setBusy(false); }
  };
  const saveMemory = (event: FormEvent) => {
    event.preventDefault();
    void perform(async () => {
      if (editing) await api.updateCompanionMemory(editing, memoryContent.trim());
      else await api.saveCompanionMemory(memoryContent.trim());
      setEditing(null); setMemoryContent("");
    });
  };
  const exportData = () => void perform(async () => {
    const data = await api.exportCompanion();
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url; link.download = "edgeever-companion.json"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  return <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col gap-3 overflow-hidden px-4 py-4 lg:px-8 lg:py-6">
      <div className="flex flex-wrap gap-2">
        <Button aria-pressed={tab === "chat"} variant={tab === "chat" ? "solid" : "outline"} onClick={() => setTab("chat")}>{t("companion.chat")}</Button>
        <Button aria-pressed={tab === "memories"} variant={tab === "memories" ? "solid" : "outline"} onClick={() => setTab("memories")}>{t("companion.memories")} ({memories.length}/50)</Button>
        <Button variant="ghost" disabled={busy || loading} onClick={() => void perform(reload)}>{t("common.refresh")}</Button>
      </div>
      {error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}
      {tab === "chat" ? <CompanionChat available beforeApply={beforeApply} onNotesChanged={onNotesChanged} onOpenNote={onOpenNote} variant="page" allowWrites /> : <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <p className="text-sm text-slate-500">{t("companion.memoryHelp")}</p>
          <form className="space-y-2" onSubmit={saveMemory}>
            <label className="block text-sm" htmlFor="companion-memory">{editing ? t("companion.correct") : t("companion.addMemory")}</label>
            <Input id="companion-memory" value={memoryContent} maxLength={500} required disabled={busy} onChange={e => setMemoryContent(e.target.value)} />
            <div className="flex gap-2">
              <Button type="submit" disabled={busy || loading || !memoryContent.trim()}>{t("common.save")}</Button>
              {editing ? <Button variant="ghost" onClick={() => { setEditing(null); setMemoryContent(""); }}>{t("common.cancel")}</Button> : null}
            </div>
          </form>
          {memories.map(memory => <article key={memory.id} className="space-y-2 rounded-lg border p-3 text-sm">
            <p className="whitespace-pre-wrap break-words">{companionMemoryText(memory, t)}</p>
            {memory.scopeNotebookName ? <p className="text-xs text-slate-500">{memory.scopeNotebookName}</p> : null}
            <p className="text-xs text-slate-500">{memory.kind === "inferred" ? t(`companion.learning.${memory.state ?? "candidate"}`) : t(memory.sourceTurnId ? "companion.fromMessage" : "companion.fromManual")}</p>
            {memory.evidence?.length ? <details className="text-xs text-slate-500">
              <summary className="cursor-pointer">{t("companion.learning.evidence")}</summary>
              <ul className="mt-2 space-y-1">{memory.evidence.map((entry, index) => <li key={`${entry.memoId}-${index}`}>
                {new Date(entry.createdAt).toLocaleDateString(i18n.resolvedLanguage)} · <Button variant="ghost" size="sm" className="h-auto p-0 text-xs underline"
                  disabled={!entry.notebookId} onClick={() => entry.notebookId && onOpenNote(entry.memoId, entry.notebookId)}>{entry.title || t("common.untitledMemo")}</Button>
              </li>)}</ul>
            </details> : null}
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setEditing(memory); setMemoryContent(companionMemoryText(memory, t)); }}>{t("companion.correct")}</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmation(memory)}>{t("companion.forget")}</Button>
          </article>)}
          <p className="text-xs text-slate-500">{t("companion.backupHelp")}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy || loading} onClick={exportData}>{t("companion.export")}</Button>
            <Button variant="outline" disabled={busy || loading} onClick={() => fileInput.current?.click()}>{t("companion.import")}</Button>
            <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" aria-label={t("companion.import")} onChange={event => {
              const file = event.target.files?.[0]; event.target.value = "";
              if (file) void perform(async () => {
                if (file.size > 10 * 1048576) throw new Error("File too large");
                const data = JSON.parse(await file.text()) as { version: number; memories: CompanionMemory[]; controls?: { useMemory: boolean; learningEnabled: boolean } };
                if (![1, 2].includes(data.version) || !Array.isArray(data.memories)) throw new Error("Invalid backup");
                await api.importCompanionMemories(data.memories.map(memory => ({ content: memory.content, kind: memory.kind })), data.controls);
              });
            }} />
            <Button variant="outline" disabled={busy || loading} onClick={() => setConfirmation("history")}>{t("companion.clearHistory")}</Button>
          </div>
        </div>}
      {confirmation ? <AppConfirmDialog title={t(confirmation === "history" ? "companion.clearHistory" : "companion.forget")}
        description={t(confirmation === "history" ? "companion.clearHelp" : "companion.forgetHelp")} confirmLabel={t("common.delete")} isWorking={busy}
        onCancel={() => setConfirmation(null)} onConfirm={() => void perform(async () => {
          if (confirmation === "history") await api.clearCompanionHistory();
          else await api.forgetCompanionMemory(confirmation);
          setConfirmation(null); setEditing(null); setMemoryContent("");
        })} /> : null}
  </div>;
}
