import { useMemo, useState } from "react";
import { Check, ChevronLeft, File as FileIcon, LayoutList, Pencil, Plus, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getMemoTemplates, type MemoTemplate } from "@/lib/app-helpers";
import { WORKSPACE_PAGE_TITLE_CLASSNAME } from "@/lib/workspace-ui";
import type { MemoTemplate as SavedMemoTemplate } from "@edgeever/shared";

export const TemplatesPane = ({
  canCreateMemo,
  isCreating,
  onClose,
  onCreateMemo,
  onCreateSavedTemplate,
  savedTemplates,
  onUseSavedTemplate,
  onDeleteSavedTemplate,
  onUpdateSavedTemplate,
}: {
  canCreateMemo: boolean;
  isCreating: boolean;
  onClose: () => void;
  onCreateMemo: (template: MemoTemplate) => void;
  onCreateSavedTemplate: (payload: { name: string; description: string | null; title: string | null; contentMarkdown: string; tags: string[] }) => Promise<void>;
  savedTemplates: SavedMemoTemplate[];
  onUseSavedTemplate: (template: SavedMemoTemplate) => void;
  onDeleteSavedTemplate: (template: SavedMemoTemplate) => void;
  onUpdateSavedTemplate: (templateId: string, payload: { name: string; description: string | null; title: string | null; contentMarkdown: string; tags: string[] }) => Promise<void>;
}) => {
  const { t } = useTranslation();
  const memoTemplates = useMemo(() => getMemoTemplates(t), [t]);
  const [editingTemplate, setEditingTemplate] = useState<SavedMemoTemplate | null>(null);
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [draft, setDraft] = useState({ name: "", description: "", title: "", contentMarkdown: "", tags: "" });

  const startEditing = (template: SavedMemoTemplate) => {
    setCreatingTemplate(false);
    setEditingTemplate(template);
    setDraft({ name: template.name, description: template.description ?? "", title: template.title ?? "", contentMarkdown: template.contentMarkdown, tags: template.tags.join(", ") });
  };
  const startCreating = () => {
    setEditingTemplate(null);
    setCreatingTemplate(true);
    setDraft({ name: "", description: "", title: "", contentMarkdown: "", tags: "" });
  };
  const cancelEditing = () => {
    setEditingTemplate(null);
    setCreatingTemplate(false);
  };
  const saveEditing = async () => {
    if (!draft.name.trim()) return;
    const payload = {
      name: draft.name.trim(), description: draft.description.trim() || null, title: draft.title.trim() || null,
      contentMarkdown: draft.contentMarkdown, tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
    };
    if (creatingTemplate) {
      await onCreateSavedTemplate(payload);
      cancelEditing();
      return;
    }
    if (!editingTemplate) return;
    await onUpdateSavedTemplate(editingTemplate.id, {
      ...payload,
    });
    cancelEditing();
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-white">
      <header className="flex h-[calc(4rem+env(safe-area-inset-top))] shrink-0 items-end border-b border-slate-200 px-6 pb-3 pt-[env(safe-area-inset-top)] lg:h-16 lg:items-center lg:pb-0 lg:pt-0">
        <div className="flex min-w-0 items-center gap-3">
          <Button size="icon" variant="ghost" title={t("common.back")} aria-label={t("common.back")} onClick={onClose}>
            <ChevronLeft className="h-5 w-5 text-slate-500" />
          </Button>
          <div className="min-w-0">
            <h1 className={`flex items-center gap-2 ${WORKSPACE_PAGE_TITLE_CLASSNAME}`}><LayoutList className="h-4 w-4 text-emerald-700" />{t("templates.title")}</h1>
            <p className="mt-0.5 text-xs text-slate-500">{t("templates.description")}</p>
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-6 lg:py-6">
        <div className="mx-auto w-full max-w-4xl">
          <section className="mb-8">
            <div className="mb-3 flex items-center justify-start gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("templates.myTemplates")}</h2>
              <Button type="button" size="sm" onClick={startCreating} disabled={isCreating || creatingTemplate || Boolean(editingTemplate)}>
                <Plus className="mr-1 h-4 w-4" />{t("templates.create")}
              </Button>
            </div>
              {(editingTemplate || creatingTemplate) && (
                <div className="mb-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder={t("templates.name")} />
                    <Input value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} placeholder={t("templates.descriptionField")} />
                    <Input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder={t("templates.noteTitle")} />
                    <Input value={draft.tags} onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value }))} placeholder={t("templates.tags")} />
                  </div>
                  <textarea className="min-h-48 w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-950 outline-none focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500/20" value={draft.contentMarkdown} onChange={(event) => setDraft((current) => ({ ...current, contentMarkdown: event.target.value }))} aria-label={t("templates.content")} />
                  <div className="flex justify-end gap-2">
                    <Button type="button" size="sm" variant="ghost" onClick={cancelEditing}><X className="mr-1 h-4 w-4" />{t("common.cancel")}</Button>
                    <Button type="button" size="sm" onClick={() => void saveEditing()} disabled={!draft.name.trim()}><Check className="mr-1 h-4 w-4" />{t("common.save")}</Button>
                  </div>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {savedTemplates.map((template) => (
                  <div key={template.id} className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-4">
                    <button className="block w-full text-left disabled:opacity-50" type="button" disabled={!canCreateMemo || isCreating} onClick={() => onUseSavedTemplate(template)}>
                      <span className="text-sm font-semibold text-slate-950">{template.name}</span>
                      <span className="mt-1 block line-clamp-2 text-xs leading-5 text-slate-500">{template.description || template.title || t("templates.savedDescription")}</span>
                    </button>
                    <div className="mt-3 flex gap-3 text-xs">
                      <button className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-800" type="button" disabled={isCreating} onClick={() => startEditing(template)}><Pencil className="h-3 w-3" />{t("templates.edit")}</button>
                      <button className="inline-flex items-center gap-1 text-rose-600 hover:text-rose-700" type="button" disabled={isCreating} onClick={() => onDeleteSavedTemplate(template)}><Trash2 className="h-3 w-3" />{t("templates.delete")}</button>
                    </div>
                  </div>
                ))}
              </div>
          </section>
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("templates.builtIn")}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {memoTemplates.map((template) => (
                <button key={template.id} className="group flex min-h-32 flex-col rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50" type="button" disabled={!canCreateMemo || isCreating} onClick={() => onCreateMemo(template)}>
                  <span className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-emerald-700 transition group-hover:border-slate-300"><FileIcon className="h-4 w-4" /></span>
                  <span className="mt-4 text-sm font-semibold text-slate-950">{template.title}</span>
                  <span className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{template.description}</span>
                </button>
              ))}
            </div>
          </section>
          {!canCreateMemo && <div className="mt-5 rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">{t("templates.unavailable")}</div>}
        </div>
      </main>
    </div>
  );
};
