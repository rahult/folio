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

## Privacy / telemetry

Folio collects **no data by default**. Optional, anonymous usage statistics
(Google Analytics 4) exist to guide development — feature usage events only,
never document content or file paths, IP anonymized. The app asks once on
first launch and the site shows a consent banner; nothing loads before you
opt in, and you can change your mind any time in **View → Usage
Statistics**. (Developers: set `GA_MEASUREMENT_ID` in `src/telemetry.ts`
and `SITE_GA_ID` in `site/demo.ts` to your own GA4 property.)

## Reviewing agent output (Float on Top)

Folio doubles as a live review pane for coding agents (Kimi, Claude Code,
Codex, …) — no plugins or API keys needed, the file is the seam:

```bash
folio --float plan.md        # or -f; opens plan.md in a floating window
folio review plan.md         # same thing, reads better in scripts
agent … | folio --float -    # pipe markdown straight into a review window
```

The window pins above everything else at a compact review size, and while
it floats Folio watches the open file: every time the agent rewrites it,
the rendered document reloads in place with **the changes highlighted** —
additions washed in green, removals shown as struck-through ghosts — and
the **live** badge in the status bar pulses. Your own unsaved edits are
never clobbered — watching pauses while the document is dirty and resumes
when you save. Done reviewing? The copy button in the toolbar puts the
document back on the clipboard as clean Markdown, ready to paste into the
agent with your feedback.

A typical agent loop looks like:

```bash
kimi -p "write the migration plan to docs/plan.md" &
folio review docs/plan.md    # watch it render as the agent works
```

Any window can float: **View → Float on Top** (⌥⌘W) or the pin button at
the top right of the window — click it again to return to a normal window.
The same live reload works without floating too: **File → Auto-Reload
External Changes** (on by default) reloads whenever the open file changes
on disk — agent edits, git checkouts, another editor.

### Annotate the plan, send it back

Reviewing isn't just watching. When an agent is waiting on the open file
(or any time via **View → Review Mode**, ⌘⇧R) the page turns read-only and
the keyboard becomes a review tool:

| Key | Action |
| --- | --- |
| `j` / `k` (or ↓ / ↑) | Move the rule to the next / previous block; click or shift-select to target a passage inside it |
| `c` | Comment — type under the block, Enter saves, Esc cancels |
| `r` | Suggest a replacement, same field |
| `d` | Mark for deletion |
| `a` | Looks good — tells the agent to leave this alone |
| `x` | Remove the mark on the block |
| `n` / `p` | Jump to the next / previous annotation |
| Enter | Send the verdict: changes requested if anything asks for one, else approved |
| `e` | Back to editing (`?` toggles the legend) |

Outside review mode, **Edit → Annotate Selection…** (⌥⌘A) or the
annotate icon in the selection bubble open the same inline field. Marks are
quiet underlines that persist across agent rewrites. **File → Export
Review Feedback** (⌥⌘R) serializes them into structured Markdown the agent
can act on — numbered change requests with the passage's line numbers, then
a *Keep as is* list — copied to the clipboard *and* written to
`<plan>.feedback.md` beside the file, so file-driven agents pick it up
with no copy-pasting.

### Read with a map: the reading panel

**View → Reading Panel** (⌘⇧O, or `o` in Review Mode) opens a panel with
two tabs. **Outline** lists the document's headings with each section's
reading time, marks the section you are in as you read, and jumps on
click or with the arrow keys — in the rendered page and in Source Code
Mode alike. Above it, a **What I took from it** field is for your own
one-paragraph summary; it saves beside the document as
`<doc>.decision.md`, plain Markdown any agent can read. The status bar
shows the whole document's reading time next to the word count.
**Annotations** is the second tab.

### Ask your agent to open a review: the `/folio` skill

