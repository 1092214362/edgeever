import "./styles.css";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import CodeBlock from "@tiptap/extension-code-block";
import { TableKit } from "@tiptap/extension-table";
import { Markdown } from "@tiptap/markdown";
import mermaid from "mermaid";

type BridgeMessage =
  | { type: "ready"; startupMs: number }
  | { type: "change"; contentMarkdown: string; contentJson: string }
  | { type: "loadResource"; requestId: string; source: string }
  | { type: "resourcePress"; targetJson: string }
  | { type: "activeFlags"; flags: number }
  | { type: "log"; message: string }
  | { type: "error"; message: string };

type ConfigureOptions = {
  mode?: "viewer" | "editor";
  locale?: string;
  theme?: "light" | "dark";
  placeholder?: string;
};

const startedAt = performance.now();
let mode: "viewer" | "editor" = "viewer";
let suppressChange = false;
const resourceResolvers = new Map<string, (dataUrl: string | null) => void>();
let resourceSeq = 0;

function post(msg: BridgeMessage) {
  try {
    (window as unknown as { webkit?: { messageHandlers?: { edgeever?: { postMessage: (m: unknown) => void } } } })
      .webkit?.messageHandlers?.edgeever?.postMessage(msg);
  } catch {
    // native host unavailable (browser preview)
  }
}

function isProtectedResource(src: string): boolean {
  return src.startsWith("/api/") || src.includes("/api/v1/resources/");
}

/** file:// editor pages often cannot load remote/protected img srcs; native must rewrite them. */
function needsNativeHydration(src: string): boolean {
  if (!src || src.startsWith("data:") || src.startsWith("blob:") || src.startsWith("edgeever-res:")) {
    return false;
  }
  // Protected API paths always need auth + rewrite.
  if (isProtectedResource(src)) return true;
  // Absolute remote images also need rewrite under file:// packaging.
  if (src.startsWith("http://") || src.startsWith("https://")) return true;
  // Root-relative non-api assets resolved via native base URL.
  if (src.startsWith("/")) return true;
  return false;
}

function requestResource(source: string): Promise<string | null> {
  return new Promise((resolve) => {
    const requestId = `r${++resourceSeq}`;
    resourceResolvers.set(requestId, resolve);
    post({ type: "loadResource", requestId, source });
    // Timeout so broken resources don't hang forever.
    setTimeout(() => {
      if (resourceResolvers.delete(requestId)) resolve(null);
    }, 30_000);
  });
}

async function hydrateProtectedImages(root: HTMLElement) {
  const images = Array.from(root.querySelectorAll<HTMLImageElement>("img[src]"));
  await Promise.all(
    images.map(async (img) => {
      const src = img.getAttribute("src") || "";
      if (!needsNativeHydration(src)) return;
      if (!img.dataset.originalSrc) img.dataset.originalSrc = src;
      // Avoid re-requesting while a previous hydrate is in flight for the same original.
      if (img.dataset.hydrating === "1") return;
      img.dataset.hydrating = "1";
      try {
        const dataUrl = await requestResource(src);
        if (dataUrl) img.setAttribute("src", dataUrl);
      } finally {
        delete img.dataset.hydrating;
      }
    })
  );
}

async function renderMermaidBlocks(root: HTMLElement, theme: "light" | "dark") {
  const codeBlocks = Array.from(root.querySelectorAll("pre code.language-mermaid, pre code[class*='mermaid']"));
  // Also treat fenced mermaid paragraphs produced as codeBlock with language attr via data
  const preBlocks = Array.from(root.querySelectorAll("pre")).filter((pre) => {
    const text = pre.textContent || "";
    return pre.querySelector("code") && /^(graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|mindmap|flowchart)/m.test(text.trim());
  });

  const targets = new Set([...codeBlocks.map((c) => c.parentElement!).filter(Boolean), ...preBlocks]);
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: theme === "dark" ? "dark" : "default",
  });

  let i = 0;
  for (const pre of targets) {
    const source = (pre.textContent || "").trim();
    if (!source) continue;
    try {
      const id = `mmd-${Date.now()}-${i++}`;
      const { svg } = await mermaid.render(id, source);
      const wrap = document.createElement("div");
      wrap.className = "edgeever-mermaid";
      wrap.innerHTML = svg;
      pre.replaceWith(wrap);
    } catch {
      // leave code block as-is
    }
  }
}

