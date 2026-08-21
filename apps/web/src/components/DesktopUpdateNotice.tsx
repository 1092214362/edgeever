import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, LoaderCircle, RotateCcw, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

type DesktopUpdateState = "idle" | "available" | "downloaded";

const UPDATE_STATUS_QUERY_KEY = ["desktop-update-status"] as const;

export const DesktopUpdateNotice = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const bridge = window.edgeeverDesktop;
  const [dismissedState, setDismissedState] = useState<DesktopUpdateState | null>(null);

  const statusQuery = useQuery({
    queryKey: UPDATE_STATUS_QUERY_KEY,
    queryFn: () => bridge!.updateStatus(),
    enabled: bridge?.isAvailable === true,
    refetchInterval: 5_000,
    retry: 1,
  });
  const downloadMutation = useMutation({
    mutationFn: () => bridge!.downloadUpdate(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: UPDATE_STATUS_QUERY_KEY });
    },
  });
  const installMutation = useMutation({
    mutationFn: () => bridge!.installUpdate(),
  });

  const updateState = statusQuery.data?.state ?? "idle";
  const visible = bridge?.isAvailable === true && updateState !== "idle" && dismissedState !== updateState;
  if (!visible) return null;

  const downloaded = updateState === "downloaded";
  const downloading = downloadMutation.isPending;
  const failed = downloadMutation.isError || installMutation.isError;

  return (
    <div
      className="fixed bottom-5 right-5 z-[90] w-[min(22rem,calc(100vw-2rem))] animate-in slide-in-from-bottom-3 fade-in rounded-lg border border-emerald-200 bg-white/95 p-3 text-slate-900 shadow-[0_18px_48px_rgba(15,23,42,0.18)] backdrop-blur duration-300"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700" aria-hidden="true">
          {downloading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : downloaded ? <RotateCcw className="h-4 w-4" /> : <Download className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold leading-5">
            {t(downloaded ? "systemInfo.desktopUpdateReadyTitle" : "systemInfo.desktopUpdateAvailableTitle")}
          </div>
          <div className="mt-0.5 text-xs leading-5 text-slate-500">
            {t(downloaded ? "systemInfo.desktopUpdateReadyDescription" : "systemInfo.desktopUpdateAvailableDescription")}
          </div>
          {failed ? <div className="mt-1 text-xs font-medium text-rose-700" role="alert">{t("systemInfo.desktopUpdateFailed")}</div> : null}
          <Button
            className="mt-2"
            size="sm"
            variant="solid"
            disabled={downloading || installMutation.isPending}
            onClick={() => downloaded ? installMutation.mutate() : downloadMutation.mutate()}
          >
            {downloading
              ? t("systemInfo.desktopUpdateDownloading")
              : t(downloaded ? "systemInfo.desktopUpdateRestart" : "systemInfo.desktopUpdateDownload")}
          </Button>
        </div>
        <button
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70"
          type="button"
          aria-label={t("common.close")}
          onClick={() => setDismissedState(updateState)}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
