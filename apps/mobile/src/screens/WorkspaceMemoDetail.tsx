import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { resolveMemoContentMarkdown, type MemoDetail } from "@edgeever/shared";
import { ActivityIndicator, Platform, StyleSheet, View } from "react-native";
import { Modal } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { ChevronLeft, ChevronRight, History, MoreHorizontal, Pencil, RotateCcw, Search, Share2, Trash2, X } from "../components/icons";
import { Alert, Pressable, Text, TextInput } from "../components/LocalizedText";
import { MobileResourceActions } from "../components/MobileResourceActions";
import {
  openMobileResource,
  saveMobileResourceAs,
  type MobileResourceTarget,
} from "../lib/mobile-attachments";
import { SAFE_DOM_WEBVIEW_PROPS } from "../lib/mobile-dom";
import { buildMemoDetailHtml } from "../lib/mobile-markdown-html";
import { useMobileLocale } from "../lib/mobile-locale";
import { useMobileTheme } from "../lib/mobile-theme";
import { useSession } from "../lib/session";
import { beginEditorStartup } from "../lib/startup-performance";
import type { MobileSyncQueueItem } from "../lib/sync-queue";
import { getTextSearchMatches } from "./workspace-utils";
import { styles } from "./workspace-styles";

const ANDROID_SYSTEM_NAVIGATION_FALLBACK = 48;
const DEFAULT_MEMO_TITLE = "无标题笔记";

const DetailActionSheetItem = ({ danger = false, disabled = false, icon, label, onPress }: { danger?: boolean; disabled?: boolean; icon: ReactNode; label: string; onPress: () => void }) => (
  <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.actionSheetItem, disabled && styles.buttonDisabled]}>
    {icon}
    <Text style={[styles.actionSheetItemText, danger && styles.actionSheetItemTextDanger]}>{label}</Text>
  </Pressable>
);

const DetailActionButton = ({ children, disabled = false, label, onPress }: { children: ReactNode; disabled?: boolean; label: string; onPress: () => void }) => (
  <Pressable disabled={disabled} onPress={onPress} style={[styles.actionButton, disabled && styles.buttonDisabled]}>
    {children}
    <Text style={styles.actionButtonText}>{label}</Text>
  </Pressable>
);

