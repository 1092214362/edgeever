import MarkdownIt from "markdown-it";

const markdown = new MarkdownIt({
  breaks: false,
  html: false,
  linkify: true,
  typographer: false,
});

const lightCss = `
  :root {
    color-scheme: light;
    --bg: #ffffff;
    --fg: #0f172a;
    --muted: #64748b;
    --border: #dedede;
    --th-bg: #f2f2f2;
    --quote-bg: #f8fafc;
    --quote-border: #94a3b8;
    --code-bg: #f1f5f9;
    --code-fg: #334155;
    --pre-bg: #0f172a;
    --pre-fg: #e2e8f0;
    --link: #059669;
    --hr: #e2e8f0;
  }
`;

const darkCss = `
  :root {
    color-scheme: dark;
    --bg: #0f172a;
    --fg: #f8fafc;
    --muted: #94a3b8;
    --border: #334155;
    --th-bg: #1e293b;
    --quote-bg: #1e293b;
    --quote-border: #64748b;
    --code-bg: #1e293b;
    --code-fg: #e2e8f0;
    --pre-bg: #020617;
    --pre-fg: #e2e8f0;
    --link: #6ee7b7;
    --hr: #334155;
  }
`;

const sharedCss = `
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: var(--bg);
    color: var(--fg);
    font: 400 16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    -webkit-text-size-adjust: 100%;
    word-wrap: break-word;
  }
  body { padding: 4px 2px 48px; }
  h1, h2, h3, h4, h5, h6 {
    line-height: 1.3;
    margin: 1.1em 0 0.45em;
    font-weight: 800;
  }
  h1 { font-size: 1.6rem; }
  h2 { font-size: 1.3rem; }
  h3 { font-size: 1.12rem; }
  h4, h5, h6 { font-size: 1rem; }
  p { margin: 0 0 0.85em; }
  strong { font-weight: 800; }
  em { font-style: italic; }
  a { color: var(--link); text-decoration: none; }
  blockquote {
    margin: 0.8em 0;
    padding: 0.55em 0.9em;
    border-left: 3px solid var(--quote-border);
    background: var(--quote-bg);
    color: var(--fg);
  }
  blockquote p:last-child { margin-bottom: 0; }
  ul, ol { margin: 0.5em 0 0.9em; padding-left: 1.4em; }
  li { margin: 0.25em 0; }
  hr {
    border: 0;
    border-top: 1px solid var(--hr);
    margin: 1.1em 0;
  }
  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.92em;
    background: var(--code-bg);
    color: var(--code-fg);
    border-radius: 4px;
    padding: 0.1em 0.35em;
  }
  pre {
    background: var(--pre-bg);
    color: var(--pre-fg);
    border-radius: 8px;
    padding: 12px;
    overflow-x: auto;
    margin: 0.8em 0;
  }
  pre code {
    background: transparent;
    color: inherit;
    padding: 0;
    font-size: 0.88em;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 0.8em 0 1em;
    font-size: 0.95em;
  }
  th, td {
    border: 1px solid var(--border);
    padding: 0.45em 0.65em;
    text-align: left;
    vertical-align: top;
  }
  th {
    background: var(--th-bg);
    font-weight: 700;
  }
  img {
    max-width: 100%;
    height: auto;
    border-radius: 8px;
  }
`;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Render note markdown to a self-contained HTML document for a static WebView (JS off). */
export const buildMemoDetailHtml = (
  markdownSource: string,
  theme: "light" | "dark" = "light",
  meta?: { notebookName?: string; tags?: string[]; title?: string }
): string => {
  const body = markdown.render(markdownSource || "");
  const title = meta?.title?.trim() ? `<h1 class="note-title">${escapeHtml(meta.title.trim())}</h1>` : "";
  const notebook = meta?.notebookName
    ? `<div class="note-meta"><span class="note-notebook">${escapeHtml(meta.notebookName)}</span>${
      meta.tags?.length
        ? `<span class="note-tags">${escapeHtml(meta.tags.join(", "))}</span>`
        : ""
    }</div><hr class="note-divider" />`
    : "";
  const metaCss = `
    h1.note-title { font-size: 1.55rem; margin: 0 0 0.55em; }
    .note-meta { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; color: var(--muted); font-size: 0.92rem; margin-bottom: 0.75em; }
    .note-notebook { font-weight: 600; }
    .note-tags { opacity: 0.9; }
    hr.note-divider { margin: 0.4em 0 1em; }
  `;
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <style>
    ${theme === "dark" ? darkCss : lightCss}
    ${sharedCss}
    ${metaCss}
  </style>
</head>
<body>${title}${notebook}${body}</body>
</html>`;
};
