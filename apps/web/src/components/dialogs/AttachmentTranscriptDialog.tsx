import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const AttachmentTranscriptDialog = ({
  open,
  filename,
  text,
  loading,
  error,
  canInsert,
  onOpenChange,
  onInsert,
}: {
  open: boolean;
  filename: string;
  text: string;
  loading: boolean;
  error: string | null;
  canInsert: boolean;
  onOpenChange: (open: boolean) => void;
  onInsert: () => void;
}) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("speechTranscription.resultTitle")}</DialogTitle>
        </DialogHeader>
        <p className="break-all text-xs text-slate-500">{filename}</p>
        {loading ? <p className="text-sm" role="status">{t("speechTranscription.recognizing")}</p> : null}
        {error ? <p className="text-sm text-rose-600" role="alert">{error}</p> : null}
        {text ? (
          <>
            <p className="text-xs text-slate-500">{t("speechTranscription.attachmentNotice")}</p>
            <textarea className="max-h-[45vh] min-h-48 w-full resize-y rounded-md border border-slate-200 bg-card p-3 text-sm" readOnly value={text} aria-label={t("speechTranscription.resultTitle")} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={async () => {
                await navigator.clipboard.writeText(text);
                setCopied(true);
              }}>{t(copied ? "speechTranscription.copied" : "speechTranscription.copy")}</Button>
              {canInsert ? <Button type="button" onClick={onInsert}>{t("speechTranscription.insertIntoNote")}</Button> : null}
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};
