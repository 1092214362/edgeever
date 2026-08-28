import XCTest
@testable import EdgeEver

@MainActor
final class MemoEditViewModelTests: XCTestCase {
    func testTagsAreNormalized() {
        let model = MemoEditViewModel()
        model.tagsText = " one, two，three one, one, #four "
        XCTAssertEqual(model.tags, ["one", "two", "three one", "four"])
    }

    func testRejectsEmptyBodyOverNonEmptyBaseline() {
        let model = MemoEditViewModel()
        model.baselineMarkdown = "Important existing body"
        model.contentMarkdown = ""
        XCTAssertTrue(model.wouldClobberNonEmptyBody(isCreate: false))
        XCTAssertFalse(model.wouldClobberNonEmptyBody(isCreate: true))
    }

    func testRejectsEditorPayloadThatStripsTextWhileKeepingImage() {
        let model = MemoEditViewModel()
        model.contentMarkdown = "Important existing body"
        model.contentJSON = "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Important existing body\"}]}]}"

        model.applyEditorPayload(
            markdown: "![](/api/v1/resources/image/blob)",
            json: "{\"type\":\"doc\",\"content\":[{\"type\":\"image\",\"attrs\":{\"src\":\"/api/v1/resources/image/blob\"}}]}"
        )

        XCTAssertEqual(model.contentMarkdown, "Important existing body")
    }

    func testEnsuresMissingImageInBothRepresentations() {
        let model = MemoEditViewModel()
        model.contentMarkdown = "Body"
        model.ensureImageInContent(imageSrc: "/api/v1/resources/image/blob", alt: "photo")
        XCTAssertTrue(model.contentMarkdown.contains("resources/image"))
        XCTAssertTrue(EditorContentCodec.jsonContainsResource(model.contentJSON, src: "/api/v1/resources/image/blob"))
    }

    func testDerivesTitleWhileTypingFirstH1AndStopsNextSession() {
        let model = MemoEditViewModel()
        model.beginTitleDerivationSession()
        model.applyEditorPayload(
            markdown: "# Product plan\n\nBody",
            json: "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Intro\"}]},{\"type\":\"heading\",\"attrs\":{\"level\":1},\"content\":[{\"type\":\"text\",\"text\":\"Product plan\"}]}]}"
        )
        XCTAssertEqual(model.title, "Product plan")

        model.applyEditorPayload(
            markdown: "# Renamed heading",
            json: "{\"type\":\"doc\",\"content\":[{\"type\":\"heading\",\"attrs\":{\"level\":1},\"content\":[{\"type\":\"text\",\"text\":\"Renamed heading\"}]}]}"
        )
        XCTAssertEqual(model.title, "Renamed heading")

        let reopened = MemoEditViewModel()
        reopened.title = model.title
        reopened.beginTitleDerivationSession()
        reopened.applyEditorPayload(
            markdown: "# Later edit",
            json: "{\"type\":\"doc\",\"content\":[{\"type\":\"heading\",\"attrs\":{\"level\":1},\"content\":[{\"type\":\"text\",\"text\":\"Later edit\"}]}]}"
        )
        XCTAssertEqual(reopened.title, "Renamed heading")
    }

    func testDoesNotDeriveTitleAfterManualTitleEdit() {
        let model = MemoEditViewModel()
        model.beginTitleDerivationSession()
        model.userEditedTitle("")
        model.applyEditorPayload(
            markdown: "# Product plan",
            json: "{\"type\":\"doc\",\"content\":[{\"type\":\"heading\",\"attrs\":{\"level\":1},\"content\":[{\"type\":\"text\",\"text\":\"Product plan\"}]}]}"
        )
        XCTAssertEqual(model.title, "")
    }

    func testDebouncedSaveKeepsOnlyLatestOperation() async {
        let model = MemoEditViewModel()
        model.markDirty()
        var operations: [String] = []
        model.scheduleSave(delayNanoseconds: 5_000_000) { operations.append("old") }
        model.scheduleSave(delayNanoseconds: 0) { operations.append("latest") }

        try? await Task.sleep(nanoseconds: 20_000_000)
        XCTAssertEqual(operations, ["latest"])
    }

    func testDrainPersistsDirtyStateImmediately() async {
        let model = MemoEditViewModel()
        model.markDirty()
        var saveCount = 0
        model.scheduleSave(delayNanoseconds: 1_000_000_000) { saveCount += 1 }

        await model.drainScheduledSave { saveCount += 1 }
        XCTAssertEqual(saveCount, 1)
    }

    func testCommitLifecycleSuppressesPersistenceAndRecoversAfterFailure() async {
        enum Failure: Error { case expected }
        let model = MemoEditViewModel()
        model.markDirty()

        let result: String? = await model.performCreateCommit { throw Failure.expected }
        XCTAssertNil(result)
        XCTAssertFalse(model.isCreating)
        XCTAssertFalse(model.suppressPersistence)
        XCTAssertNotNil(model.error)
    }

    func testUploadLifecycleClearsBusyStateAndCapturesErrors() async {
        enum Failure: Error { case expected }
        let model = MemoEditViewModel()

        let succeeded = await model.performUpload { throw Failure.expected }
        XCTAssertFalse(succeeded)
        XCTAssertFalse(model.isUploading)
        XCTAssertNotNil(model.error)
    }
}
