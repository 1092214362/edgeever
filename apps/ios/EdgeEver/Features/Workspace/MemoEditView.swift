import PhotosUI
import SwiftUI

enum MemoEditMode: Equatable {
    case create(notebookId: String)
    case edit(memoId: String)
}

/// Android CreateMemoModal / rich-edit shell parity (createMemo* tokens).
struct MemoEditView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss

    let mode: MemoEditMode

    @State private var title = ""
    @State private var tagsText = ""
    @State private var notebookId = ""
    @State private var contentMarkdown = ""
    @State private var contentJSON = "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\"}]}"
    @State private var expectedRevision: Int?
    @State private var expectedContentHash: String?
    @State private var memoId: String?
    @State private var error: String?
    @State private var saveTask: Task<Void, Never>?
    @State private var photoItem: PhotosPickerItem?
    @State private var isMaterializing = false
    @State private var isDirty = false
    @State private var isSaving = false
    @State private var isCreating = false
    @State private var isUploading = false
    @State private var editorReady = false
    /// False until `loadInitial` has filled title/body from mirror — prevents TipTap boot
    /// with empty defaults from overwriting a non-empty note via autosave / flush.
    @State private var contentHydrated = false
    /// Snapshot of body when edit opened (or last intentional load). Used to reject empty clobbers.
    @State private var baselineMarkdown = ""
    @State private var showNotebookPicker = false
    @State private var resourceTarget: ResourceTarget?

    var body: some View {
        VStack(spacing: 0) {
            createHeader
            createMain
        }
        .background(Color.white.ignoresSafeArea())
        .accessibilityIdentifier(CreateMemoChrome.root)
        .sheet(isPresented: $showNotebookPicker) {
            EditNotebookPickerSheet(
                notebooks: availableNotebooks,
                selectedId: notebookId
            ) { id in
                notebookId = id
                markDirtyAndScheduleSave()
                showNotebookPicker = false
            }
            .presentationDetents([.medium, .large])
        }
        .sheet(item: $resourceTarget) { target in
            ResourceActionSheet(
                target: target,
                canMutate: {
                    if case .edit(let id) = mode { return !id.hasPrefix("local:") }
                    return false
                }(),
                onContentChanged: {
                    Task { await reloadAfterResourceChange() }
                }
            )
            .presentationDetents([.height(360), .medium])
            .presentationDragIndicator(.hidden)
        }
        .onChange(of: photoItem) { _, item in
            guard let item else { return }
            Task { await insertImage(item) }
        }
        .task {
            await loadInitial()
            contentHydrated = true
            // editorReady flips true from TipTap onBodyReady (or fallback below).
            try? await Task.sleep(nanoseconds: 800_000_000)
            if !Task.isCancelled, !editorReady {
                editorReady = true
                // One open-edit focus only (SharedTipTapRuntime also focuses once per document).
                SharedTipTapRuntime.editor.focusEnd()
            }
        }
        .onDisappear {
            saveTask?.cancel()
            // Only flush real user edits — never push the empty pre-hydrate state.
            if !isCreate, isDirty, contentHydrated {
                Task { await flushPending() }
            }
        }
        .preferredColorScheme(env.preferences.colorScheme)
    }

    // MARK: - Header (createMemoHeader)

    private var createHeader: some View {
        HStack(spacing: 8) {
            Button {
                Task { await handleBack() }
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(busyChrome ? AppTheme.muted : AppTheme.title)
                    .frame(width: 38, height: 38)
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .disabled(busyChrome)
            .accessibilityLabel(env.preferences.t("返回", en: "Back"))
            .accessibilityIdentifier(CreateMemoChrome.back)

            Spacer(minLength: 0)

            HStack(spacing: 8) {
                Text(statusLabel)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(saveStatus.isActive ? AppTheme.accentStrong : AppTheme.secondary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(saveStatus.isActive ? AppTheme.accentSoft : AppTheme.searchFill)
                    .clipShape(Capsule())
                    .lineLimit(1)
                    .accessibilityIdentifier(CreateMemoChrome.status)

                Button {
                    Task { await handleDone() }
                } label: {
                    Group {
                        if isCreating || isSaving && isCreate {
                            ProgressView()
                                .controlSize(.small)
                                .tint(AppTheme.secondary)
                        } else {
                            Text(env.preferences.t("完成", en: "Done"))
                                .font(.system(size: 14, weight: .bold))
                                .foregroundStyle(canSubmitDone ? Color.white : AppTheme.secondary)
                        }
                    }
                    .frame(minWidth: 58, minHeight: 36)
                    .padding(.horizontal, 12)
                    .background(canSubmitDone ? AppTheme.title : Color(hex: 0xE2E8F0))
                    .clipShape(Capsule())
                }
                .buttonStyle(.plain)
                .disabled(!canSubmitDone)
                .accessibilityLabel(env.preferences.t("完成", en: "Done"))
                .accessibilityIdentifier(CreateMemoChrome.done)
            }
            .accessibilityIdentifier(CreateMemoChrome.header)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(minHeight: 52)
        .background(Color.white)
        .overlay(alignment: .bottom) {
            Rectangle().fill(AppTheme.cardBorder).frame(height: 1)
        }
        .accessibilityIdentifier(CreateMemoChrome.header)
    }

    // MARK: - Main (createMemoMain)

    private var createMain: some View {
        VStack(alignment: .leading, spacing: 0) {
            TextField(
                env.preferences.t("无标题笔记", en: "Untitled note"),
                text: $title
            )
            .font(.system(size: 28, weight: .heavy))
            .foregroundStyle(AppTheme.title)
            .textFieldStyle(.plain)
            .padding(.top, 14)
            .padding(.bottom, 8)
            .onChange(of: title) { _, _ in markDirtyAndScheduleSave() }
            .accessibilityLabel(env.preferences.t("笔记标题", en: "Note title"))
            .accessibilityIdentifier(CreateMemoChrome.title)

            HStack(spacing: 10) {
                Button {
                    showNotebookPicker = true
                } label: {
                    HStack(spacing: 3) {
                        Text(selectedNotebookName)
                            .font(.system(size: 15, weight: .bold))
                            .foregroundStyle(AppTheme.secondary)
                            .lineLimit(1)
                        Image(systemName: "chevron.down")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(AppTheme.secondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.plain)
                .frame(maxWidth: 160, alignment: .leading)
                .frame(minHeight: 30)
                .layoutPriority(1)
                .accessibilityLabel(env.preferences.t("所在笔记本", en: "Notebook"))
                .accessibilityIdentifier(CreateMemoChrome.notebook)

                TextField(
                    env.preferences.t("添加标签，用逗号分隔", en: "Add tags, comma separated"),
                    text: $tagsText
                )
                .font(.system(size: 15))
                .foregroundStyle(AppTheme.secondary)
                .textFieldStyle(.plain)
                .frame(minHeight: 36)
                .onChange(of: tagsText) { _, _ in markDirtyAndScheduleSave() }
                .accessibilityLabel(env.preferences.t("笔记标签", en: "Tags"))
                .accessibilityIdentifier(CreateMemoChrome.tags)

                PhotosPicker(selection: $photoItem, matching: .images) {
                    Image(systemName: "photo")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(AppTheme.slate)
                        .frame(width: 36, height: 32)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(env.preferences.t("插入图片", en: "Insert image"))
                .accessibilityIdentifier(CreateMemoChrome.imageTool)
            }
            .frame(minHeight: 40)
            .accessibilityIdentifier(CreateMemoChrome.metaRow)

            ZStack {
                // Mount TipTap only after local body is loaded — shared WebView must not
                // receive empty defaults first (that used to autosave-wipe demo notes).
                if contentHydrated {
                    TipTapWebView(
                        mode: .editor,
                        documentJSON: contentJSON,
                        markdown: contentMarkdown,
                        baseURL: env.session.session.map { URL(string: $0.baseUrl) } ?? nil,
                        token: env.session.session?.token,
                        onChange: { md, json in
                            guard contentHydrated else { return }
                            contentMarkdown = md
                            contentJSON = json
                            markDirtyAndScheduleSave()
                        },
                        onResourcePress: { target in
                            resourceTarget = target
                        },
                        onImagePreview: nil,
                        onBodyReady: {
                            // Do not focusEnd here — bodyReady also fires on typing re-binds.
                            // Open-edit focus is owned by SharedTipTapRuntime (once per document).
                            editorReady = true
                        }
                    )
                    .opacity(1)
                }

                if !editorReady || !contentHydrated {
                    VStack(spacing: 10) {
                        ProgressView()
                            .tint(AppTheme.title)
                        Text(env.preferences.t("正在启动本地编辑器", en: "Starting local editor"))
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(AppTheme.secondary)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.white)
                    .allowsHitTesting(false)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .stroke(AppTheme.border, lineWidth: 1)
            )
            .padding(.top, 4)
            .padding(.horizontal, -4)
            .accessibilityIdentifier(CreateMemoChrome.editorFrame)

            if let error {
                Text(error)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(AppTheme.danger)
                    .padding(.top, 8)
            }
        }
        .padding(.horizontal, 12)
        .padding(.bottom, 8)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    // MARK: - Derived state

    private var isCreate: Bool {
        if case .create = mode { return true }
        return false
    }

    private var busyChrome: Bool {
        isCreating || isUploading
    }

    private var saveStatus: CreateSaveStatus {
        CreateSaveStatus.derive(
            editorReady: editorReady,
            isDirty: isDirty,
            isSaving: isSaving,
            isCreating: isCreating,
            isUploading: isUploading,
            hasError: error != nil
        )
    }

    private var statusLabel: String {
        env.preferences.isEnglish ? saveStatus.labelEN : saveStatus.labelZH
    }

    private var canSubmitDone: Bool {
        if isCreate {
            return !notebookId.isEmpty && !isCreating && !isUploading
        }
        return !isSaving && !isUploading && editorReady
    }

    private var availableNotebooks: [Notebook] {
        (try? env.mirror.listNotebooks(scope: env.session.dataScope ?? "")) ?? []
    }

    private var selectedNotebookName: String {
        if let name = availableNotebooks.first(where: { $0.id == notebookId })?.name {
            return name
        }
        return env.preferences.t("选择笔记本", en: "Choose notebook")
    }

    private var tags: [String] {
        tagsText
            .split(whereSeparator: { ",， ".contains($0) })
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }

    // MARK: - Actions

    private func markDirtyAndScheduleSave() {
        isDirty = true
        scheduleSave()
    }

    private func handleBack() async {
        if isCreate {
            // Draft retained; close without materialize (Android requestClose)
            dismiss()
        } else {
            await flushPending()
            dismiss()
        }
    }

    private func handleDone() async {
        if isCreate {
            await commitCreate()
        } else {
            await flushPending()
            dismiss()
        }
    }

    private func loadInitial() async {
        guard let scope = env.session.dataScope else { return }
        switch mode {
        case .create(let nb):
            notebookId = nb
            if let draft = try? env.drafts.read(scope: scope, key: DraftRepository.newKey) {
                title = draft.title
                tagsText = draft.tagsText
                contentMarkdown = draft.contentMarkdown
                contentJSON = draft.contentJson ?? contentJSON
                if !draft.notebookId.isEmpty { notebookId = draft.notebookId }
            }
            baselineMarkdown = contentMarkdown
        case .edit(let id):
            memoId = id
            // Prefer mirror body over a stale empty draft that could wipe the note.
            if let memo = try? env.mirror.resolveMemo(scope: scope, id: id) {
                title = memo.title ?? ""
                tagsText = memo.tags.joined(separator: ", ")
                contentMarkdown = memo.contentMarkdown
                contentJSON = (try? memo.contentJson.jsonString()) ?? contentJSON
                notebookId = memo.notebookId
                expectedRevision = memo.revision
                expectedContentHash = memo.contentHash
                memoId = memo.id
                // Overlay draft only when it still has body (or memo was already empty).
                if let draft = try? env.drafts.read(scope: scope, key: DraftRepository.memoKey(id)) {
                    let draftBody = draft.contentMarkdown.trimmingCharacters(in: .whitespacesAndNewlines)
                    let memoBody = memo.contentMarkdown.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !draftBody.isEmpty || memoBody.isEmpty {
                        title = draft.title
                        tagsText = draft.tagsText
                        contentMarkdown = draft.contentMarkdown
                        contentJSON = draft.contentJson ?? contentJSON
                        if !draft.notebookId.isEmpty { notebookId = draft.notebookId }
                        expectedRevision = draft.expectedRevision ?? expectedRevision
                    }
                }
            } else if let draft = try? env.drafts.read(scope: scope, key: DraftRepository.memoKey(id)) {
                title = draft.title
                tagsText = draft.tagsText
                contentMarkdown = draft.contentMarkdown
                contentJSON = draft.contentJson ?? contentJSON
                notebookId = draft.notebookId
                expectedRevision = draft.expectedRevision
            }
            baselineMarkdown = contentMarkdown
        }
    }

    /// After server-side rename/delete, pull the latest memo body into the editor.
    private func reloadAfterResourceChange() async {
        guard case .edit(let id) = mode, let scope = env.session.dataScope else { return }
        // Prefer live server copy when online.
        if let remote = try? await env.session.client.getMemo(id: id) {
            try? env.mirror.upsertMemo(scope: scope, memo: remote)
            title = remote.title ?? ""
            tagsText = remote.tags.joined(separator: ", ")
            contentMarkdown = remote.contentMarkdown
            contentJSON = (try? remote.contentJson.jsonString()) ?? contentJSON
            expectedRevision = remote.revision
            expectedContentHash = remote.contentHash
            baselineMarkdown = contentMarkdown
            return
        }
        if let memo = try? env.mirror.resolveMemo(scope: scope, id: id) {
            title = memo.title ?? ""
            tagsText = memo.tags.joined(separator: ", ")
            contentMarkdown = memo.contentMarkdown
            contentJSON = (try? memo.contentJson.jsonString()) ?? contentJSON
            expectedRevision = memo.revision
            expectedContentHash = memo.contentHash
            baselineMarkdown = contentMarkdown
        }
    }

    private func scheduleSave() {
        saveTask?.cancel()
        saveTask = Task {
            try? await Task.sleep(nanoseconds: 500_000_000)
            guard !Task.isCancelled else { return }
            await persistDraftOrQueue()
        }
    }

    /// Reject autosave that would wipe a non-empty note with an empty editor boot payload.
    private var wouldClobberNonEmptyBody: Bool {
        guard !isCreate else { return false }
        let next = contentMarkdown.trimmingCharacters(in: .whitespacesAndNewlines)
        let base = baselineMarkdown.trimmingCharacters(in: .whitespacesAndNewlines)
        return next.isEmpty && !base.isEmpty
    }

    private func persistDraftOrQueue() async {
        guard let scope = env.session.dataScope else { return }
        guard contentHydrated else { return }
        if wouldClobberNonEmptyBody {
            #if DEBUG
            NSLog("MemoEditView: skip persist — refusing empty clobber of non-empty baseline")
            #endif
            isDirty = false
            return
        }
        isSaving = true
        defer {
            isSaving = false
            isDirty = false
        }
        let now = EdgeEverDate.nowString()
        switch mode {
        case .create:
            try? env.drafts.write(
                scope: scope,
                draft: MemoDraft(
                    draftKey: DraftRepository.newKey,
                    title: title,
                    contentMarkdown: contentMarkdown,
                    contentJson: contentJSON,
                    notebookId: notebookId,
                    tagsText: tagsText,
                    expectedRevision: nil,
                    updatedAt: now
                )
            )
        case .edit:
            guard let memoId else { return }
            guard var memo = try? env.mirror.resolveMemo(scope: scope, id: memoId) else { return }
            memo.title = title
            memo.contentMarkdown = contentMarkdown
            memo.contentText = contentMarkdown
            memo.tags = tags
            memo.notebookId = notebookId
            memo.updatedAt = now
            memo.excerpt = String(contentMarkdown.prefix(160))
            if let json = try? JSONValue.parse(contentJSON) {
                memo.contentJson = json
            }
            try? env.mirror.upsertMemo(scope: scope, memo: memo)

            let rev = expectedRevision ?? memo.revision
            let hash = expectedContentHash ?? memo.contentHash
            try? env.outbox.enqueueUpdate(
                scope: scope,
                payload: MemoUpdatePayload(
                    memoId: memo.id,
                    expectedRevision: rev,
                    expectedContentHash: hash,
                    title: title,
                    contentMarkdown: contentMarkdown,
                    notebookId: notebookId,
                    tags: tags
                )
            )
            try? env.drafts.write(
                scope: scope,
                draft: MemoDraft(
                    draftKey: DraftRepository.memoKey(memo.id),
                    title: title,
                    contentMarkdown: contentMarkdown,
                    contentJson: contentJSON,
                    notebookId: notebookId,
                    tagsText: tagsText,
                    expectedRevision: rev,
                    updatedAt: now
                )
            )
            Task { await env.runSyncCycle() }
        }
    }

    private func commitCreate() async {
        guard let scope = env.session.dataScope else { return }
        guard !notebookId.isEmpty else {
            error = env.preferences.t("请选择笔记本", en: "Choose a notebook")
            return
        }
        isCreating = true
        defer { isCreating = false }
        do {
            // Android createMutation: if image materialize already created a server memo,
            // Done updates that memo — never mint a second local: create.
            let outcome = try MemoCreateCommit.commit(
                scope: scope,
                memoId: memoId,
                expectedRevision: expectedRevision,
                expectedContentHash: expectedContentHash,
                notebookId: notebookId,
                title: title,
                contentMarkdown: contentMarkdown,
                contentJSON: contentJSON,
                tags: tags,
                mirror: env.mirror,
                outbox: env.outbox,
                drafts: env.drafts
            )
            if case .updatedMaterialized(let id) = outcome {
                memoId = id
            }
            await env.runSyncCycle()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func flushPending() async {
        await persistDraftOrQueue()
        await env.runSyncCycle()
    }

    /// K24 materialize: ensure a server memo id before image upload.
    private func materializeForImage() async throws -> String {
        if let memoId, !memoId.hasPrefix("local:") {
            return memoId
        }
        guard let scope = env.session.dataScope else {
            throw APIError(status: 0, code: nil, message: "未登录")
        }
        if isMaterializing {
            try await Task.sleep(nanoseconds: 300_000_000)
            if let memoId, !memoId.hasPrefix("local:") { return memoId }
        }
        isMaterializing = true
        defer { isMaterializing = false }

        if let localId = memoId, localId.hasPrefix("local:"),
           let pending = try env.outbox.pendingCreate(scope: scope, memoId: localId)
        {
            if pending.status == .syncing {
                await env.runSyncCycle()
                if let resolved = try env.mirror.resolveMemo(scope: scope, id: localId), !resolved.id.hasPrefix("local:") {
                    memoId = resolved.id
                    expectedRevision = resolved.revision
                    expectedContentHash = resolved.contentHash
                    return resolved.id
                }
            }
            try env.outbox.cancelMemo(scope: scope, memoId: localId)
            try env.mirror.deleteMemo(scope: scope, id: localId)
        }

        let memo = try await env.session.client.createMemo(
            notebookId: notebookId.isEmpty ? (availableNotebooks.first?.id ?? "") : notebookId,
            title: title.isEmpty ? "无标题笔记" : title,
            contentMarkdown: contentMarkdown,
            tags: tags
        )
        try env.mirror.upsertMemo(scope: scope, memo: memo)
        try env.drafts.clear(scope: scope, key: DraftRepository.newKey)
        memoId = memo.id
        expectedRevision = memo.revision
        expectedContentHash = memo.contentHash
        notebookId = memo.notebookId
        return memo.id
    }

    private func insertImage(_ item: PhotosPickerItem) async {
        isUploading = true
        defer { isUploading = false }
        do {
            guard let data = try await item.loadTransferable(type: Data.self) else { return }
            let compress = env.preferences.useCompression
            let prepared = compress
                ? ImageCompressor.compressIfNeeded(data)
                : (data: data, mimeType: "image/jpeg", filename: "image.jpg")
            let serverId = try await materializeForImage()
            let resource = try await env.session.client.uploadMemoResource(
                memoId: serverId,
                filename: prepared.filename,
                mimeType: prepared.mimeType,
                data: prepared.data
            )
            contentMarkdown += "\n\n![](\(resource.url))\n"
            markDirtyAndScheduleSave()
            photoItem = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - Compact notebook picker for create/edit

private struct EditNotebookPickerSheet: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    let notebooks: [Notebook]
    let selectedId: String
    var onSelect: (String) -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text(env.preferences.t("选择笔记本", en: "Choose notebook"))
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(AppTheme.title)
                Spacer()
                Button(env.preferences.t("关闭", en: "Close")) { dismiss() }
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(AppTheme.slate)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(Color.white)
            .overlay(alignment: .bottom) {
                Rectangle().fill(AppTheme.border).frame(height: 1)
            }

            List {
                ForEach(notebooks, id: \.id) { nb in
                    Button {
                        onSelect(nb.id)
                        dismiss()
                    } label: {
                        HStack {
                            Text(nb.name)
                                .foregroundStyle(AppTheme.title)
                            Spacer()
                            if nb.id == selectedId {
                                Image(systemName: "checkmark")
                                    .foregroundStyle(AppTheme.accent)
                            }
                        }
                    }
                }
            }
            .listStyle(.plain)
        }
        .background(Color.white)
    }
}