export const MemoDetailModal = ({
  isDeleting,
  isLoading,
  isRestoring,
  isSaving,
  isSharing,
  memo,
  notebookName,
  onAdoptCloudVersion,
  onClose,
  onCopyLocalDraft,
  onDelete,
  onDeleteResource,
  onRichEdit,
  onOpenRevisions,
  onRenameResource,
  onResolveSyncConflict,
  onRestore,
  onShare,
  syncStatus,
  visible,
}: {
  isDeleting: boolean;
  isLoading: boolean;
  isRestoring: boolean;
  isSaving: boolean;
  isSharing: boolean;
  memo: MemoDetail | null;
  notebookName: string;
  onAdoptCloudVersion: (memo: MemoDetail) => void;
  onClose: () => void;
  onCopyLocalDraft: (memo: MemoDetail) => void;
  onDelete: (memo: MemoDetail) => void;
  onDeleteResource: (memo: MemoDetail, target: MobileResourceTarget) => Promise<void>;
  onRichEdit: (memo: MemoDetail) => void;
  onOpenRevisions: (memo: MemoDetail) => void;
  onRenameResource: (memo: MemoDetail, target: MobileResourceTarget, filename: string) => Promise<void>;
  onResolveSyncConflict: (memo: MemoDetail) => void;
  onRestore: (memo: MemoDetail) => void;
  onShare: (memo: MemoDetail) => void;
  syncStatus: MobileSyncQueueItem["status"] | null;
  visible: boolean;
}) => {
  const { client } = useSession();
  const { resolvedTheme } = useMobileTheme();
  const { resolvedLocale } = useMobileLocale();
  const safeAreaInsets = useSafeAreaInsets();
  const [actionsOpen, setActionsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [resourceTarget, setResourceTarget] = useState<MobileResourceTarget | null>(null);
  const [bodyReady, setBodyReady] = useState(false);
  const downloadResource = useCallback(async (target: MobileResourceTarget) => {
    if (!client) throw new Error(resolvedLocale === "en-US" ? "The resource client is unavailable." : "当前无法读取资源。");
    try {
      await openMobileResource(client, target);
    } catch (error) {
      Alert.alert(
        resolvedLocale === "en-US" ? "Unable to open resource" : "无法打开资源",
        error instanceof Error ? error.message : (resolvedLocale === "en-US" ? "Try again later." : "请稍后重试。")
      );
      throw error;
    }
  }, [client, resolvedLocale]);
  const saveResourceAs = useCallback(async (target: MobileResourceTarget) => {
    if (!client) throw new Error(resolvedLocale === "en-US" ? "The resource client is unavailable." : "当前无法读取资源。");
    const result = await saveMobileResourceAs(client, target);
    if (result.kind === "saf") {
      Alert.alert(
        resolvedLocale === "en-US" ? "Downloaded" : "下载成功",
        resolvedLocale === "en-US" ? `Saved ${result.filename}` : `已保存：${result.filename}`
      );
    }
  }, [client, resolvedLocale]);

  // HTML in a JS-disabled WebView: full markdown (tables/bold/etc.) without Fabric
  // ParagraphShadowNode / AttributedString measure crashes on iPadOS 26.5.
  // Not Expo Dom TipTap — static HTML only + media capture denied.
  const detailText = memo
    ? resolveMemoContentMarkdown(memo.contentJson, memo.contentMarkdown) || memo.contentText || "没有正文内容"
    : "没有正文内容";
  const detailHtml = useMemo(
    () => buildMemoDetailHtml(detailText, resolvedTheme, {
      notebookName,
      tags: memo?.tags,
      title: memo?.title?.trim() || DEFAULT_MEMO_TITLE,
    }),
    [detailText, memo?.tags, memo?.title, notebookName, resolvedTheme]
  );
  const searchMatches = useMemo(() => getTextSearchMatches(detailText, searchQuery), [detailText, searchQuery]);
  // Unmount WebView as soon as the modal hides so teardown does not race Me tab layout.
  const showBodyWebView = Boolean(visible && memo && !isLoading);
  // Close search host when leaving the memo so no TextInput is measured during dismiss.
  useEffect(() => {
    if (!visible) {
      setSearchOpen(false);
      setSearchQuery("");
    }
  }, [visible]);
  const searchMatchLabel = searchQuery.trim() ? `${searchMatches.length > 0 ? activeMatchIndex + 1 : 0}/${searchMatches.length}` : "0/0";
  const syncStatusLabel = isSaving || syncStatus === "syncing"
    ? "保存中"
    : syncStatus === "conflict"
      ? "同步冲突"
      : syncStatus === "error"
        ? "同步失败"
        : syncStatus === "pending"
          ? "待同步"
          : "已同步";
  const editFabBottom = Math.max(
    safeAreaInsets.bottom,
    Platform.OS === "android" ? ANDROID_SYSTEM_NAVIGATION_FALLBACK : 0
  ) + 16;

  useEffect(() => {
    setActiveMatchIndex(0);
  }, [detailText, searchQuery]);

  useEffect(() => {
    setBodyReady(false);
  }, [memo?.id]);

  const moveSearchMatch = (direction: 1 | -1) => {
    if (searchMatches.length === 0) {
      return;
    }

    setActiveMatchIndex((current) => (current + direction + searchMatches.length) % searchMatches.length);
  };

  const closeActionsAndRun = (action: () => void) => {
    setActionsOpen(false);
    action();
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen" visible={visible}>
      <SafeAreaView style={styles.modalSafeArea}>
        <View style={styles.detailHeader}>
          <Pressable accessibilityLabel="返回列表" accessibilityRole="button" onPress={onClose} style={styles.detailHeaderButton}>
            <ChevronLeft color="#475569" size={21} />
          </Pressable>
          <View style={styles.detailHeaderActions}>
            <Pressable
              accessibilityHint={syncStatus === "conflict" ? "查看并处理同步冲突" : undefined}
              accessibilityLabel={syncStatusLabel}
              accessibilityRole={syncStatus === "conflict" ? "button" : "text"}
              disabled={syncStatus !== "conflict" || !memo}
              onPress={() => memo && onResolveSyncConflict(memo)}
            >
              <Text
                numberOfLines={1}
                style={[styles.detailSyncStatus, syncStatus === "conflict" && styles.detailSyncStatusConflict]}
              >
                {syncStatusLabel}
              </Text>
            </Pressable>
            {memo && !memo.isDeleted ? (
              <Pressable
                accessibilityLabel="分享笔记"
                accessibilityRole="button"
                disabled={isSharing}
                onPress={() => onShare(memo)}
                style={[styles.detailHeaderIconButton, isSharing && styles.buttonDisabled]}
              >
                {isSharing ? <ActivityIndicator color="#475569" size="small" /> : <Share2 color="#475569" size={20} />}
              </Pressable>
            ) : null}
            {memo && !memo.isDeleted ? (
              <Pressable
                accessibilityLabel="版本历史"
                accessibilityRole="button"
                onPress={() => onOpenRevisions(memo)}
                style={styles.detailHeaderIconButton}
              >
                <History color="#475569" size={20} />
              </Pressable>
            ) : null}
            {memo && !memo.isDeleted ? (
              <Pressable
                accessibilityLabel="搜索当前笔记"
                accessibilityRole="button"
                onPress={() => setSearchOpen(true)}
                style={styles.detailHeaderIconButton}
              >
                <Search color="#475569" size={20} />
              </Pressable>
            ) : null}
            {memo?.isDeleted ? (
              <Pressable accessibilityLabel="笔记操作" accessibilityRole="button" onPress={() => setActionsOpen(true)} style={styles.detailHeaderIconButton}>
                <MoreHorizontal color="#475569" size={21} />
              </Pressable>
            ) : null}
          </View>
        </View>

        {syncStatus === "conflict" && memo ? (
          <View style={styles.conflictBanner}>
            <Text style={styles.conflictBannerText}>
              云端笔记已在其他标签页、设备，或离线期间被更新。可先复制本地草稿，再采用云端版本后继续编辑。
            </Text>
            <View style={styles.conflictBannerActions}>
              <Pressable
                accessibilityLabel="采用云端并重新加载"
                accessibilityRole="button"
                onPress={() => onAdoptCloudVersion(memo)}
                style={styles.conflictBannerPrimaryButton}
              >
                <Text style={styles.conflictBannerPrimaryButtonText}>采用云端并重新加载</Text>
              </Pressable>
              <Pressable
                accessibilityLabel="复制本地草稿"
                accessibilityRole="button"
                onPress={() => onCopyLocalDraft(memo)}
                style={styles.conflictBannerSecondaryButton}
              >
                <Text style={styles.conflictBannerSecondaryButtonText}>复制本地草稿</Text>
              </Pressable>
              <Pressable
                accessibilityLabel="查看并处理同步冲突"
                accessibilityRole="button"
                onPress={() => onResolveSyncConflict(memo)}
                style={styles.conflictBannerSecondaryButton}
              >
                <Text style={styles.conflictBannerSecondaryButtonText}>更多</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color="#0f172a" />
          </View>
        ) : memo ? (
          <View style={detailBodyStyles.container}>
            {searchOpen ? (
              <View style={[styles.noteSearchPanel, detailBodyStyles.searchPanel]}>
                <View style={styles.searchBox}>
                  <Search color="#64748b" size={18} />
                  <TextInput
                    accessibilityLabel="在当前笔记内搜索"
                    autoCapitalize="none"
                    autoCorrect={false}
                    onChangeText={setSearchQuery}
                    placeholder="在当前笔记内搜索"
                    placeholderTextColor="#94a3b8"
                    style={styles.searchInput}
                    value={searchQuery}
                  />
                  <Text style={[styles.noteSearchCount, searchQuery.trim() && searchMatches.length === 0 && styles.noteSearchCountEmpty]}>{searchMatchLabel}</Text>
                </View>
                <View style={styles.richEditorSearchActions}>
                  <DetailActionButton disabled={searchMatches.length === 0} label="上一个搜索结果" onPress={() => moveSearchMatch(-1)}>
                    <ChevronLeft color={searchMatches.length === 0 ? "#cbd5e1" : "#0f172a"} size={16} />
                  </DetailActionButton>
                  <DetailActionButton disabled={searchMatches.length === 0} label="下一个搜索结果" onPress={() => moveSearchMatch(1)}>
                    <ChevronRight color={searchMatches.length === 0 ? "#cbd5e1" : "#0f172a"} size={16} />
                  </DetailActionButton>
                  <DetailActionButton label="关闭搜索" onPress={() => {
                    setSearchOpen(false);
                    setSearchQuery("");
                  }}>
                    <X color="#0f172a" size={16} />
                  </DetailActionButton>
                </View>
              </View>
            ) : null}
            <View style={[detailBodyStyles.webHost, resolvedTheme === "dark" ? detailBodyStyles.webHostDark : null]}>
              {showBodyWebView ? (
                <WebView
                  key={memo.id}
                  {...SAFE_DOM_WEBVIEW_PROPS}
                  allowsLinkPreview={false}
                  // Static HTML only — no JS reduces hang/TCC surface vs Dom TipTap.
                  domStorageEnabled={false}
                  javaScriptEnabled={false}
                  onLoadEnd={() => setBodyReady(true)}
                  originWhitelist={["*"]}
                  setSupportMultipleWindows={false}
                  source={{ html: detailHtml }}
                  style={[detailBodyStyles.webView, !bodyReady && detailBodyStyles.webViewHidden]}
                />
              ) : null}
              {bodyReady ? null : (
                <View pointerEvents="none" style={detailBodyStyles.loadingOverlay}>
                  <ActivityIndicator color="#0f172a" />
                </View>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.centerState}>
            <Text style={styles.errorText}>笔记加载失败</Text>
          </View>
        )}
        {memo && !memo.isDeleted ? (
          <Pressable
            accessibilityLabel="编辑笔记"
            accessibilityRole="button"
            onPress={() => {
              beginEditorStartup();
              onRichEdit(memo);
            }}
            style={[styles.detailEditFab, { bottom: editFabBottom }]}
          >
            <Pencil color="#ffffff" size={20} />
          </Pressable>
        ) : null}
        {memo?.isDeleted ? (
          <Modal animationType="fade" onRequestClose={() => setActionsOpen(false)} transparent visible={actionsOpen}>
            <Pressable onPress={() => setActionsOpen(false)} style={styles.actionSheetBackdrop}>
              <Pressable style={styles.actionSheet}>
                <View style={styles.actionSheetHandle} />
                <Text style={styles.actionSheetTitle}>笔记操作</Text>
                <DetailActionSheetItem icon={<Search color="#0f172a" size={18} />} label="搜索当前笔记" onPress={() => closeActionsAndRun(() => {
                  setSearchOpen(true);
                })} />
                <DetailActionSheetItem icon={<History color="#0f172a" size={18} />} label="版本历史" onPress={() => closeActionsAndRun(() => onOpenRevisions(memo))} />
                <DetailActionSheetItem disabled={isRestoring} icon={<RotateCcw color="#0f172a" size={18} />} label={isRestoring ? "恢复中" : "恢复笔记"} onPress={() => closeActionsAndRun(() => onRestore(memo))} />
                <View style={styles.listActionDivider} />
                <DetailActionSheetItem danger disabled={isDeleting} icon={<Trash2 color="#b91c1c" size={18} />} label={isDeleting ? "删除中" : "彻底删除"} onPress={() => closeActionsAndRun(() => onDelete(memo))} />
              </Pressable>
            </Pressable>
          </Modal>
        ) : null}
        <MobileResourceActions
          canMutate={Boolean(memo && !memo.isDeleted && !memo.id.startsWith("local:"))}
          onClose={() => setResourceTarget(null)}
          onDelete={async (target) => {
            if (!memo) return;
            await onDeleteResource(memo, target);
          }}
          onDownload={downloadResource}
          onRename={async (target, filename) => {
            if (!memo) return;
            await onRenameResource(memo, target, filename);
          }}
          onSaveAs={saveResourceAs}
          target={resourceTarget}
        />
      </SafeAreaView>
    </Modal>
  );
};

const detailBodyStyles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.72)",
    justifyContent: "center",
  },
  searchPanel: {
    marginHorizontal: 16,
    marginTop: 8,
  },
  webHost: {
    backgroundColor: "#ffffff",
    flex: 1,
    minHeight: 0,
  },
  webHostDark: {
    backgroundColor: "#0f172a",
  },
  webView: {
    backgroundColor: "transparent",
    flex: 1,
  },
  webViewHidden: {
    opacity: 0,
  },
});

