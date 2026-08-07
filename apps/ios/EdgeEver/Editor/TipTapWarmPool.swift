import Foundation
import UIKit
import WebKit

/// Active binding from a SwiftUI `TipTapWebView` surface onto a shared runtime.
struct TipTapSession {
    var mode: TipTapMode
    var documentJSON: String
    var markdown: String
    var baseURL: URL?
    var token: String?
    var onChange: ((String, String) -> Void)?
    var onResourcePress: ((ResourceTarget) -> Void)?
    var onImagePreview: ((_ source: String, _ alt: String) -> Void)?
    var onBodyReady: (() -> Void)?
}

/// One long-lived TipTap WKWebView per mode (viewer / editor).
/// Note switches re-parent the same web view and only call setContent — no 4MB bundle reload.
@MainActor
final class SharedTipTapRuntime: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
    enum Slot: String {
        case viewer
        case editor
    }

    static let viewer = SharedTipTapRuntime(slot: .viewer)
    static let editor = SharedTipTapRuntime(slot: .editor)

    static let processPool = WKProcessPool()

    let slot: Slot
    let webView: WKWebView
    private let resourceCache = ResourceCache()
    /// Retained — WKWebViewConfiguration does not keep a strong ref that we own.
    private let schemeHandler: EdgeEverResourceSchemeHandler

    private var ready = false
    private var lastPushedJSON: String?
    private var lastEditorEmittedFingerprint: String?
    private var lastAppliedMode: String?
    private var hydrateGeneration: UInt64 = 0
    private var bodyReadyGeneration: UInt64 = 0
    private var contentGeneration: UInt64 = 0

    private(set) var session: TipTapSession?
    private weak var hostContainer: UIView?

    private init(slot: Slot) {
        self.slot = slot
        let handler = EdgeEverResourceSchemeHandler()
        self.schemeHandler = handler
        let config = WKWebViewConfiguration()
        config.processPool = Self.processPool
        config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        // Scheme handler must be registered before first load.
        config.setURLSchemeHandler(handler, forURLScheme: EdgeEverResourceSchemeHandler.scheme)
        let wv = WKWebView(frame: .zero, configuration: config)
        wv.isOpaque = false
        wv.backgroundColor = .white
        wv.scrollView.clipsToBounds = true
        wv.scrollView.contentInsetAdjustmentBehavior = .never
        wv.scrollView.delaysContentTouches = false
        self.webView = wv
        super.init()
        wv.navigationDelegate = self
        let ucc = wv.configuration.userContentController
        ucc.removeScriptMessageHandler(forName: "edgeever")
        ucc.add(self, name: "edgeever")
        loadEditorBundle()
    }

    // MARK: - Warmup

    /// Ensure both runtimes exist and EditorBundle is loading (call after sign-in).
    static func warmIfNeeded() {
        _ = SharedTipTapRuntime.viewer
        _ = SharedTipTapRuntime.editor
        #if DEBUG
        NSLog("SharedTipTapRuntime: warm viewer+editor slots")
        #endif
    }

    // MARK: - Attach / bind

    func attach(to container: UIView) {
        if hostContainer === container, webView.superview === container {
            layoutWebView(in: container)
            return
        }
        hostContainer = container
        if webView.superview !== container {
            webView.removeFromSuperview()
            container.addSubview(webView)
        }
        layoutWebView(in: container)
    }

    func detach(from container: UIView) {
        guard hostContainer === container else { return }
        // Keep the engine alive off-screen; only leave the hierarchy.
        webView.removeFromSuperview()
        hostContainer = nil
        // Drop action callbacks for the dismantled SwiftUI host, but keep session
        // content fingerprints so the next attach can re-push or re-notify ready.
        if var s = session {
            s.onChange = nil
            s.onResourcePress = nil
            s.onImagePreview = nil
            s.onBodyReady = nil
            session = s
        }
    }

    func bind(_ newSession: TipTapSession) {
        let previousFingerprint = lastPushedJSON
        session = newSession
        let fp = contentFingerprint(newSession).fingerprint
        if fp != previousFingerprint {
            contentGeneration &+= 1
            hydrateGeneration &+= 1
            // Do not zero bodyReadyGeneration here — pushContent / skip path will notify.
        }
        applyMode()
        pushContentIfNeeded(force: false)
        // Evernote-style: always try to open keyboard at end when the editor surface is shown.
        if newSession.mode == .editor {
            scheduleFocusEnd()
        }
    }

    /// Focus document end + make WKWebView first responder so the software keyboard appears.
    func focusEnd() {
        guard session?.mode == .editor else { return }
        // Keyboard requires first-responder status; JS focus alone is not enough after re-parent.
        if !webView.isFirstResponder {
            webView.becomeFirstResponder()
        }
        webView.evaluateJavaScript(
            """
            (function(){
              try {
                if (window.EdgeEverEditor && window.EdgeEverEditor.focusEnd) {
                  window.EdgeEverEditor.focusEnd();
                }
              } catch (e) {}
            })();
            """,
            completionHandler: nil
        )
    }

    private func scheduleFocusEnd() {
        // Wait until the host has laid out and (on edit page) opacity is full.
        let gen = contentGeneration
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) { [weak self] in
            guard let self, self.contentGeneration == gen else { return }
            self.focusEnd()
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { [weak self] in
            guard let self, self.contentGeneration == gen else { return }
            self.focusEnd()
        }
    }

    private func layoutWebView(in container: UIView) {
        webView.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.deactivate(webView.constraints)
        // Fill container via frame autoresizing for simplicity under SwiftUI hosting.
        webView.translatesAutoresizingMaskIntoConstraints = true
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.frame = container.bounds
    }

    // MARK: - Bundle load

    private func loadEditorBundle() {
        if let bundleURL = TipTapResourceLoader.packagedEditorHTMLURL() {
            let dir = bundleURL.deletingLastPathComponent()
            #if DEBUG
            NSLog("SharedTipTapRuntime[\(slot.rawValue)]: load EditorBundle size=%d", (try? Data(contentsOf: bundleURL))?.count ?? -1)
            #endif
            webView.loadFileURL(bundleURL, allowingReadAccessTo: dir)
        } else {
            #if DEBUG
            NSLog("SharedTipTapRuntime[\(slot.rawValue)]: EditorBundle missing — fallback HTML")
            #endif
            webView.loadHTMLString(TipTapResourceLoader.fallbackHTML, baseURL: Bundle.main.bundleURL)
        }
    }

    // MARK: - WKNavigationDelegate

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        ready = true
        lastAppliedMode = nil
        applyMode()
        pushContentIfNeeded(force: true)
    }

    // MARK: - Content

    private func applyMode() {
        guard ready, let session else { return }
        let mode = session.mode.rawValue
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

    private func contentFingerprint(_ session: TipTapSession) -> (fingerprint: String, useJSON: Bool) {
        let emptyStub = "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\"}]}"
        let json = session.documentJSON.trimmingCharacters(in: .whitespacesAndNewlines)
        let useJSON = !json.isEmpty && json != emptyStub
        if useJSON {
            return ("json:\(json)", true)
        }
        return ("md:\(session.markdown)", false)
    }

    func pushContentIfNeeded(force: Bool = false) {
        guard ready, let session else { return }
        let (fingerprint, useJSON) = contentFingerprint(session)
        let gen = contentGeneration

        // Already showing this document — still tell the host (SwiftUI often re-binds).
        if !force {
            if fingerprint == lastPushedJSON || fingerprint == lastEditorEmittedFingerprint {
                notifyBodyReady(generation: gen)
                if session.mode == .editor {
                    scheduleFocusEnd()
                }
                return
            }
        }

        lastPushedJSON = fingerprint

        if lastAppliedMode != session.mode.rawValue {
            applyMode()
        }

        let fn = useJSON ? "setDocumentFromJSON" : "setMarkdown"
        let payload = useJSON ? session.documentJSON : session.markdown
        let js = TipTapResourceLoader.jsCall(fn: fn, arg: payload)
        // Capture callback now — detach may nil session callbacks before the JS completion runs.
        let bodyReadyCb = session.onBodyReady
        let isEditor = session.mode == .editor
        webView.evaluateJavaScript(js) { [weak self] _, error in
            #if DEBUG
            if let error { NSLog("SharedTipTapRuntime pushContent error: \(error)") }
            #endif
            guard let self else { return }
            Task { @MainActor in
                guard self.contentGeneration == gen else { return }
                self.notifyBodyReady(generation: gen, callback: bodyReadyCb)
                if isEditor {
                    self.scheduleFocusEnd()
                }
                await self.nativeHydrateDOMImages(generation: gen)
            }
        }
    }

    private func notifyBodyReady(generation: UInt64, callback: (() -> Void)? = nil) {
        let cb = callback ?? session?.onBodyReady
        // Always invoke the *current* host callback when re-binding the same content,
        // even if we already marked this generation ready (new SwiftUI view needs it).
        bodyReadyGeneration = generation
        DispatchQueue.main.async { cb?() }
    }

    // MARK: - Image hydrate

    private func nativeHydrateDOMImages(generation: UInt64) async {
        guard contentGeneration == generation else { return }
        let listJS = """
        (function(){
          return Array.from(document.querySelectorAll('img[src]')).map(function(img){
            return img.dataset.originalSrc || img.getAttribute('src') || '';
          });
        })();
        """
        let raw: Any? = await withCheckedContinuation { cont in
            webView.evaluateJavaScript(listJS) { value, _ in
                cont.resume(returning: value)
            }
        }
        guard contentGeneration == generation else { return }
        let srcs = (raw as? [Any])?.compactMap { $0 as? String } ?? []
        let unique = Array(Set(srcs.filter { !$0.isEmpty }))
        let base = session?.baseURL
        let token = session?.token
        for source in unique {
            guard contentGeneration == generation else { return }
            if source.hasPrefix("data:") || source.hasPrefix("edgeever-res:") || source.hasPrefix("blob:") {
                continue
            }
            guard let display = await TipTapResourceLoader.loadResourceDataURL(
                source: source,
                baseURL: base,
                token: token,
                resourceCache: resourceCache
            ) else { continue }
            guard contentGeneration == generation else { return }
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
              document.querySelectorAll('img').forEach(function(img){
                var cur = img.getAttribute('src') || '';
                var orig = img.dataset.originalSrc || '';
                if (cur === src || orig === src) {
                  if (!img.dataset.originalSrc && src.indexOf('data:') !== 0) img.dataset.originalSrc = src;
                  img.setAttribute('src', url);
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
              });
            })();
            """
            await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
                webView.evaluateJavaScript(setJS) { _, _ in cont.resume() }
            }
        }
    }

    // MARK: - JS bridge

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "edgeever",
              let body = message.body as? [String: Any],
              let type = body["type"] as? String
        else { return }

        switch type {
        case "ready":
            ready = true
            lastAppliedMode = nil
            pushContentIfNeeded(force: true)
        case "change":
            guard let session else { return }
            let md = body["contentMarkdown"] as? String ?? ""
            let json = body["contentJson"] as? String ?? session.documentJSON
            let emptyStub = "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\"}]}"
            let j = json.trimmingCharacters(in: .whitespacesAndNewlines)
            let emitted = (!j.isEmpty && j != emptyStub) ? "json:\(j)" : "md:\(md)"
            lastEditorEmittedFingerprint = emitted
            lastPushedJSON = emitted
            session.onChange?(md, json)
        case "loadResource":
            let requestId = body["requestId"] as? String ?? ""
            let source = body["source"] as? String ?? ""
            let gen = contentGeneration
            Task { await resolveResource(requestId: requestId, source: source, generation: gen) }
        case "resourcePress":
            if let targetJson = body["targetJson"] as? String,
               let target = ResourceTarget.parse(targetJson)
            {
                let cb = session?.onResourcePress
                DispatchQueue.main.async { cb?(target) }
            }
        case "imagePreview":
            let source = body["source"] as? String ?? ""
            let alt = body["alt"] as? String ?? ""
            guard !source.isEmpty else { break }
            let cb = session?.onImagePreview
            DispatchQueue.main.async { cb?(source, alt) }
        default:
            break
        }
    }

    private func resolveResource(requestId: String, source: String, generation: UInt64) async {
        guard contentGeneration == generation else { return }
        let token = session?.token
        let base = session?.baseURL
        let displayURL = await TipTapResourceLoader.loadResourceDataURL(
            source: source,
            baseURL: base,
            token: token,
            resourceCache: resourceCache
        )
        guard contentGeneration == generation else { return }
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
          } catch (e) {}
        })();
        """
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            webView.evaluateJavaScript(js) { _, _ in cont.resume() }
        }
    }
}

// Keep TipTapWarmPool name as a thin alias so existing call sites compile.
enum TipTapWarmPool {
    static var processPool: WKProcessPool { SharedTipTapRuntime.processPool }

    @MainActor
    static func warmIfNeeded() {
        SharedTipTapRuntime.warmIfNeeded()
    }
}

/// Host UIView that only owns layout; the shared WKWebView is re-parented into it.
final class TipTapHostView: UIView {
    var onLayout: ((CGRect) -> Void)?

    override func layoutSubviews() {
        super.layoutSubviews()
        onLayout?(bounds)
        for sub in subviews {
            sub.frame = bounds
        }
    }
}
