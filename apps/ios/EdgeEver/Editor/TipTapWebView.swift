import CryptoKit
import SwiftUI
import WebKit

enum TipTapMode: String {
    case viewer
    case editor
}

struct TipTapWebView: UIViewRepresentable {
    let mode: TipTapMode
    let documentJSON: String
    let markdown: String
    let baseURL: URL?
    let token: String?
    let onChange: ((String, String) -> Void)?

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        // Serve authenticated / remote images via short custom-scheme URLs (avoids huge data: injects).
        config.setURLSchemeHandler(context.coordinator.resourceSchemeHandler, forURLScheme: EdgeEverResourceSchemeHandler.scheme)
        let userContent = config.userContentController
        userContent.add(context.coordinator, name: "edgeever")
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.isOpaque = false
        webView.backgroundColor = .systemBackground
        // Keep scroll gestures inside the editor so overlay FAB taps are not swallowed.
        webView.scrollView.clipsToBounds = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.delaysContentTouches = false
        context.coordinator.webView = webView
        context.coordinator.loadEditor(into: webView)
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        context.coordinator.parent = self
        context.coordinator.applyMode()
        context.coordinator.pushContentIfNeeded()
    }

    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        var parent: TipTapWebView
        weak var webView: WKWebView?
        private var ready = false
        /// Last content fingerprint we pushed INTO the web editor (native → JS).
        private var lastPushedJSON: String?
        /// Last content fingerprint the editor emitted TO native (JS → native).
        /// Used to avoid re-setContent on every keystroke (which jumps the caret).
        private var lastEditorEmittedFingerprint: String?
        private var lastAppliedMode: String?
        private let resourceCache = ResourceCache()
        let resourceSchemeHandler = EdgeEverResourceSchemeHandler()

        init(_ parent: TipTapWebView) {
            self.parent = parent
        }

        func loadEditor(into webView: WKWebView) {
            // Prefer packaged TipTap bundle (EditorBundle/ or root index.html).
            // If missing, Markdown will not render (fallback is plain-text only).
            if let bundleURL = Self.packagedEditorHTMLURL() {
                let dir = bundleURL.deletingLastPathComponent()
                #if DEBUG
                print("TipTapWebView: loading packaged editor \(bundleURL.path) size=\((try? Data(contentsOf: bundleURL))?.count ?? -1)")
                #endif
                webView.loadFileURL(bundleURL, allowingReadAccessTo: dir)
            } else {
                #if DEBUG
                print("TipTapWebView: WARNING packaged EditorBundle missing — using plain-text fallback")
                #endif
                webView.loadHTMLString(Self.fallbackHTML, baseURL: Bundle.main.bundleURL)
            }
        }

        /// Resolves the shipped TipTap `index.html` (must be >100KB real bundle, not a stub).
        static func packagedEditorHTMLURL() -> URL? {
            let candidates: [URL?] = [
                Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "EditorBundle"),
                Bundle.main.url(forResource: "index", withExtension: "html"),
            ]
            for case let url? in candidates {
                if let values = try? url.resourceValues(forKeys: [.fileSizeKey]),
                   let size = values.fileSize,
                   size > 100_000
                {
                    return url
                }
                // Size unknown — still try if path exists
                if FileManager.default.fileExists(atPath: url.path) {
                    return url
                }
            }
            return nil
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            ready = true
            applyMode()
            pushContentIfNeeded(force: true)
        }

        func applyMode() {
            guard ready, let webView else { return }
            let mode = parent.mode.rawValue
            // Only re-configure when mode actually changes — avoid re-focus storms.
            if lastAppliedMode == mode { return }
            lastAppliedMode = mode
            let js = """
            (function(){
              if (!window.EdgeEverEditor) return;
              window.EdgeEverEditor.configure({ mode: '\(mode)', locale: 'zh-CN', theme: 'light' });
            })();
            """
            webView.evaluateJavaScript(js, completionHandler: nil)
        }

        private func contentFingerprint() -> (fingerprint: String, useJSON: Bool) {
            let emptyStub = "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\"}]}"
            let json = parent.documentJSON.trimmingCharacters(in: .whitespacesAndNewlines)
            let useJSON = !json.isEmpty && json != emptyStub
            if useJSON {
                return ("json:\(json)", true)
            }
            return ("md:\(parent.markdown)", false)
        }

        func pushContentIfNeeded(force: Bool = false) {
            guard ready, let webView else { return }
            let (fingerprint, useJSON) = contentFingerprint()
            // Skip if we already pushed this, OR if the editor just told us this content
            // (typing path: SwiftUI state updates must not re-setContent and kill the caret).
            if !force {
                if fingerprint == lastPushedJSON { return }
                if fingerprint == lastEditorEmittedFingerprint { return }
            }
            lastPushedJSON = fingerprint

            // Ensure mode is applied once before first content (no focusEnd — user places caret).
            if lastAppliedMode != parent.mode.rawValue {
                applyMode()
            }

            let js: String
            if useJSON {
                js = Self.jsCall(fn: "setDocumentFromJSON", arg: parent.documentJSON)
            } else {
                js = Self.jsCall(fn: "setMarkdown", arg: parent.markdown)
            }
            webView.evaluateJavaScript(js, completionHandler: { _, error in
                #if DEBUG
                if let error {
                    print("TipTapWebView pushContent error: \(error)")
                }
                #endif
            })
        }

        /// Call `window.EdgeEverEditor.fn(string)` with base64 payload (UTF-8 safe).
        private static func jsCall(fn: String, arg: String) -> String {
            let b64 = Data(arg.utf8).base64EncodedString()
            return """
            (function(){
              try {
                if (!window.EdgeEverEditor) return;
                var bin = atob('\(b64)');
                var bytes = new Uint8Array(bin.length);
                for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                var text = new TextDecoder('utf-8').decode(bytes);
                window.EdgeEverEditor.\(fn)(text);
              } catch (e) {
                try { window.webkit.messageHandlers.edgeever.postMessage({type:'error', message: String(e)}); } catch (_) {}
              }
            })();
            """
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.name == "edgeever",
                  let body = message.body as? [String: Any],
                  let type = body["type"] as? String
            else { return }

            switch type {
            case "ready":
                ready = true
                lastAppliedMode = nil // force re-apply mode after reload
                pushContentIfNeeded(force: true)
            case "change":
                let md = body["contentMarkdown"] as? String ?? ""
                let json = body["contentJson"] as? String ?? parent.documentJSON
                // Mark as editor-originated so updateUIView does not re-push and reset caret.
                let emptyStub = "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\"}]}"
                let j = json.trimmingCharacters(in: .whitespacesAndNewlines)
                let emitted = (!j.isEmpty && j != emptyStub) ? "json:\(j)" : "md:\(md)"
                lastEditorEmittedFingerprint = emitted
                lastPushedJSON = emitted
                parent.onChange?(md, json)
            case "loadResource":
                let requestId = body["requestId"] as? String ?? ""
                let source = body["source"] as? String ?? ""
                Task { await resolveResource(requestId: requestId, source: source) }
            case "resourcePress":
                // Surface to native via notification; detail/edit can observe later.
                if let targetJson = body["targetJson"] as? String {
                    NotificationCenter.default.post(
                        name: .edgeEverResourcePress,
                        object: nil,
                        userInfo: ["targetJson": targetJson]
                    )
                }
            case "error":
                break
            default:
                break
            }
        }

        private func resolveResource(requestId: String, source: String) async {
            guard let webView else { return }
            let token = parent.token
            let base = parent.baseURL
            let displayURL = await Self.loadResourceDataURL(
                source: source,
                baseURL: base,
                token: token,
                resourceCache: resourceCache
            )
            #if DEBUG
            if displayURL == nil {
                print("TipTapWebView: failed to load resource source=\(source.prefix(120)) base=\(base?.absoluteString ?? "nil") token=\(token == nil ? "nil" : "set")")
            } else {
                print("TipTapWebView: resolved resource source=\(source.prefix(80)) → \(displayURL!.prefix(80))")
            }
            #endif
            // Short edgeever-res:// (or small data:) URLs — safe to interpolate into JS.
            let reqEscaped = requestId
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "'", with: "\\'")
            let urlLiteral: String
            if let displayURL {
                let escaped = displayURL
                    .replacingOccurrences(of: "\\", with: "\\\\")
                    .replacingOccurrences(of: "'", with: "\\'")
                urlLiteral = "'\(escaped)'"
            } else {
                urlLiteral = "null"
            }
            let js = """
            (function(){
              try {
                if (window.EdgeEverEditor) {
                  window.EdgeEverEditor.resolveResource('\(reqEscaped)', \(urlLiteral));
                }
              } catch (e) {
                try { window.webkit.messageHandlers.edgeever.postMessage({type:'error', message: 'resolveResource: '+String(e)}); } catch (_) {}
              }
            })();
            """
            await MainActor.run {
                webView.evaluateJavaScript(js, completionHandler: { _, error in
                    #if DEBUG
                    if let error { print("TipTapWebView resolveResource JS error: \(error)") }
                    #endif
                })
            }
        }

        /// Load image/attachment bytes for TipTap: protected paths need auth; public URLs are fetched
        /// into the local scheme so a file:// editor page can display them.
        static func loadResourceDataURL(
            source: String,
            baseURL: URL?,
            token: String?,
            resourceCache: ResourceCache
        ) async -> String? {
            let trimmed = source.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { return nil }
            if trimmed.hasPrefix("data:") || trimmed.hasPrefix("edgeever-res:") {
                return trimmed
            }

            let protected = ResourceCache.isProtectedResourceSource(trimmed, baseURL: baseURL)
            if protected {
                // Prefer session base; fall back to host from absolute source so offline-cached notes still load.
                let base = baseURL ?? Self.baseURLFromAbsoluteSource(trimmed)
                guard let base else { return nil }
                let path = ResourceCache.normalizeProtectedResourcePath(trimmed, baseURL: base)
                let id = ResourceCache.resourceId(from: path) ?? path

                if let cached = await resourceCache.cachedData(for: id) {
                    let mime = Self.sniffImageMime(cached)
                    _ = try? await resourceCache.dataURL(for: id, data: cached, mimeType: mime)
                    await ResourceBlobStore.shared.put(id: id, data: cached, mimeType: mime)
                    return EdgeEverResourceSchemeHandler.localURL(for: id)
                }

                let client = APIClient(baseURL: base, token: token)
                do {
                    let result = try await client.getResourceData(path: path)
                    var mime = result.mimeType
                    if !mime.hasPrefix("image/") && !mime.hasPrefix("application/") {
                        mime = Self.sniffImageMime(result.data)
                    } else if mime.hasPrefix("application/octet-stream") {
                        mime = Self.sniffImageMime(result.data)
                    }
                    _ = try? await resourceCache.dataURL(for: id, data: result.data, mimeType: mime)
                    await ResourceBlobStore.shared.put(id: id, data: result.data, mimeType: mime)
                    return EdgeEverResourceSchemeHandler.localURL(for: id)
                } catch {
                    #if DEBUG
                    print("TipTapWebView: getResourceData failed path=\(path) error=\(error)")
                    #endif
                    return nil
                }
            }

            // Absolute public URL: fetch into scheme store (file:// pages cannot reliably load remote imgs).
            if trimmed.hasPrefix("http://") || trimmed.hasPrefix("https://"),
               let absolute = URL(string: trimmed)
            {
                let client = APIClient(baseURL: baseURL ?? absolute, token: nil)
                do {
                    let result = try await client.getPublicURLData(absolute)
                    var mime = result.mimeType.isEmpty ? "application/octet-stream" : result.mimeType
                    if !mime.hasPrefix("image/") {
                        mime = Self.sniffImageMime(result.data)
                    }
                    let id = Self.publicResourceId(for: trimmed)
                    await ResourceBlobStore.shared.put(id: id, data: result.data, mimeType: mime)
                    return EdgeEverResourceSchemeHandler.localURL(for: id)
                } catch {
                    #if DEBUG
                    print("TipTapWebView: public URL fetch failed \(trimmed.prefix(80)) error=\(error)")
                    #endif
                    return nil
                }
            }

            // Relative non-api path — resolve against base if possible.
            if trimmed.hasPrefix("/"), let base = baseURL {
                let absolute = base.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + trimmed
                if let url = URL(string: absolute) {
                    let client = APIClient(baseURL: base, token: token)
                    if let result = try? await client.getPublicURLData(url) {
                        var mime = result.mimeType.isEmpty ? "application/octet-stream" : result.mimeType
                        if !mime.hasPrefix("image/") {
                            mime = Self.sniffImageMime(result.data)
                        }
                        let id = Self.publicResourceId(for: absolute)
                        await ResourceBlobStore.shared.put(id: id, data: result.data, mimeType: mime)
                        return EdgeEverResourceSchemeHandler.localURL(for: id)
                    }
                }
            }
            return nil
        }

        static func baseURLFromAbsoluteSource(_ source: String) -> URL? {
            guard let url = URL(string: source),
                  let scheme = url.scheme,
                  let host = url.host
            else { return nil }
            var components = URLComponents()
            components.scheme = scheme
            components.host = host
            components.port = url.port
            return components.url?.edgeEverNormalizedBase
        }

        static func publicResourceId(for source: String) -> String {
            let digest = SHA256.hash(data: Data(source.utf8))
            return "pub-" + digest.map { String(format: "%02x", $0) }.joined()
        }

        static func sniffImageMime(_ data: Data) -> String {
            if data.starts(with: [0x89, 0x50, 0x4E, 0x47]) { return "image/png" }
            if data.starts(with: [0xFF, 0xD8, 0xFF]) { return "image/jpeg" }
            if data.count >= 12 {
                let riff = data.prefix(4)
                let webp = data.dropFirst(8).prefix(4)
                if riff.elementsEqual([0x52, 0x49, 0x46, 0x46]), webp.elementsEqual([0x57, 0x45, 0x42, 0x50]) {
                    return "image/webp"
                }
            }
            if data.starts(with: [0x47, 0x49, 0x46, 0x38]) { return "image/gif" }
            return "image/jpeg"
        }

        /// Minimal contenteditable + markdown-ish bridge when EditorBundle is missing.
        static let fallbackHTML = """
        <!DOCTYPE html>
        <html>
        <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
        <style>
          html,body{margin:0;padding:12px;font: -apple-system-body; font-family: -apple-system, sans-serif; background: transparent; color: #111;}
          #editor{min-height:50vh;outline:none;line-height:1.55;white-space:pre-wrap;}
          #editor:empty:before{content:attr(data-placeholder);color:#94a3b8;}
          img{max-width:100%;}
        </style>
        </head>
        <body>
        <div id="editor" contenteditable="false" data-placeholder="开始书写…"></div>
        <script>
        (function(){
          const editor = document.getElementById('editor');
          let mode = 'viewer';
          let suppress = false;
          function post(msg){
            try { window.webkit.messageHandlers.edgeever.postMessage(msg); } catch(e) {}
          }
          function mdToHtml(md){
            if(!md) return '<p><br></p>';
            return md
              .replace(/&/g,'&amp;').replace(/</g,'&lt;')
              .replace(/!\\[([^\\]]*)\\]\\(([^)]+)\\)/g, '<img alt="$1" src="$2">')
              .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
              .replace(/^### (.+)$/gm, '<h3>$1</h3>')
              .replace(/^## (.+)$/gm, '<h2>$1</h2>')
              .replace(/^# (.+)$/gm, '<h1>$1</h1>')
              .replace(/^- (.+)$/gm, '<li>$1</li>')
              .replace(/(<li>.*<\\/li>\\n?)+/g, m => '<ul>'+m+'</ul>')
              .replace(/\\n\\n/g, '</p><p>')
              .replace(/\\n/g, '<br>');
          }
          function htmlToMd(html){
            const tmp = document.createElement('div');
            tmp.innerHTML = html;
            // Prefer plain text with newlines for reliability
            let text = tmp.innerText || tmp.textContent || '';
            return text;
          }
          window.EdgeEverEditor = {
            configure(opts){
              mode = opts.mode || 'viewer';
              editor.contentEditable = mode === 'editor' ? 'true' : 'false';
            },
            setMarkdown(md){
              suppress = true;
              editor.innerHTML = mdToHtml(md || '');
              suppress = false;
            },
            setDocumentFromJSON(json){
              // Fallback ignores rich JSON structure beyond empty check
              try {
                const doc = JSON.parse(json);
                // leave as-is if already set via markdown
              } catch(e) {}
            },
            resolveResource(){},
            getMarkdown(){ return htmlToMd(editor.innerHTML); }
          };
          editor.addEventListener('input', () => {
            if (suppress || mode !== 'editor') return;
            const md = htmlToMd(editor.innerHTML);
            post({ type: 'change', contentMarkdown: md, contentJson: JSON.stringify({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:md}]}]}) });
          });
          post({ type: 'ready', startupMs: 0 });
        })();
        </script>
        </body>
        </html>
        """
    }
}
