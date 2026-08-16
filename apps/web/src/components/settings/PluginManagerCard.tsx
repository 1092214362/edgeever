import { useEffect, useState, useSyncExternalStore } from "react";
import { BadgeCheck, Boxes, Download, ExternalLink, PanelRightOpen, Play, Puzzle, RefreshCw, Store, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { EdgeEverPluginHost, RegisteredPluginPanel } from "@/lib/plugins/plugin-host";
import { PluginPanelDialog } from "@/components/plugins/PluginPanelDialog";
import { loadPluginMarketplace } from "@/lib/plugins/plugin-marketplace";
import { GitHubMark } from "@/components/GitHubRepositoryLink";

const permissionLabel = (permission: string) => permission.replace(":", " · ");

export const PluginManagerCard = ({ host }: { host: EdgeEverPluginHost }) => {
  const { t } = useTranslation();
  const snapshot = useSyncExternalStore(host.subscribe, host.getSnapshot, host.getSnapshot);
  const [manifestUrl, setManifestUrl] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<RegisteredPluginPanel | null>(null);
  const marketplaceQuery = useQuery({ queryKey: ["plugin-marketplace", "v1"], queryFn: () => loadPluginMarketplace(), staleTime: 5 * 60_000 });
  const activePanelPluginId = activePanel?.pluginId ?? null;
  const activePanelId = activePanel?.id ?? null;
  const activePanelRegistered = Boolean(activePanelPluginId && activePanelId && snapshot.panels.some(
    (panel) => panel.pluginId === activePanelPluginId && panel.id === activePanelId
  ));

  useEffect(() => {
    if (activePanelId && activePanelPluginId && !activePanelRegistered) setActivePanel(null);
  }, [activePanelId, activePanelPluginId, activePanelRegistered]);

  const install = async () => {
    if (!manifestUrl.trim()) return;
    setInstalling(true);
    setError(null);
    try {
      await host.installFromSource(manifestUrl.trim());
      setManifestUrl("");
    } catch (installError) {
      setError(installError instanceof Error ? installError.message : String(installError));
    } finally {
      setInstalling(false);
    }
  };

  const run = async (actionId: string, action: () => Promise<void>) => {
    setPendingId(actionId);
    setError(null);
    try {
      await action();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    } finally {
      setPendingId(null);
    }
  };

  return (
    <Card className="w-full min-w-0 shadow-none">
      <CardHeader className="p-4 sm:p-5">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Puzzle className="h-4 w-4 text-emerald-700" />
          {t("plugins.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 p-4 pt-0 sm:px-5 sm:pb-5">
        <section className="grid gap-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Store className="h-4 w-4 text-emerald-700" />
                {t("plugins.marketplace.title")}
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500">{t("plugins.marketplace.description")}</p>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0"
              aria-label={t("plugins.marketplace.refresh")}
              disabled={marketplaceQuery.isFetching}
              onClick={() => void marketplaceQuery.refetch()}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${marketplaceQuery.isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>

          {marketplaceQuery.isLoading ? (
            <div className="py-4 text-center text-xs text-slate-500">{t("plugins.marketplace.loading")}</div>
          ) : marketplaceQuery.error ? (
            <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
              {marketplaceQuery.error instanceof Error ? marketplaceQuery.error.message : String(marketplaceQuery.error)}
            </div>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {(marketplaceQuery.data?.entries ?? []).map((entry) => {
                const installed = snapshot.extensions.find((extension) => extension.manifest.id === entry.id);
                const currentVerified = installed?.source.verified && installed.manifest.version === entry.verification.version;
                const actionId = `marketplace:${entry.id}`;
                return (
                  <article key={entry.id} className="flex min-w-0 flex-col rounded-lg border border-emerald-100 bg-white p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-semibold text-slate-900">{entry.name}</span>
                          <BadgeCheck className="h-4 w-4 shrink-0 text-emerald-600" aria-label={t("plugins.marketplace.verified")} />
                        </div>
                        <div className="mt-0.5 text-[10px] text-slate-400">{entry.author} · {entry.category} · v{entry.verification.version}</div>
                      </div>
                      <a
                        href={entry.repositoryUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70"
                        aria-label={t("plugins.marketplace.openRepository", { name: entry.name })}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{entry.description}</p>
                    <Button
                      size="sm"
                      variant={currentVerified ? "soft" : "outline"}
                      className="mt-3 h-8 gap-1.5 text-xs"
                      disabled={Boolean(currentVerified) || pendingId === actionId}
                      onClick={() => void run(actionId, async () => { await host.installMarketplaceEntry(entry); })}
                    >
                      <Download className="h-3.5 w-3.5" />
                      {pendingId === actionId
                        ? t("plugins.installing")
                        : currentVerified
                          ? t("plugins.marketplace.installed")
                          : installed
                            ? t("plugins.marketplace.installVerified")
                            : t("plugins.install")}
                    </Button>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            aria-label={t("plugins.installSource")}
            value={manifestUrl}
            onChange={(event) => setManifestUrl(event.target.value)}
            placeholder={t("plugins.sourcePlaceholder")}
          />
          <Button className="gap-1.5 sm:shrink-0" disabled={installing || !manifestUrl.trim()} onClick={() => void install()}>
            <Download className="h-4 w-4" />
            {installing ? t("plugins.installing") : t("plugins.install")}
          </Button>
        </div>

        {error ? <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</div> : null}

        {snapshot.extensions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 p-5 text-center text-xs text-slate-500">
            {t("plugins.empty")}
          </div>
        ) : (
          <div className="grid gap-2">
            {snapshot.extensions.map((extension) => {
              const id = extension.manifest.id;
              const commands = snapshot.commands.filter((command) => command.pluginId === id);
              const panels = snapshot.panels.filter((panel) => panel.pluginId === id);
              return (
                <section key={id} className="rounded-lg border border-slate-200 bg-white p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold text-slate-900">{extension.manifest.name}</span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          {extension.manifest.type}
                        </span>
                        <span className="text-[11px] text-slate-400">v{extension.manifest.version}</span>
                        <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] ${extension.source.verified ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                          {extension.source.verified ? <BadgeCheck className="h-3 w-3" /> : extension.source.kind === "github" ? <GitHubMark className="h-3 w-3" /> : null}
                          {t(`plugins.sources.${extension.source.verified ? "verified" : extension.source.kind}`)}
                        </span>
                      </div>
                      {extension.manifest.description ? <p className="mt-1 text-xs leading-5 text-slate-500">{extension.manifest.description}</p> : null}
                      {extension.source.repositoryUrl ? (
                        <a className="mt-1 inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-emerald-700" href={extension.source.repositoryUrl} target="_blank" rel="noreferrer">
                          <GitHubMark className="h-3 w-3" />
                          {extension.source.repositoryUrl.replace("https://github.com/", "")}
                        </a>
                      ) : null}
                    </div>
                    <Switch
                      aria-label={t("plugins.toggle", { name: extension.manifest.name })}
                      checked={extension.enabled}
                      disabled={pendingId === id}
                      onCheckedChange={(enabled) => void run(id, () => host.setEnabled(id, enabled))}
                    />
                  </div>

                  {extension.manifest.type === "plugin" && extension.manifest.permissions.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {extension.manifest.permissions.map((permission) => (
                        <span key={permission} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                          {permissionLabel(permission)}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {extension.error ? <div className="mt-2 text-xs text-rose-600">{extension.error}</div> : null}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {commands.map((command) => (
                      <Button
                        key={command.id}
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 text-xs"
                        disabled={pendingId === `${id}:${command.id}`}
                        onClick={() => void run(`${id}:${command.id}`, () => host.runCommand(id, command.id))}
                      >
                        <Play className="h-3.5 w-3.5" />
                        {command.title}
                      </Button>
                    ))}
                    {panels.map((panel) => (
                      <Button
                        key={panel.id}
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 text-xs"
                        onClick={() => setActivePanel(panel)}
                      >
                        <PanelRightOpen className="h-3.5 w-3.5" />
                        {panel.title}
                      </Button>
                    ))}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto h-8 gap-1.5 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                      disabled={pendingId === `remove:${id}`}
                      onClick={() => void run(`remove:${id}`, () => host.uninstall(id))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {t("plugins.uninstall")}
                    </Button>
                  </div>
                </section>
              );
            })}
          </div>
        )}

        <div className="flex items-start gap-2 rounded-lg bg-slate-100 p-3 text-xs leading-5 text-slate-600">
          <Boxes className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <span>{t("plugins.localOnly")}</span>
        </div>
        <PluginPanelDialog host={host} panel={activePanel} onClose={() => setActivePanel(null)} />
      </CardContent>
    </Card>
  );
};