`skills/folio/` is an [Agent Skill](https://agentskills.io) that teaches a
coding agent the blocking review loop above — open the document in Folio,
wait for the verdict, apply the feedback, resubmit until approved. It is
**user-invoked only**: the agent never opens Folio on its own, you type
`/folio` (optionally with a path) when you want to read something properly.

```bash
# Claude Code — user-wide, or drop it in a repo's .claude/skills/
mkdir -p ~/.claude/skills && cp -r skills/folio ~/.claude/skills/

# Codex, Copilot CLI, Gemini CLI, and others that read ~/.agents/skills/
mkdir -p ~/.agents/skills && cp -r skills/folio ~/.agents/skills/
```

The skill expects `folio` on PATH (or falls back to the app bundle):

```bash
mkdir -p ~/.local/bin && printf '#!/bin/sh\nexec /Applications/Folio.app/Contents/MacOS/folio "$@"\n' > ~/.local/bin/folio && chmod +x ~/.local/bin/folio
```

**View → Authorship** (⇧⌘A) tints who wrote which words: text an agent
wrote on disk in a quiet blue, text it rewrote after you requested changes
in green, and your own words untinted. Nothing to paste or mark: Folio
knows from the revisions it archives while watching the file.

**File → Revision History** archives every on-disk version of the reviewed
file (newest 20) and diffs any of them against the current document — see
exactly what changed between v1 and v4 without leaving the editor. The
reading panel's **History** tab lists the same versions with who wrote
each one, and for a revision the agent made after your feedback, which of
your requested passages actually changed.

Also on board: **File → Open Recent**, session restore (relaunch lands on
your last file, caret, and scroll position), resizable table columns,
Mermaid diagrams rendered inline (fenced `mermaid` blocks show as diagrams
— Edit toggles the source), and link navigation — ⌘-click a Markdown link
to open it inside Folio and walk back with **File → Back / Forward**
(⌘[ / ⌘] or the toolbar chevrons); web URLs and other file types open in
their default applications.

## More features

- **Export** — File → Export (⌘E) writes a self-contained HTML file:
  the document rendered from its Markdown (never from the editor, so the
  result does not depend on what was on screen), syntax-highlighted code,
  Mermaid diagrams as SVG, local images and the app's typefaces embedded.
  Export → PDF… prints the same rendering through the native macOS print
  panel (Save as PDF). Export → Word… writes a .docx with real heading
  styles, lists, tables, quotes, code, links, and embedded images
- **Focus Mode** — View → Focus Mode (⌥⌘F) dims every block except the
  one holding the caret
- **Typewriter Mode** — View → Typewriter Mode (⌥⌘Y) keeps the caret on
  a fixed line ~40% from the top while you type; composes with Focus Mode
- **Themes** — View → Themes: Paper (default), Manuscript (deeper cream,
  brown ink, for long reading), Newsprint (high-contrast near-white),
  Night (warm dark), Slate (cool blue-grey dark). Instant switching,
  persisted across launches, respected by Source Mode
- **Wikilinks** — `[[name]]` links to the project file with that name
  (`[[name#Heading]]` to a heading, `[[name|label]]` for the text). Type
  `[[` for a completion list; ⌘-click follows, as with ordinary links,
  which now honour `file.md#heading` targets too
- **Quick Open** — ⌘P fuzzy-finds any Markdown file in the current
  project (the nearest git root, or the document's folder), recents first.
  No sidebar: type, arrow, Enter
- **Tabs** — several documents in one window. Open, Open Recent, Finder,
  and links land in tabs; a tab keeps its unsaved edits, caret, and scroll
  while you work elsewhere. ⌘W closes the tab (the window with one left),
  ⌘⇧] / ⌘⇧[ or ⌃Tab switch, and the tab set comes back on relaunch
- **Quiet chrome** — the title strip and status bar fade while you type
  and return when the mouse moves; the window has no separate title bar

## Download

Get the latest build for your platform from
[Releases](https://github.com/rahult/folio/releases/latest) — or try the
[live demo](https://folio.rahultrikha.com/#demo) in your browser first:

- **macOS** — `Folio_aarch64.dmg` (Apple Silicon)
- **Windows** — `.msi` / `.exe` (NSIS)
- **Linux** — `.AppImage` / `.deb`

> Installers are unsigned: on first launch, Windows shows SmartScreen
> (More info → Run anyway). On macOS, a browser-downloaded app may be
> refused as "damaged" — clear the quarantine flag once:
> `xattr -dr com.apple.quarantine /Applications/Folio.app`

## Website

The product site — landing page plus a live in-browser demo of the real
editor (Write / Preview tabs) — lives at
<https://folio.rahultrikha.com/>. Its source is in `site/`:

```bash
npm run dev:site      # local dev server
npm run build:site    # static build → dist-site/
```

Pushes to `main` that touch `site/` or `src/` rebuild and deploy it to
GitHub Pages via `.github/workflows/site.yml` (the workflow auto-enables
Pages on first run; the `CNAME` file in `site/public/` pins the custom
domain across deploys). At the DNS provider, `folio` is a CNAME record
pointing to `rahult.github.io`.

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

## Release & publishing

Pushes to `main` and pull requests run `.github/workflows/ci.yml`: unit
tests, frontend typecheck/build, Rust tests, and a product-site build. The
site redeploys automatically on relevant `main` pushes
(`.github/workflows/site.yml`).

Releasing a new version is a single manual trigger — everything else is
automated. Run the **Release** workflow with a version:

```bash
gh workflow run release.yml -f version=0.2.0
```

`.github/workflows/release.yml` then: bumps `package.json`,
`src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`, commits and pushes
tag `v0.2.0`, runs the test suites, and builds installers on three
platforms via `tauri-action`, attached to a **published** (non-draft)
GitHub Release:

- macOS arm64 `.dmg`
- Windows `.msi` / `.exe`
- Linux `.AppImage` / `.deb`

Pushing a `v*` tag by hand also works — the same pipeline runs, skipping
the version-bump step.

Installers: the macOS build is signed with a Developer ID certificate and
notarized when the `APPLE_*` secrets are configured in CI (certificate,
signing identity, Apple ID + app-specific password, team ID). Windows
builds remain unsigned — SmartScreen shows More info → Run anyway on
first launch. Windows code signing requires a paid certificate and is
intentionally out of scope.

An **update-signing keypair** for a future Tauri updater lives outside the
repo at `~/.tauri/folio-updater.key` (public key in
`~/.tauri/folio-updater.key.pub`). To enable signed updates later, add the
public key to `tauri.conf.json`'s updater config and set
`TAURI_SIGNING_PRIVATE_KEY{_PATH,_PASSWORD}` in CI secrets.

## License

MIT
