import { useMemo, useState } from "react";
import { Check, File as FileIcon, LayoutList, Pencil, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getMemoTemplates, type MemoTemplate } from "@/lib/app-helpers";
import type { MemoTemplate as SavedMemoTemplate } from "@edgeever/shared";

export const TemplatesDialog = ({
  canCreateMemo,
  isCreating,
  onClose,
  onCreateMemo,
  savedTemplates,
  onUseSavedTemplate,
  onDeleteSavedTemplate,
  onUpdateSavedTemplate,
}: {
  canCreateMemo: boolean;
  isCreating: boolean;
  onClose: () => void;
  onCreateMemo: (template: MemoTemplate) => void;
  savedTemplates: SavedMemoTemplate[];
  onUseSavedTemplate: (template: SavedMemoTemplate) => void;
  onDeleteSavedTemplate: (template: SavedMemoTemplate) => void;
  onUpdateSavedTemplate: (templateId: string, payload: { name: string; description: string | null; title: string | null; contentMarkdown: string; tags: string[] }) => Promise<void>;
}) => {
  const { t } = useTranslation();
  const memoTemplates = useMemo(() => getMemoTemplates(t), [t]);
  const [editingTemplate, setEditingTemplate] = useState<SavedMemoTemplate | null>(null);
  const [draft, setDraft] = useState({ name: "", description: "", title: "", contentMarkdown: "", tags: "" });

  const startEditing = (template: SavedMemoTemplate) => {
    setEditingTemplate(template);
    setDraft({
      name: template.name,
      description: template.description ?? "",
      title: template.title ?? "",
      contentMarkdown: template.contentMarkdown,
      tags: template.tags.join(", "),
    });
  };

  const cancelEditing = () => setEditingTemplate(null);

  const saveEditing = async () => {
    if (!editingTemplate || !draft.name.trim()) return;
    await onUpdateSavedTemplate(editingTemplate.id, {
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      title: draft.title.trim() || null,
      contentMarkdown: draft.contentMarkdown,
      tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
    });
    setEditingTemplate(null);
  };

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open && !isCreating) onClose(); }}>
      <DialogContent className="max-w-[620px] p-0 overflow-hidden border border-slate-200 bg-white shadow-lg rounded-lg">
        <DialogHeader className="flex flex-row items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 text-left">
          <div className="min-w-0">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold text-slate-950">
              <LayoutList className="h-4 w-4 text-emerald-700" />
              {t("templates.title")}
            </DialogTitle>
            <DialogDescription className="mt-1 text-xs text-slate-500">
              {t("templates.description")}
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto p-5">
          {savedTemplates.length > 0 && (
            <section className="mb-5">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("templates.myTemplates")}</h3>
              {editingTemplate && (
                <div className="mb-3 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder={t("templates.name")} />
                    <Input value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} placeholder={t("templates.descriptionField")} />
                    <Input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder={t("templates.noteTitle")} />
                    <Input value={draft.tags} onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value }))} placeholder={t("templates.tags")} />
                  </div>
                  <textarea
                    className="min-h-40 w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-950 outline-none focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500/20"
                    value={draft.contentMarkdown}
                    onChange={(event) => setDraft((current) => ({ ...current, contentMarkdown: event.target.value }))}
                    aria-label={t("templates.content")}
                  />
                  <div className="flex justify-end gap-2">
                    <Button type="button" size="sm" variant="ghost" onClick={cancelEditing}><X className="mr-1 h-4 w-4" />{t("common.cancel")}</Button>
                    <Button type="button" size="sm" onClick={() => void saveEditing()} disabled={!draft.name.trim()}><Check className="mr-1 h-4 w-4" />{t("common.save")}</Button>
                  </div>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                {savedTemplates.map((template) => (
                  <div key={template.id} className="rounded-md border border-emerald-100 bg-emerald-50/40 p-3">
                    <button
                      className="block w-full text-left disabled:opacity-50"
                      type="button"
                      disabled={!canCreateMemo || isCreating}
                      onClick={() => onUseSavedTemplate(template)}
                    >
                      <span className="text-sm font-semibold text-slate-950">{template.name}</span>
                      <span className="mt-1 block line-clamp-2 text-xs leading-5 text-slate-500">{template.description || template.title || t("templates.savedDescription")}</span>
                    </button>
                    <div className="mt-2 flex gap-3 text-xs">
                      <button className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-800" type="button" disabled={isCreating} onClick={() => startEditing(template)}>
                        <Pencil className="h-3 w-3" />{t("templates.edit")}
                      </button>
                      <button className="text-rose-600 hover:text-rose-700" type="button" disabled={isCreating} onClick={() => onDeleteSavedTemplate(template)}>
                        {t("templates.delete")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("templates.builtIn")}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {memoTemplates.map((template) => (
              <button
                key={template.id}
                className="group flex min-h-28 flex-col rounded-md border border-slate-200 bg-white p-3 text-left transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                type="button"
                disabled={!canCreateMemo || isCreating}
                onClick={() => onCreateMemo(template)}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-emerald-700 transition group-hover:border-slate-300">
                  <FileIcon className="h-4 w-4" />
                </span>
                <span className="mt-3 text-sm font-semibold text-slate-950">{template.title}</span>
                <span className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{template.description}</span>
              </button>
            ))}
          </div>
          {!canCreateMemo && (
            <div className="mt-4 rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {t("templates.unavailable")}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
