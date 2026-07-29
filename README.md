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

Reviewing isn't just watching. Select text (or place the caret in a block)
and **Edit → Annotate Selection…** (⌥⌘A) lets you comment on it, mark it
for deletion, or suggest a replacement — quiet marks in the document that
persist across agent rewrites. **File → Export Review Feedback** (⌥⌘R)
serializes your annotations into structured Markdown the agent can act on —
copied to the clipboard *and* written to `<plan>.feedback.md` beside the
file, so file-driven agents pick it up with no copy-pasting.

**File → Revision History** archives every on-disk version of the reviewed
file (newest 20) and diffs any of them against the current document — see
exactly what changed between v1 and v4 without leaving the editor.

### One-step agent setup

`scripts/install-agent-integrations.sh` wires Claude Code, Codex CLI, and
Kimi Code to use Folio automatically:

```bash
sh scripts/install-agent-integrations.sh
```

It is idempotent and does three things: puts a `folio` CLI shim on PATH
(`~/.local/bin/folio`), appends a plan-review instruction block to each
agent's global instruction file (`~/.claude/CLAUDE.md`,
`~/.codex/AGENTS.md`, `~/.agents/AGENTS.md`), and installs a Claude Code
PostToolUse hook that opens every `.md` write in a floating Folio review
window. From then on, any plan an agent writes lands in Folio, and your
annotations come back to the agent via `<plan>.feedback.md`.

Also on board: **File → Open Recent**, session restore (relaunch lands on
your last file, caret, and scroll position), resizable table columns,
Mermaid diagrams rendered inline (fenced `mermaid` blocks show as diagrams
— Edit toggles the source), and link navigation — ⌘-click a Markdown link
to open it inside Folio and walk back with **File → Back / Forward**
(⌘[ / ⌘] or the toolbar chevrons); web URLs and other file types open in
their default applications.

## Folio Pro

Pro features are unlocked with a license key (Folio → Enter License…):

- **Export** — File → Export (⌘E) writes a standalone HTML file of the
  rendered document with the app's styles inlined (fonts fall back to
  system fonts outside the app — webfont binaries don't travel with the
  export). Export → PDF… opens the native macOS print panel (Save as PDF)
  with the app chrome hidden via print CSS
- **Focus Mode** — View → Focus Mode (⌥⌘F) dims every block except the
  one holding the caret
- **Typewriter Mode** — View → Typewriter Mode (⌥⌘Y) keeps the caret on
  a fixed line ~40% from the top while you type; composes with Focus Mode
- **Themes** — View → Themes: Paper (default, always free), Night (warm
  dark), Newsprint (high-contrast near-white). Instant switching,
  persisted across launches, respected by Source Mode and printing

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

## Pro licensing

Folio Pro features (export, focus mode, …) are gated by an offline Ed25519
license. A license is a string of the form
`FOLIO1-<base64url-no-pad(payload)>-<base64url-no-pad(signature)>`, where the
payload is the canonical compact JSON `{"email":"...","issued":"YYYY-MM-DD"}`
and the signature is Ed25519 over the exact payload bytes. Verification
happens entirely in Rust (`src-tauri/src/license.rs`) against a public key
embedded in the app — no network, no backend.

Licenses are minted with the bundled CLI:

```bash
cd src-tauri
cargo run --bin folio-license --features license-cli -- keygen                                  # fresh keypair
cargo run --bin folio-license --features license-cli -- create --email you@example.com          # signs with the DEV key
cargo run --bin folio-license --features license-cli -- verify --license 'FOLIO1-…'             # check a license
```

(The `license-cli` feature gate keeps this dev/vendor tool out of the
shipped app bundle.)

> **The keypair committed in `src-tauri/src/license.rs` is a DEV-ONLY
> keypair.** Its private half is public knowledge, so anyone can forge
> licenses with it — that is intentional for development and tests. The
> production signing key must be generated by the vendor
> (`folio-license keygen`), kept offline, and **never committed**; only its
> public half replaces `PUBLIC_KEY_HEX` before a real release.

In the app, Folio → Enter License… opens the unlock dialog; a valid key is
verified and persisted to `license.json` in the app config dir (re-verified
on every read — the file is never trusted blindly). On the frontend, gating
a feature is a one-liner: `if (!requirePro("export")) return;` — see
`src/main.ts` and the pure gate logic in `src/license.ts`.
## Folio Pro

Folio is freemium. The free tier includes the full editor, all menus,
Source Code Mode, file handling, and zoom. A license key unlocks:

- **Export** (⌘E) — standalone HTML; PDF via the macOS print panel
  (Save as PDF). Exported HTML inlines the app styles; fonts fall back to
  system stacks outside the app.
- **Focus Mode** (⌥⌘F) — dims everything but the current block
- **Typewriter Mode** (⌥⌘Y) — keeps the caret centered while you write
- **Themes** — Night (warm dark) and Newsprint, in addition to Paper

Unlock via **Folio → Enter License…**.

### Issuing licenses (vendor only)

Licenses are offline Ed25519-signed strings — no server involved.

```bash
# one time: generate YOUR production keypair — never commit the private key
cargo run --bin folio-license --features license-cli -- keygen

# issue a customer license (defaults to the committed DEV key — dev only!)
cargo run --bin folio-license --features license-cli -- \
  create --email customer@example.com --key <your-private-key-hex>
```

The repo ships a clearly-marked **DEV-only keypair** in
`src-tauri/src/license.rs` so tests and development work out of the box.
For production, replace `PUBLIC_KEY_HEX` with your public key and keep the
private key offline. The app persists the accepted license (re-verified on
every launch) in its config directory.

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
