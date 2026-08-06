import XCTest
@testable import EdgeEver

/// Exercises shipped parity helpers (same semantics as Android `@edgeever/shared/mobile-ui` + notebooks).
final class MobileUIParityTests: XCTestCase {
    func testToggleFilterReturnsToAllWhenPressedAgain() {
        XCTAssertEqual(
            MobileUI.toggleMemoFilterMode(current: .all, requested: .pinned),
            .pinned
        )
        XCTAssertEqual(
            MobileUI.toggleMemoFilterMode(current: .pinned, requested: .pinned),
            .all
        )
        XCTAssertEqual(
            MobileUI.toggleMemoFilterMode(current: .pinned, requested: .tagged),
            .tagged
        )
    }

    func testToggleSelectionAddAndRemove() {
        let once = MobileUI.toggleMemoSelection(current: [], memoId: "a")
        XCTAssertEqual(once, ["a"])
        let twice = MobileUI.toggleMemoSelection(current: once, memoId: "a")
        XCTAssertTrue(twice.isEmpty)
        let multi = MobileUI.toggleMemoSelection(current: once, memoId: "b")
        XCTAssertEqual(multi, ["a", "b"])
    }

    func testNotebookDescendantsMatchTree() {
        let notebooks = [
            makeNotebook(id: "root", parent: nil, name: "Root", order: 0),
            makeNotebook(id: "child", parent: "root", name: "Child", order: 0),
            makeNotebook(id: "grand", parent: "child", name: "Grand", order: 0),
            makeNotebook(id: "other", parent: nil, name: "Other", order: 1),
        ]
        let ids = NotebookHierarchy.descendantIds(notebooks: notebooks, targetNotebookId: "root")
        XCTAssertEqual(Set(ids), Set(["root", "child", "grand"]))
    }

    func testFilterCollapsedHidesDescendants() {
        let notebooks = [
            makeNotebook(id: "root", parent: nil, name: "Root", order: 0),
            makeNotebook(id: "child", parent: "root", name: "Child", order: 0),
            makeNotebook(id: "grand", parent: "child", name: "Grand", order: 0),
            makeNotebook(id: "other", parent: nil, name: "Other", order: 1),
        ]
        let tree = NotebookHierarchy.treeItems(from: notebooks)
        let filtered = NotebookHierarchy.filterCollapsed(items: tree, collapsedIds: ["root"])
        XCTAssertEqual(filtered.map(\.id), ["root", "other"])
    }

    func testNotebookSearchIncludesAncestorsAndDescendants() {
        let notebooks = [
            makeNotebook(id: "work", parent: nil, name: "Work", order: 0),
            makeNotebook(id: "proj", parent: "work", name: "Project Alpha", order: 0),
            makeNotebook(id: "note", parent: "proj", name: "Daily", order: 0),
            makeNotebook(id: "home", parent: nil, name: "Home", order: 1),
        ]
        let visible = NotebookHierarchy.searchVisibleIds(notebooks: notebooks, searchText: "alpha")
        XCTAssertTrue(visible.contains("proj"))
        XCTAssertTrue(visible.contains("work")) // ancestor
        XCTAssertTrue(visible.contains("note")) // descendant
        XCTAssertFalse(visible.contains("home"))
    }

    func testResourcePathNormalizationAddsBlob() {
        let base = URL(string: "https://demo.edgeever.org")!
        XCTAssertEqual(
            ResourceCache.normalizeProtectedResourcePath("/api/v1/resources/abc123", baseURL: base),
            "/api/v1/resources/abc123/blob"
        )
        XCTAssertEqual(
            ResourceCache.normalizeProtectedResourcePath("/api/v1/resources/abc123/blob", baseURL: base),
            "/api/v1/resources/abc123/blob"
        )
        XCTAssertEqual(
            ResourceCache.normalizeProtectedResourcePath("https://demo.edgeever.org/api/v1/resources/xyz", baseURL: base),
            "/api/v1/resources/xyz/blob"
        )
        XCTAssertTrue(ResourceCache.isProtectedResourceSource("/api/v1/resources/x", baseURL: base))
        XCTAssertFalse(ResourceCache.isProtectedResourceSource("https://cdn.example/img.png", baseURL: base))
    }

    func testListMemosFilterPinnedUsesShippedRepository() throws {
        let db = try AppDatabase.makeEmpty()
        let mirror = LocalMirrorRepository(dbQueue: db)
        let scope = "https://demo|user"
        let now = EdgeEverDate.nowString()
        var pinned = MemoDetail.localPlaceholder(
            id: "p1", notebookId: "nb", title: "Pinned", contentMarkdown: "x", tags: [], createdAt: now
        )
        pinned.isPinned = true
        let plain = MemoDetail.localPlaceholder(
            id: "p2", notebookId: "nb", title: "Plain", contentMarkdown: "y", tags: ["t"], createdAt: now
        )
        try mirror.applyBootstrapBatch(
            scope: scope,
            notebooks: [makeNotebook(id: "nb", parent: nil, name: "N", order: 0)],
            memos: [pinned, plain]
        )
        let pinnedOnly = try mirror.listMemos(
            scope: scope,
            params: LocalMemoListParams(filter: .pinned)
        )
        XCTAssertEqual(pinnedOnly.memos.map(\.id), ["p1"])
        let tagged = try mirror.listMemos(
            scope: scope,
            params: LocalMemoListParams(filter: .tagged)
        )
        XCTAssertEqual(tagged.memos.map(\.id), ["p2"])
    }

    private func makeNotebook(id: String, parent: String?, name: String, order: Int) -> Notebook {
        Notebook(
            id: id,
            parentId: parent,
            name: name,
            slug: nil,
            icon: nil,
            color: nil,
            sortOrder: order,
            memoCount: 0,
            lastMemoUpdatedAt: nil,
            createdAt: EdgeEverDate.nowString(),
            updatedAt: EdgeEverDate.nowString()
        )
    }
}
