<p align="center">
  <img src="assets/folio-icon.png" alt="Folio logo" width="128" />
</p>

<h1 align="center">Folio</h1>

<p align="center">
  A calm, Typora-style Markdown editor for macOS.<br/>
  Write in a single live-rendered page — no split panes, no clutter.
</p>

## Features

- **Seamless WYSIWYG editing** — Markdown renders inline as you type:
  headings, emphasis, lists, tables, code blocks, blockquotes, links, images
- **Typora-style native menus** — Paragraph (⌘1–6 headings, ⌥⌘Q quote,
  ⌥⌘T table, ⌥⌘C code fence, ⌥⌘O/U/X lists), Format (⌘B strong, ⌘I emphasis,
  ⌘K link, ⌘\\ clear format), and more
- **Source Code Mode** — ⌘/ flips between the rendered page and raw Markdown
- **Editorial design** — warm paper canvas, Newsreader serif prose, a single
  oxblood accent; the text is the interface
- **Native file handling** — open/save via macOS dialogs (⌘O / ⌘S / ⇧⌘S),
  dirty indicator, live word count, CRLF normalization
- **Zoom** — ⇧⌘= / ⇧⌘- / ⇧⌘0
- Small footprint (~5 MB DMG), no Electron

## Download

Grab the latest `Folio_aarch64.dmg` from
[Releases](https://github.com/rahult/folio/releases).

> Apple Silicon (aarch64) build. Folio is not notarized — on first launch,
> right-click → Open, or allow it in System Settings → Privacy & Security.

## Built with

- [Tauri v2](https://v2.tauri.app/) (Rust backend, WKWebView frontend)
- [Milkdown Crepe](https://milkdown.dev/) (ProseMirror-based WYSIWYG engine)
- [Newsreader](https://fonts.google.com/specimen/Newsreader),
  [Instrument Sans](https://fonts.google.com/specimen/Instrument+Sans),
  [JetBrains Mono](https://www.jetbrains.com/lp/mono/)

## Development

```bash
npm install
npm run tauri dev     # run in dev mode with hot reload
npm test              # unit tests (Vitest)
npm run tauri build   # release build → src-tauri/target/release/bundle/
```

The `evaluation/` directory contains a standard suite of Markdown documents
for checking rendering behavior (syntax coverage, unicode, edge cases,
stress test) — see `evaluation/README.md`.

## License

MIT