function buildExtensions(placeholder: string) {
  return [
    StarterKit.configure({
      codeBlock: false,
    }),
    CodeBlock.configure({
      languageClassPrefix: "language-",
    }),
    Image.configure({
      inline: false,
      allowBase64: true,
    }),
    TableKit.configure({
      table: { resizable: false },
    }),
    Placeholder.configure({
      placeholder,
    }),
    Markdown.configure({
      markedOptions: { gfm: true },
    }),
  ];
}

const editorEl = document.getElementById("editor")!;
const toolbarEl = document.getElementById("toolbar")!;

const editor = new Editor({
  element: editorEl,
  extensions: buildExtensions("开始书写…"),
  editable: false,
  content: { type: "doc", content: [{ type: "paragraph" }] },
  onUpdate: ({ editor: ed }) => {
    if (suppressChange || mode !== "editor") return;
    emitChange(ed);
  },
  editorProps: {
    attributes: {
      class: "edgeever-prose",
      spellcheck: "true",
    },
    handleClick(_view, _pos, event) {
      const target = event.target as HTMLElement | null;
      const img = target?.closest("img");
      if (img instanceof HTMLImageElement) {
        const src = img.dataset.originalSrc || img.getAttribute("src") || "";
        if (src && isProtectedResource(src)) {
          post({
            type: "resourcePress",
            targetJson: JSON.stringify({
              kind: "image",
              href: src,
              filename: img.getAttribute("alt") || "image",
              resourceId: src.split("/").filter(Boolean).pop() || "",
            }),
          });
          return true;
        }
      }
      const link = target?.closest("a");
      if (link instanceof HTMLAnchorElement) {
        const href = link.getAttribute("href") || "";
        if (isProtectedResource(href)) {
          post({
            type: "resourcePress",
            targetJson: JSON.stringify({
              kind: "attachment",
              href,
              filename: link.textContent || "file",
              resourceId: href.split("/").filter(Boolean).pop() || "",
            }),
          });
          return true;
        }
      }
      return false;
    },
  },
});

