import Foundation
import SwiftUI

struct ResourceTarget: Equatable, Hashable {
    var kind: String
    var href: String
    var filename: String
    var resourceId: String

    static func parse(_ json: String) -> ResourceTarget? {
        guard
            let data = json.data(using: .utf8),
            let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let href = obj["href"] as? String,
            let filename = obj["filename"] as? String,
            let kind = obj["kind"] as? String
        else { return nil }
        let id = (obj["resourceId"] as? String) ?? href.split(separator: "/").map(String.init).last ?? ""
        return ResourceTarget(kind: kind, href: href, filename: filename, resourceId: id)
    }
}

struct IdentifiedResource: Identifiable {
    let id = UUID()
    let value: ResourceTarget
    init(_ value: ResourceTarget) { self.value = value }
}

struct ResourceActionSheet: View {
    @Environment(AppEnvironment.self) private var env
    let target: ResourceTarget
    var onDone: () -> Void

    @State private var renameTo = ""
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                LabeledContent("类型", value: target.kind)
                LabeledContent("文件名", value: target.filename)
                TextField("重命名", text: $renameTo)
                if let error {
                    Text(error).foregroundStyle(.red).font(.caption)
                }
                Button("重命名") {
                    Task { await rename() }
                }
                .disabled(busy || renameTo.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                Button("删除资源", role: .destructive) {
                    Task { await delete() }
                }
                .disabled(busy)
            }
            .navigationTitle("附件")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("关闭") { onDone() }
                }
            }
            .onAppear { renameTo = target.filename }
        }
    }

    private func rename() async {
        busy = true
        defer { busy = false }
        do {
            _ = try await env.session.client.renameResource(
                id: target.resourceId,
                filename: renameTo.trimmingCharacters(in: .whitespacesAndNewlines)
            )
            onDone()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func delete() async {
        busy = true
        defer { busy = false }
        do {
            try await env.session.client.deleteResource(id: target.resourceId)
            onDone()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
