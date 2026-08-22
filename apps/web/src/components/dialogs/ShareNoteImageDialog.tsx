import { Download, LoaderCircle, Share2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  createNoteImage,
  downloadPreparedNoteImage,
  type DownloadNoteImageOptions,
  type NoteImageBackground,
  type NoteImageFormat,
  type PreparedNoteImage,
} from "@/lib/note-image-export";
import { getHtmlImageEmbedNoticeKind } from "@/lib/note-html-export";
import { cn } from "@/lib/utils";

export type ShareNoteImageSource = Omit<DownloadNoteImageOptions, "background" | "format">;

export const ShareNoteImageDialog = ({
  open,
  onOpenChange,
  source,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: ShareNoteImageSource;
}) => {
  const { t } = useTranslation();
  const [format, setFormat] = useState<NoteImageFormat>("png");
  const [background, setBackground] = useState<NoteImageBackground>("slate");
  const [showNotebook, setShowNotebook] = useState(true);
  const [showTags, setShowTags] = useState(true);
  const [showUpdatedAt, setShowUpdatedAt] = useState(true);
  const [showBranding, setShowBranding] = useState(true);
  const [prepared, setPrepared] = useState<PreparedNoteImage | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [error, setError] = useState(false);
  const generationRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    setFormat("png");
    setBackground("slate");
    setShowNotebook(true);
    setShowTags(true);
    setShowUpdatedAt(true);
    setShowBranding(true);
  }, [open, source.title]);

  useEffect(() => {
    if (!open) return;
    const generation = ++generationRef.current;
    setPrepared(null);
    setError(false);
    const timer = window.setTimeout(() => {
      void createNoteImage({
        ...source,
        background,
        branding: showBranding,
        format,
        notebook: showNotebook ? source.notebook : "",
        tags: showTags ? source.tags : [],
        updatedAt: showUpdatedAt ? source.updatedAt : "",
      }).then((result) => {
        if (generation !== generationRef.current) return;
        setPreviewUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return URL.createObjectURL(result.blob);
        });
        setPrepared(result);
      }).catch(() => {
        if (generation === generationRef.current) setError(true);
      });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [background, format, open, showBranding, showNotebook, showTags, showUpdatedAt, source]);

  useEffect(() => () => {
    generationRef.current += 1;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const shareFile = useMemo(() => prepared
    ? new File([prepared.blob], prepared.filename, { type: prepared.mimeType })
    : null, [prepared]);
  const canUseSystemShare = Boolean(
    shareFile && navigator.canShare?.({ files: [shareFile] }) && navigator.share,
  );
  const noticeKind = prepared ? getHtmlImageEmbedNoticeKind(prepared.images) : "none";

  const share = async () => {
    if (!prepared || !shareFile) return;
    try {
      await navigator.share({ files: [shareFile], title: source.title });
      onOpenChange(false);
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === "AbortError") return;
      setError(true);
    }
  };

  const download = () => {
    if (!prepared) return;
    downloadPreparedNoteImage(prepared);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-slate-200 px-5 py-4 pr-12 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Share2 className="h-5 w-5 text-emerald-600" />
            {t("editor.imageShare.title")}
          </DialogTitle>
          <DialogDescription>{t("editor.imageShare.description")}</DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-0 md:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-h-64 overflow-auto bg-slate-100 p-4 md:max-h-[68vh]">
            {previewUrl && prepared ? (
              <img
                alt={t("editor.imageShare.previewAlt")}
                className="mx-auto block h-auto w-full max-w-[32rem] rounded-md shadow-lg"
                src={previewUrl}
              />
            ) : error ? (
              <div className="flex min-h-64 items-center justify-center text-sm text-rose-600" role="alert">
                {t("editor.imageExport.error")}
              </div>
            ) : (
              <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-slate-500" role="status">
                <LoaderCircle className="h-5 w-5 animate-spin" />
                {t("editor.imageShare.generating")}
              </div>
            )}
          </div>

          <div className="space-y-5 overflow-y-auto border-t border-slate-200 p-5 md:max-h-[68vh] md:border-l md:border-t-0">
            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t("editor.imageShare.background")}
              </legend>
              <div className="grid grid-cols-3 gap-2">
                {(["slate", "mint", "warm"] as const).map((value) => (
                  <button
                    key={value}
                    aria-pressed={background === value}
                    className={cn(
                      "h-10 rounded-md border text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
                      value === "slate" && "bg-slate-50",
                      value === "mint" && "bg-emerald-50",
                      value === "warm" && "bg-amber-50",
                      background === value ? "border-emerald-500 ring-1 ring-emerald-500" : "border-slate-200",
                    )}
                    type="button"
                    onClick={() => setBackground(value)}
                  >
                    {t(`editor.imageShare.backgrounds.${value}`)}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t("editor.imageShare.metadata")}
              </legend>
              {([
                ["notebook", showNotebook, setShowNotebook],
                ["tags", showTags, setShowTags],
                ["updatedAt", showUpdatedAt, setShowUpdatedAt],
                ["branding", showBranding, setShowBranding],
              ] as const).map(([key, checked, setChecked]) => (
                <label key={key} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <Checkbox checked={checked} onCheckedChange={(value) => setChecked(value === true)} />
                  {t(`editor.imageShare.fields.${key}`)}
                </label>
              ))}
            </fieldset>

            <label className="grid gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t("editor.imageShare.format")}
              <Select value={format} onValueChange={(value) => setFormat(value as NoteImageFormat)}>
                <SelectTrigger className="font-normal normal-case tracking-normal text-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="png">PNG · {t("editor.imageShare.pngHint")}</SelectItem>
                  <SelectItem value="jpeg">JPEG · {t("editor.imageShare.jpegHint")}</SelectItem>
                </SelectContent>
              </Select>
            </label>

            {noticeKind !== "none" ? (
              <p className="text-xs leading-5 text-amber-700">
                {t(noticeKind === "partial" ? "editor.imageExport.imageEmbedPartial" : "editor.imageExport.imageEmbedFailed", prepared?.images)}
              </p>
            ) : null}
            {prepared && prepared.height > 12_000 ? (
              <p className="text-xs leading-5 text-amber-700">
                {t("editor.imageShare.longImageWarning")}
              </p>
            ) : null}
          </div>
        </div>

        <DialogFooter className="border-t border-slate-200 px-5 py-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button variant={canUseSystemShare ? "outline" : "solid"} disabled={!prepared} onClick={download}>
            <Download className="h-4 w-4" />
            {t("editor.imageShare.download")}
          </Button>
          {canUseSystemShare ? (
            <Button variant="solid" disabled={!prepared} onClick={() => void share()}>
              <Share2 className="h-4 w-4" />
              {t("editor.imageShare.share")}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
