import Foundation

actor OutboxFlusher {
    private let outbox: SyncOutboxRepository
    private let mirror: LocalMirrorRepository
    private let client: APIClient

    init(outbox: SyncOutboxRepository, mirror: LocalMirrorRepository, client: APIClient) {
        self.outbox = outbox
        self.mirror = mirror
        self.client = client
    }

    func flush(scope: String) async throws -> SyncRunResult {
        var result = SyncRunResult()
        let items = try outbox.flushableItems(scope: scope)
        for item in items {
            result.attempted += 1
            let marked = try outbox.markSyncing(scope: scope, id: item.id, expectedVersion: item.version)
            guard marked else { continue }

            do {
                let memo = try await syncItem(item)
                let removed = try outbox.remove(scope: scope, id: item.id, expectedVersion: item.version)
                if removed {
                    if item.kind == .memoCreate, item.memoId.hasPrefix("local:") {
                        try mirror.replaceLocalMemoId(scope: scope, temporaryId: item.memoId, memo: memo)
                    } else {
                        try mirror.upsertMemo(scope: scope, memo: memo)
                    }
                } else if item.kind == .memoCreate {
                    let promoted = try outbox.promoteCreateToUpdate(
                        scope: scope,
                        createId: item.id,
                        expectedVersion: item.version,
                        memo: memo
                    )
                    if promoted {
                        try mirror.replaceLocalMemoId(scope: scope, temporaryId: item.memoId, memo: memo)
                    } else {
                        // User cancelled while in flight — soft-delete remote orphan.
                        try? await client.deleteMemo(id: memo.id, permanent: false)
                    }
                } else {
                    try outbox.rebaseUpdate(scope: scope, id: item.id, syncedVersion: item.version, memo: memo)
                    try mirror.upsertMemo(scope: scope, memo: memo)
                }
                result.synced += 1
            } catch {
                let apiError = error as? APIError
                let isConflict = apiError?.isRevisionConflict == true
                let status: OutboxStatus = isConflict ? .conflict : .error
                let attempts = item.attemptCount + 1
                try outbox.updateStatus(
                    scope: scope,
                    id: item.id,
                    expectedVersion: item.version,
                    status: status,
                    attemptCount: attempts,
                    lastError: (error as? LocalizedError)?.errorDescription ?? error.localizedDescription,
                    nextAttemptAt: isConflict ? nil : SyncRetry.nextAttemptAt(attemptCount: attempts)
                )
                if isConflict {
                    result.conflicted += 1
                } else {
                    result.failed += 1
                }
            }
        }
        return result
    }

    private func syncItem(_ item: OutboxItem) async throws -> MemoDetail {
        switch item.kind {
        case .memoCreate:
            let payload = try item.createPayload()
            return try await client.createMemo(
                notebookId: payload.notebookId,
                title: payload.title,
                contentMarkdown: payload.contentMarkdown,
                tags: payload.tags,
                createdAt: payload.createdAt,
                updatedAt: item.updatedAt
            )
        case .memoUpdate:
            let payload = try item.updatePayload()
            let editSession = try await client.createMemoEditSession(memoId: item.memoId)
            if editSession.baseRevision != payload.expectedRevision
                || editSession.baseContentHash != payload.expectedContentHash
            {
                throw APIError(status: 409, code: "revision_conflict", message: "Note changed before the offline draft could sync.")
            }
            return try await client.updateMemo(
                id: item.memoId,
                expectedRevision: payload.expectedRevision,
                expectedContentHash: payload.expectedContentHash,
                editSessionId: editSession.id,
                notebookId: payload.notebookId,
                title: payload.title,
                isPinned: nil,
                contentMarkdown: payload.contentMarkdown,
                tags: payload.tags
            )
        }
    }
}