function emitChange(ed: Editor) {
  try {
    const contentJson = JSON.stringify(ed.getJSON());
    // @tiptap/markdown storage
    const storage = ed.storage as { markdown?: { getMarkdown?: () => string } };
    const contentMarkdown =
      storage.markdown?.getMarkdown?.() ??
      // fallback: plain text
      ed.getText({ blockSeparator: "\n\n" });
    post({ type: "change", contentMarkdown, contentJson });
  } catch (error) {
    post({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
}

function setToolbarVisible(visible: boolean) {
  toolbarEl.classList.toggle("editor-mode", visible);
  toolbarEl.innerHTML = "";
  if (!visible) return;
  const actions: Array<{ id: string; label: string; run: () => void }> = [
    { id: "bold", label: "B", run: () => editor.chain().focus().toggleBold().run() },
    {
      id: "bullet",
      label: "•",
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      id: "quote",
      label: "❝",
      run: () => editor.chain().focus().toggleBlockquote().run(),
    },
    {
      id: "hr",
      label: "—",
      run: () => editor.chain().focus().setHorizontalRule().run(),
    },
    {
      id: "h2",
      label: "H2",
      run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      id: "code",
      label: "</>",
      run: () => editor.chain().focus().toggleCodeBlock().run(),
    },
  ];
  for (const action of actions) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = action.label;
    btn.dataset.action = action.id;
    btn.addEventListener("click", () => {
      action.run();
      emitChange(editor);
    });
    toolbarEl.appendChild(btn);
  }
}

async function afterContentSet(theme: "light" | "dark" = "light") {
  await hydrateProtectedImages(editorEl);
  if (mode === "viewer") {
    await renderMermaidBlocks(editorEl, theme);
  }
}

export type EdgeEverEditorAPI = {
  configure: (opts: ConfigureOptions) => void;
  setMarkdown: (md: string) => void;
  setDocumentFromJSON: (json: string) => void;
  resolveResource: (requestId: string, dataUrl: string | null) => void;
  getMarkdown: () => string;
  getDocument: () => string;
  focusEnd: () => void;
  flush: () => void;
  exec: (actionId: string) => void;
  beginImageUpload: (uploadId: string, previewDataUrl: string) => void;
  completeImageUpload: (uploadId: string, imageUrl: string, alt: string) => void;
  cancelImageUpload: (uploadId: string) => void;
};

const api: EdgeEverEditorAPI = {
  configure(opts) {
    const nextMode = opts.mode === "editor" ? "editor" : "viewer";
    const modeChanged = nextMode !== mode;
    mode = nextMode;
    editor.setEditable(mode === "editor");
    setToolbarVisible(mode === "editor");
    document.documentElement.dataset.theme = opts.theme || "light";
    if (opts.placeholder) {
      // placeholder is extension config; update via meta class
      editorEl.setAttribute("data-placeholder", opts.placeholder);
    }
    // Only when switching into editor: make the surface focusable.
    // Do NOT force caret to document end — that makes mid-doc editing unusable.
    if (mode === "editor" && modeChanged) {
      requestAnimationFrame(() => {
        try {
          editor.commands.focus();
        } catch {
          /* ignore */
        }
      });
    }
  },

  setMarkdown(md) {
    suppressChange = true;
    try {
      editor.commands.setContent(md || "", { contentType: "markdown" } as never);
    } catch {
      try {
        const manager = (editor.storage as { markdown?: { manager?: { parse: (s: string) => unknown } } }).markdown
          ?.manager;
        if (manager) {
          editor.commands.setContent(manager.parse(md || "") as never);
        } else {
          throw new Error("no markdown manager");
        }
      } catch {
        editor.commands.setContent({
          type: "doc",
          content: [{ type: "paragraph", content: md ? [{ type: "text", text: md }] : [] }],
        });
      }
    }
    // Keep editability; do not steal selection / force caret to end.
    editor.setEditable(mode === "editor");
    suppressChange = false;
    void afterContentSet((document.documentElement.dataset.theme as "light" | "dark") || "light");
  },

  setDocumentFromJSON(json) {
    suppressChange = true;
    try {
      const doc = JSON.parse(json);
      editor.commands.setContent(doc);
    } catch {
      editor.commands.setContent({ type: "doc", content: [{ type: "paragraph" }] });
    }
    editor.setEditable(mode === "editor");
    suppressChange = false;
    void afterContentSet((document.documentElement.dataset.theme as "light" | "dark") || "light");
  },

  resolveResource(requestId, dataUrl) {
    const resolver = resourceResolvers.get(requestId);
    if (resolver) {
      resourceResolvers.delete(requestId);
      resolver(dataUrl);
    }
  },

  getMarkdown() {
    const storage = editor.storage as { markdown?: { getMarkdown?: () => string } };
    return storage.markdown?.getMarkdown?.() ?? editor.getText({ blockSeparator: "\n\n" });
  },

  getDocument() {
    return JSON.stringify(editor.getJSON());
  },

  focusEnd() {
    editor.commands.focus("end");
  },

  flush() {
    emitChange(editor);
  },

  exec(actionId) {
    const map: Record<string, () => void> = {
      bold: () => editor.chain().focus().toggleBold().run(),
      bulletList: () => editor.chain().focus().toggleBulletList().run(),
      blockquote: () => editor.chain().focus().toggleBlockquote().run(),
      horizontalRule: () => editor.chain().focus().setHorizontalRule().run(),
      heading2: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      codeBlock: () => editor.chain().focus().toggleCodeBlock().run(),
    };
    map[actionId]?.();
    emitChange(editor);
  },

  beginImageUpload(uploadId, previewDataUrl) {
    editor
      .chain()
      .focus()
      .setImage({ src: previewDataUrl, alt: uploadId })
      .run();
    // mark last image
    const imgs = editorEl.querySelectorAll("img");
    const last = imgs[imgs.length - 1] as HTMLImageElement | undefined;
    if (last) last.dataset.uploadId = uploadId;
    emitChange(editor);
  },

  completeImageUpload(uploadId, imageUrl, alt) {
    const img = editorEl.querySelector(`img[data-upload-id="${uploadId}"]`) as HTMLImageElement | null;
    if (img) {
      img.setAttribute("src", imageUrl);
      img.dataset.originalSrc = imageUrl;
      if (alt) img.setAttribute("alt", alt);
      delete img.dataset.uploadId;
    } else {
      editor.chain().focus().setImage({ src: imageUrl, alt }).run();
    }
    emitChange(editor);
  },

  cancelImageUpload(uploadId) {
    const img = editorEl.querySelector(`img[data-upload-id="${uploadId}"]`);
    img?.remove();
    emitChange(editor);
  },
};

(window as unknown as { EdgeEverEditor: EdgeEverEditorAPI }).EdgeEverEditor = api;
setToolbarVisible(false);
post({ type: "ready", startupMs: Math.round(performance.now() - startedAt) });
