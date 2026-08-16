import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Loader2, Sparkles, Tags, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { normalizeTags, type AiTagSuggestion, type TagSummary } from "@edgeever/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, ApiRequestError } from "@/lib/api";
import { parseTagsText } from "@/lib/utils";

type EditorTagPickerProps = {
  contentMarkdown: string;
  disabled: boolean;
  loadTags: () => Promise<{ tags: TagSummary[] }>;
  title: string;
  value: string;
  onChange: (value: string) => void;
};

export const EditorTagPicker = ({ contentMarkdown, disabled, loadTags, title, value, onChange }: EditorTagPickerProps) => {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<AiTagSuggestion[] | null>(null);
  const [chosenSuggestions, setChosenSuggestions] = useState<Set<string>>(new Set());
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const suggestionControllerRef = useRef<AbortController | null>(null);
  const selectedTags = useMemo(() => normalizeTags(parseTagsText(value)), [value]);
  const selectedTagKeys = useMemo(
    () => new Set(selectedTags.map((tag) => tag.toLocaleLowerCase())),
    [selectedTags],
  );
  const tagsQuery = useQuery({
    queryKey: ["tags"],
    queryFn: loadTags,
    enabled: open,
  });
  const normalizedQuery = query.trim().replace(/^#/, "");
  const visibleTags = (tagsQuery.data?.tags ?? []).filter((tag) =>
    tag.name.toLocaleLowerCase().includes(normalizedQuery.toLocaleLowerCase())
  );
  const exactMatch = (tagsQuery.data?.tags ?? []).some(
    (tag) => tag.name.toLocaleLowerCase() === normalizedQuery.toLocaleLowerCase()
  );

  useEffect(() => () => suggestionControllerRef.current?.abort(), []);

  const commit = (tags: string[]) => onChange(normalizeTags(tags).join(", "));
  const toggleTag = (name: string) => {
    commit(selectedTags.includes(name)
      ? selectedTags.filter((tag) => tag !== name)
      : [...selectedTags, name]);
  };
  const createTag = () => {
    const additions = parseTagsText(normalizedQuery);
    if (additions.length === 0) return;
    commit([...selectedTags, ...additions]);
    setQuery("");
  };
  const requestSuggestions = async () => {
    if (!title.trim() && !contentMarkdown.trim()) return;
    suggestionControllerRef.current?.abort();
    const controller = new AbortController();
    suggestionControllerRef.current = controller;
    setSuggesting(true);
    setSuggestionError(null);
    try {
      const result = await api.suggestAiTags(
        {
          title,
          contentMarkdown,
          currentTags: selectedTags,
          locale: i18n.resolvedLanguage,
        },
        controller.signal,
      );
      setSuggestions(result.suggestions);
      const availableSlots = Math.max(0, 24 - selectedTags.length);
      setChosenSuggestions(new Set(
        result.suggestions
          .filter((suggestion) => !selectedTagKeys.has(suggestion.name.toLocaleLowerCase()))
          .slice(0, availableSlots)
          .map((suggestion) => suggestion.name),
      ));
    } catch (error) {
      if (controller.signal.aborted) return;
      setSuggestions(null);
      setChosenSuggestions(new Set());
      setSuggestionError(
        error instanceof ApiRequestError && error.code === "ai_not_configured"
          ? t("editor.tagPicker.aiConfigure")
          : error instanceof Error
            ? error.message
            : t("editor.tagPicker.aiFailed"),
      );
    } finally {
      if (suggestionControllerRef.current === controller) {
        suggestionControllerRef.current = null;
        setSuggesting(false);
      }
    }
  };
  const toggleSuggestion = (name: string) => {
    setChosenSuggestions((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };
  const applySuggestions = () => {
    if (!suggestions) return;
    commit([
      ...selectedTags,
      ...suggestions.filter((suggestion) => chosenSuggestions.has(suggestion.name)).map((suggestion) => suggestion.name),
    ]);
    setChosenSuggestions(new Set());
  };
  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) return;
    suggestionControllerRef.current?.abort();
    suggestionControllerRef.current = null;
    setSuggesting(false);
    setQuery("");
    setSuggestions(null);
    setChosenSuggestions(new Set());
    setSuggestionError(null);
  };

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        className="flex h-8 min-w-[12rem] flex-1 items-center gap-2 rounded-md border border-transparent px-2 text-left text-sm text-slate-500 outline-none transition hover:border-slate-200 hover:bg-slate-50 focus-visible:border-emerald-300 focus-visible:ring-2 focus-visible:ring-emerald-500/15 disabled:opacity-50"
        aria-label={t("editor.tagPicker.open")}
        onClick={() => setOpen(true)}
      >
        <Tags className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">
          {selectedTags.length > 0 ? selectedTags.map((tag) => `#${tag}`).join(", ") : t("editor.tagPlaceholder")}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="flex max-h-[min(42rem,calc(100dvh-2rem))] max-w-lg flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>{t("editor.tagPicker.title")}</DialogTitle>
            <DialogDescription>{t("editor.tagPicker.description")}</DialogDescription>
          </DialogHeader>

          {selectedTags.length > 0 && (
            <div className="flex flex-wrap gap-2" aria-label={t("editor.tagPicker.selected")}>
              {selectedTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className="inline-flex h-8 items-center gap-1 rounded-full bg-emerald-50 px-3 text-sm font-medium text-emerald-800 outline-none hover:bg-emerald-100 focus-visible:ring-2 focus-visible:ring-emerald-500/30"
                  onClick={() => toggleTag(tag)}
                  aria-label={t("editor.tagPicker.remove", { name: tag })}
                >
                  #{tag}<X className="h-3.5 w-3.5" />
                </button>
              ))}
            </div>
          )}

          <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); createTag(); }}>
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("editor.tagPicker.searchPlaceholder")}
              aria-label={t("editor.tagPicker.searchPlaceholder")}
            />
            <Button type="submit" variant="outline" disabled={!normalizedQuery || exactMatch || selectedTags.length >= 24}>
              {t("editor.tagPicker.create")}
            </Button>
          </form>

          <section className="grid gap-3 rounded-lg border border-emerald-100 bg-emerald-50/50 p-3" aria-label={t("editor.tagPicker.aiTitle")}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-900">
                  <Sparkles className="h-4 w-4" />
                  {t("editor.tagPicker.aiTitle")}
                </p>
                <p className="mt-0.5 text-xs text-emerald-800/70">{t("editor.tagPicker.aiDescription")}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="shrink-0 bg-white"
                disabled={suggesting || (!title.trim() && !contentMarkdown.trim())}
                onClick={() => void requestSuggestions()}
              >
                {suggesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {t(suggestions ? "editor.tagPicker.aiRetry" : "editor.tagPicker.aiGenerate")}
              </Button>
            </div>

            {suggestionError ? <p className="text-xs font-medium text-rose-600" role="alert">{suggestionError}</p> : null}
            {suggestions ? (
              suggestions.length > 0 ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    {suggestions.map((suggestion) => {
                      const alreadySelected = selectedTagKeys.has(suggestion.name.toLocaleLowerCase());
                      const chosen = alreadySelected || chosenSuggestions.has(suggestion.name);
                      return (
                        <button
                          key={suggestion.name}
                          type="button"
                          disabled={alreadySelected}
                          className={chosen
                            ? "inline-flex h-8 items-center gap-1.5 rounded-full bg-emerald-700 px-3 text-xs font-medium text-white disabled:bg-emerald-200 disabled:text-emerald-800"
                            : "inline-flex h-8 items-center gap-1.5 rounded-full border border-emerald-200 bg-white px-3 text-xs font-medium text-emerald-900 hover:bg-emerald-50"}
                          aria-pressed={chosen}
                          onClick={() => toggleSuggestion(suggestion.name)}
                        >
                          {chosen ? <Check className="h-3.5 w-3.5" /> : null}
                          #{suggestion.name}
                          <span className="opacity-70">
                            {t(alreadySelected
                              ? "editor.tagPicker.aiSelected"
                              : suggestion.existing
                                ? "editor.tagPicker.aiExisting"
                                : "editor.tagPicker.aiNew")}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <Button
                    type="button"
                    className="justify-self-start"
                    disabled={chosenSuggestions.size === 0}
                    onClick={applySuggestions}
                  >
                    {t("editor.tagPicker.aiApply", { count: chosenSuggestions.size })}
                  </Button>
                </>
              ) : (
                <p className="text-xs text-emerald-800/70">{t("editor.tagPicker.aiEmpty")}</p>
              )
            ) : null}
          </section>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-slate-200">
            {tagsQuery.isLoading ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">{t("editor.tagPicker.loading")}</p>
            ) : visibleTags.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">{t("editor.tagPicker.empty")}</p>
            ) : (
              visibleTags.map((tag) => {
                const selected = selectedTags.includes(tag.name);
                return (
                  <button
                    key={tag.name}
                    type="button"
                    className="flex min-h-11 w-full items-center gap-3 border-b border-slate-100 px-3 text-left text-sm outline-none last:border-b-0 hover:bg-slate-50 focus-visible:bg-emerald-50"
                    onClick={() => toggleTag(tag.name)}
                    aria-pressed={selected}
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-slate-300 text-emerald-700">
                      {selected && <Check className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">#{tag.name}</span>
                    <span className="text-xs text-slate-400">{t("editor.tagPicker.memoCount", { count: tag.memoCount })}</span>
                  </button>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
