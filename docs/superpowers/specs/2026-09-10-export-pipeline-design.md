# Design: Export pipeline — render the document, not the editor

Date: 2026-09-10
Status: designed

## Problem

File → Export (HTML) and Export → PDF both work by cloning the live editor
DOM. That DOM is an editing surface, not a rendering of the document, and
the export inherits every editing compromise:

- **Viewport-dependent content.** Crepe's code block mounts CodeMirror only
  while the block is within 200px of the viewport and tears it down five
  seconds after it leaves. Code blocks the user has not scrolled past
  export as an unhighlighted `<pre>` placeholder; Mermaid blocks outside
  the viewport export as raw diagram source instead of an SVG. What the
  export contains depends on where the user scrolled before pressing ⌘E.
- **Editor chrome.** Mounted blocks carry line numbers, fold-gutter arrows,
  the active-line band, and CodeMirror's hidden measuring elements.
- **The whole app stylesheet.** All ~960 rules (≈160 KB) are inlined,
  including toolbar, review-bar, dialog, and focus-mode CSS that has no
  meaning outside the app, and `@font-face` rules whose `src` points at
  bundled asset paths that do not exist beside the export, so every export
  falls back to system fonts.
- **Relative images** stay relative and break the moment the HTML is
  moved anywhere.

PDF prints the same live DOM through the native print panel, so it has the
same viewport dependence.

## Approach

Render Markdown to HTML with a proper pipeline, independent of the editor:

```
markdown ─ remark-parse + remark-gfm ─▶ mdast
        ─ async pre-pass: highlight code, render mermaid, embed images
        ─ remark-rehype (custom handlers read the pre-pass results)
        ─ rehype-stringify ─▶ body HTML
        ─ buildHtmlDocument(title, body, export.css + embedded fonts)
```

The editor is not consulted at all. Source mode no longer has to be exited
to export; the current Markdown (from whichever view is live) is the input.

Three properties:

- **Deterministic.** The same Markdown always produces the same HTML,
  regardless of scroll position or which blocks happen to be mounted.
- **Self-contained.** Fonts and local images travel inside the file as
  data URIs, so the export renders identically anywhere.
- **Small stylesheet.** A dedicated `export.css` in the paper palette, a
  few KB, written for a static page.

## Components

### `src/exportrender.ts` (new)

`renderExportHtml(markdown, hooks): Promise<string>` — the pipeline above.
Pure with respect to the DOM except through `hooks`, so the structural
behaviour is unit-testable in Node:

```ts
interface ExportHooks {
  /** Highlighted HTML for a fenced block (spans with tok-* classes), or
   *  null to emit plain escaped code. */
  highlight(code: string, language: string): Promise<string | null>;
  /** SVG markup for a mermaid block, or null to fall back to code. */
  mermaid(code: string): Promise<string | null>;
  /** Replacement src for an image (data URI), or null to keep it. */
  image(src: string): Promise<string | null>;
}
```

The pre-pass walks the mdast once, awaits every hook, and stores results in
a `Map<node, string>`; `remark-rehype` handlers for `code`, `image`, and
`html` then emit `raw` nodes from the map. `allowDangerousHtml` keeps raw
HTML blocks intact without pulling in `rehype-raw`.

Output structure is plain semantic HTML: `<pre class="code" data-lang>`,
`<figure class="mermaid">`, `<ul class="task-list">` with disabled
checkboxes, `<table>` with `align` attributes.

### `src/exporthooks.ts` (new, browser-only)

The real hooks:

- **highlight** — `@codemirror/language-data` resolves the language, loads
  its Lezer parser (already bundled for the editor), and
  `@lezer/highlight`'s `highlightCode` with `classHighlighter` emits
  `tok-keyword`, `tok-string`, … spans. Unknown language → null.
- **mermaid** — the existing `renderMermaidDiagram` from `src/mermaid.ts`.
- **image** — `localImagePath` (from `src/images.ts`) → `convertFileSrc` →
  `fetch` → base64 data URI. Remote and unresolvable srcs → null.

### `src/export.css` (new)

Static-page stylesheet in the paper palette: prose measure, editorial
heading scale, tables, blockquotes, task lists, `.code` blocks with a
`tok-*` colour set matching the editor's, `.mermaid` figures, and print
rules (`@page` margins, `break-inside: avoid` on blocks). Imported as a raw
string (`?raw`) so it is inlined into the export.

### Fonts

`collectExportFonts()` in `src/main.ts` finds the app's `@font-face` rules
for the latin subsets of Newsreader (normal + italic), Instrument Sans, and
JetBrains Mono, fetches each `src`, and rewrites the rule with a base64
data URI. Computed once per session and cached. ≈190 KB of woff2 → ≈255 KB
of CSS; the export renders in the app's typefaces everywhere.

### `src/export.ts`

`buildHtmlDocument` keeps its signature; its export-only override block
goes away because the stylesheet is purpose-built. `htmlExportTarget` and
`escapeHtml` are unchanged.

### PDF

`exportPdf` renders the same HTML into a hidden `<iframe>` in the window
and calls the frame's `print()`, so the print panel sees the rendered
document instead of the editor. The existing `print_document` Rust command
and the app's print CSS become unused and are removed.

## Error handling

- A hook that throws is treated as null (plain code, code instead of a
  diagram, original src); the export never fails because one block did.
- If font fetching fails, the export ships without embedded fonts and the
  `font-family` stacks fall back to Georgia / system sans / monospace.

## Testing

- `tests/exportrender.test.ts` drives the pipeline with stub hooks and
  asserts on the HTML for each construct: headings, emphasis, links,
  images (embedded vs kept), fenced code with and without a highlighter,
  mermaid success and fallback, tables with alignment, task lists, raw
  HTML pass-through, and that a throwing hook degrades rather than fails.
- `tests/export.test.ts` continues to cover `buildHtmlDocument` and
  `htmlExportTarget`.
- The evaluation suite in `evaluation/` is the manual check: export
  `04-code.md`, `05-tables.md`, and a Mermaid document without scrolling
  and confirm every block is highlighted or rendered.

## Out of scope

- Word/docx export (roadmap P0 item 1) — a separate pipeline.
- Theme-aware export (Night/Newsprint) — exports always use the paper
  palette; a printed or shared document should not depend on the author's
  screen theme.
