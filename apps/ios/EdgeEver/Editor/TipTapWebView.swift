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
    /// Android `onResourcePress` — open Share/Download/Rename/Delete sheet.
    var onResourcePress: ((ResourceTarget) -> Void)? = nil
    /// Android viewer image tap — fullscreen preview. Payload: original protected src + alt.
    var onImagePreview: ((_ source: String, _ alt: String) -> Void)? = nil

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

            // Keep original /api paths in the ProseMirror document (needed for save + resource menus).
            // After paint, rewrite only the live <img src> to data:/edgeever-res: and set
            // data-original-src so long-press menus still know the protected path.
            let fn = useJSON ? "setDocumentFromJSON" : "setMarkdown"
            let payload = useJSON ? parent.documentJSON : parent.markdown
            let js = Self.jsCall(fn: fn, arg: payload)
            webView.evaluateJavaScript(js) { [weak self] _, error in
                #if DEBUG
                if let error {
                    NSLog("TipTapWebView pushContent error: \(error)")
                }
                #endif
                guard let self else { return }
                Task { await self.nativeHydrateDOMImages() }
            }
        }

        /// Collect img[src] from the live DOM and rewrite any protected/remote sources to display URLs.
        private func nativeHydrateDOMImages() async {
            guard let webView else { return }
            let listJS = """
            (function(){
              return Array.from(document.querySelectorAll('img[src]')).map(function(img){
                return img.dataset.originalSrc || img.getAttribute('src') || '';
              });
            })();
            """
            let raw: Any? = await withCheckedContinuation { cont in
                DispatchQueue.main.async {
                    webView.evaluateJavaScript(listJS) { value, _ in
                        cont.resume(returning: value)
                    }
                }
            }
            let srcs = (raw as? [Any])?.compactMap { $0 as? String } ?? []
            let unique = Array(Set(srcs.filter { !$0.isEmpty }))
            #if DEBUG
            NSLog("TipTapWebView nativeHydrateDOMImages count=%d srcs=%@", unique.count, unique.prefix(3).joined(separator: ","))
            #endif
            let base = parent.baseURL
            let token = parent.token
            for source in unique {
                // Skip already-displayable sources.
                if source.hasPrefix("data:") || source.hasPrefix("edgeever-res:") || source.hasPrefix("blob:") {
                    continue
                }
                guard let display = await Self.loadResourceDataURL(
                    source: source,
                    baseURL: base,
                    token: token,
                    resourceCache: resourceCache
                ) else {
                    #if DEBUG
                    NSLog("TipTapWebView nativeHydrate failed source=%@", String(source.prefix(100)))
                    #endif
                    continue
                }
                let srcB64 = Data(source.utf8).base64EncodedString()
                let urlB64 = Data(display.utf8).base64EncodedString()
                let setJS = """
                (function(){
                  function dec(b64){
                    var bin = atob(b64);
                    var bytes = new Uint8Array(bin.length);
                    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                    return new TextDecoder('utf-8').decode(bytes);
                  }
                  var src = dec('\(srcB64)');
                  var url = dec('\(urlB64)');
                  var report = [];
                  document.querySelectorAll('img').forEach(function(img){
                    var cur = img.getAttribute('src') || '';
                    var orig = img.dataset.originalSrc || '';
                    if (cur === src || orig === src || (src.indexOf('data:') === 0 && cur === src) || cur === src) {
                      if (!img.dataset.originalSrc && src.indexOf('data:') !== 0) img.dataset.originalSrc = src;
                      img.setAttribute('src', url);
                      // Demo notes store width=35 meaning 35% (Android). Bare width="35" collapses to 35px.
                      var wAttr = img.getAttribute('width') || img.getAttribute('data-width');
                      if (wAttr && String(wAttr).match(/^\\d+(\\.\\d+)?$/)) {
                        img.removeAttribute('width');
                        img.style.width = wAttr + '%';
                      }
                      img.style.maxWidth = '100%';
                      img.style.height = 'auto';
                      img.style.display = 'block';
                      img.style.margin = '12px 0';
                    }
                    report.push({
                      nw: img.naturalWidth, nh: img.naturalHeight,
                      cw: img.clientWidth, ch: img.clientHeight,
                      w: img.getAttribute('width'),
                      src: (img.getAttribute('src')||'').slice(0, 48)
                    });
                  });
                  return JSON.stringify(report);
                })();
                """
                await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
                    DispatchQueue.main.async {
                        webView.evaluateJavaScript(setJS) { value, error in
                            #if DEBUG
                            if let error { NSLog("TipTapWebView set img src error: \(error)") }
                            if let value { NSLog("TipTapWebView img metrics: \(value)") }
                            #endif
                            cont.resume()
                        }
                    }
                }
            }

            // Second metrics pass after decode/layout.
            let metricsJS = """
            (function(){
              return JSON.stringify(Array.from(document.querySelectorAll('img')).map(function(img){
                return {nw: img.naturalWidth, nh: img.naturalHeight, cw: img.clientWidth, ch: img.clientHeight,
                        complete: img.complete, src: (img.getAttribute('src')||'').slice(0,40)};
              }));
            })();
            """
            try? await Task.sleep(nanoseconds: 300_000_000)
            await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
                DispatchQueue.main.async {
                    webView.evaluateJavaScript(metricsJS) { value, _ in
                        #if DEBUG
                        if let value { NSLog("TipTapWebView img metrics after layout: \(value)") }
                        #endif
                        cont.resume()
                    }
                }
            }
        }

        /// Rewrite `image` node `attrs.src` values that need native loading.
        static func hydrateImageSourcesInJSON(
            _ json: String,
            baseURL: URL?,
            token: String?,
            resourceCache: ResourceCache
        ) async -> String {
            guard
                let data = json.data(using: .utf8),
                var root = try? JSONSerialization.jsonObject(with: data)
            else { return json }
            await replaceImageSources(in: &root, baseURL: baseURL, token: token, resourceCache: resourceCache)
            guard
                let out = try? JSONSerialization.data(withJSONObject: root, options: []),
                let text = String(data: out, encoding: .utf8)
            else { return json }
            return text
        }

        static func hydrateImageSourcesInMarkdown(
            _ markdown: String,
            baseURL: URL?,
            token: String?,
            resourceCache: ResourceCache
        ) async -> String {
            // ![alt](src) — replace src when it needs native hydration.
            let pattern = #"!\[([^\]]*)\]\(([^)]+)\)"#
            guard let regex = try? NSRegularExpression(pattern: pattern) else { return markdown }
            let ns = markdown as NSString
            let matches = regex.matches(in: markdown, range: NSRange(location: 0, length: ns.length))
            var result = markdown
            // Replace from the end so ranges stay valid.
            for match in matches.reversed() {
                guard match.numberOfRanges >= 3,
                      let srcRange = Range(match.range(at: 2), in: result)
                else { continue }
                let src = String(result[srcRange]).trimmingCharacters(in: .whitespacesAndNewlines)
                if src.hasPrefix("data:") || src.hasPrefix("edgeever-res:") { continue }
                guard let display = await loadResourceDataURL(
                    source: src, baseURL: baseURL, token: token, resourceCache: resourceCache
                ) else { continue }
                result.replaceSubrange(srcRange, with: display)
            }
            return result
        }

        private static func replaceImageSources(
            in node: inout Any,
            baseURL: URL?,
            token: String?,
            resourceCache: ResourceCache
        ) async {
            if var dict = node as? [String: Any] {
                if dict["type"] as? String == "image",
                   var attrs = dict["attrs"] as? [String: Any]
                {
                    if let src = attrs["src"] as? String,
                       !src.hasPrefix("data:"),
                       !src.hasPrefix("edgeever-res:"),
                       !src.hasPrefix("blob:"),
                       let display = await loadResourceDataURL(
                           source: src, baseURL: baseURL, token: token, resourceCache: resourceCache
                       )
                    {
                        attrs["src"] = display
                    }
                    // Demo / Android store width as percent (e.g. 35). Drop bare numeric width so
                    // the browser does not treat it as 35 CSS pixels (nearly invisible).
                    if let width = attrs["width"] as? Int {
                        attrs["data-width"] = String(width)
                        attrs["width"] = NSNull()
                    } else if let width = attrs["width"] as? Double {
                        attrs["data-width"] = String(Int(width))
                        attrs["width"] = NSNull()
                    } else if let width = attrs["width"] as? String, width.range(of: #"^\d+$"#, options: .regularExpression) != nil {
                        attrs["data-width"] = width
                        attrs["width"] = NSNull()
                    }
                    dict["attrs"] = attrs
                }
                for key in dict.keys {
                    guard var child = dict[key] else { continue }
                    await replaceImageSources(in: &child, baseURL: baseURL, token: token, resourceCache: resourceCache)
                    dict[key] = child
                }
                node = dict
            } else if var arr = node as? [Any] {
                for i in arr.indices {
                    var child = arr[i]
                    await replaceImageSources(in: &child, baseURL: baseURL, token: token, resourceCache: resourceCache)
                    arr[i] = child
                }
                node = arr
            }
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
                if let targetJson = body["targetJson"] as? String,
                   let target = ResourceTarget.parse(targetJson)
                {
                    DispatchQueue.main.async { [parent] in
                        parent.onResourcePress?(target)
                    }
                }
            case "imagePreview":
                let source = body["source"] as? String ?? ""
                let alt = body["alt"] as? String ?? ""
                guard !source.isEmpty else { break }
                DispatchQueue.main.async { [parent] in
                    parent.onImagePreview?(source, alt)
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
                    // Disk cache stores raw bytes only — re-detect MIME (SVG must not become image/jpeg).
                    let mime = Self.resolvedImageMime(header: nil, data: cached)
                    _ = try? await resourceCache.dataURL(for: id, data: cached, mimeType: mime)
                    return await Self.displayURL(for: id, data: cached, mimeType: mime)
                }

                let client = APIClient(baseURL: base, token: token)
                do {
                    let result = try await client.getResourceData(path: path)
                    let mime = Self.resolvedImageMime(header: result.mimeType, data: result.data)
                    _ = try? await resourceCache.dataURL(for: id, data: result.data, mimeType: mime)
                    return await Self.displayURL(for: id, data: result.data, mimeType: mime)
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
                    let mime = Self.resolvedImageMime(header: result.mimeType, data: result.data)
                    let id = Self.publicResourceId(for: trimmed)
                    return await Self.displayURL(for: id, data: result.data, mimeType: mime)
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
                        let mime = Self.resolvedImageMime(header: result.mimeType, data: result.data)
                        let id = Self.publicResourceId(for: absolute)
                        return await Self.displayURL(for: id, data: result.data, mimeType: mime)
                    }
                }
            }
            return nil
        }

        /// Prefer data: for SVG (tiny + reliable in WKWebView); use custom scheme for binary images.
        static func displayURL(for resourceId: String, data: Data, mimeType: String) async -> String {
            let mime = resolvedImageMime(header: mimeType, data: data)
            if mime.contains("svg") || isSvgData(data) {
                // Base64 data URL: avoids custom-scheme SVG quirks and special-char escaping issues.
                return "data:image/svg+xml;base64,\(data.base64EncodedString())"
            }
            await ResourceBlobStore.shared.put(id: resourceId, data: data, mimeType: mime)
            return EdgeEverResourceSchemeHandler.localURL(for: resourceId)
        }

        static func resolvedImageMime(header: String?, data: Data) -> String {
            let headerMime = (header ?? "")
                .split(separator: ";")
                .first
                .map(String.init)?
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased() ?? ""
            if headerMime.hasPrefix("image/") || headerMime == "image/svg+xml" {
                // Trust server for real image/*; still override wrong octet sniff for SVG files.
                if isSvgData(data) { return "image/svg+xml" }
                return headerMime
            }
            if isSvgData(data) { return "image/svg+xml" }
            if headerMime.hasPrefix("application/") && !headerMime.contains("octet-stream") {
                // e.g. application/xml for some SVG hosts
                if isSvgData(data) { return "image/svg+xml" }
            }
            return sniffImageMime(data)
        }

        static func isSvgData(_ data: Data) -> Bool {
            guard let head = String(data: data.prefix(256), encoding: .utf8)?
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased()
            else { return false }
            return head.hasPrefix("<svg") || head.hasPrefix("<?xml") && head.contains("<svg")
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
            if isSvgData(data) { return "image/svg+xml" }
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
