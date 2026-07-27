# Design: Open markdown files from the OS + "Set as Default Markdown App"

Date: 2026-07-27
Status: implemented

## Problem

1. Folio declared no file associations and handled no OS open-file events, so
   double-clicking a `.md` file in Finder launched Folio with an empty
   document.
2. There was no way to make Folio the default handler for markdown files.

## Approach

Use Tauri 2's built-in file-association config and `RunEvent::Opened`, with a
pending-paths queue in Rust that the frontend drains on startup (cold start:
the `Opened` event fires before the webview is ready) and a `"file-open"`
event listener for files opened while the app is already running.

"Set as default" is a macOS-only File-menu item calling LaunchServices
(`LSSetDefaultRoleHandlerForContentType`) via FFI. Windows/Linux users set
defaults through the OS; the declared association makes Folio appear in
"Open with" there.

## Components

### `src-tauri/tauri.conf.json`

`bundle.fileAssociations` for `md`, `markdown`, `mdown`, `mkd`
(`contentTypes: ["net.daringfireball.markdown"]`, role `Editor`). Writes
`CFBundleDocumentTypes` (macOS), registry entries (Windows), and the
.desktop MIME list (Linux).

### `src-tauri/src/lib.rs`

- `PendingOpens(Mutex<Vec<String>>)` managed state, registered **on the
  builder before `build()`** — on a macOS cold start `RunEvent::Opened` can
  fire before `setup` runs, and a state registered only in `setup` is too
  late and silently drops the path (verified by instrumentation).
  `markdown_args()` filters CLI argv for existing markdown files
  (Windows/Linux open path; drops macOS `-psn_…`). Seeded at builder level.
- Command `take_pending_open_paths()` drains the queue; called once by the
  frontend on startup.
- Command `register_default_markdown_handler(app)` — macOS: FFI call with
  UTI `net.daringfireball.markdown` and the app's bundle identifier from
  config; other platforms: returns an explanatory error.
  `core-foundation = "0.10"` is a macOS-only dependency.
- `App::run` callback handles `RunEvent::Opened { urls }` (macOS): pushes
  each file path into the queue and emits `"file-open"`.
- macOS-only File-menu item `file.make-default` → "Set as Default Markdown
  App…".

### Frontend (`src/menu.ts`, `src/main.ts`)

- `menu.ts` maps `file.make-default` → `{ kind: "make-default-app" }`.
- `loadFromPath(path)` shared by dialog-open and OS-open.
- `guardDirty(next)` confirms before discarding unsaved changes.
- Startup: after `editor.create`, drain pending paths and load the first (no
  confirm — a fresh document is never dirty).
- `listen("file-open")` → `guardDirty(() => loadFromPath(path))`.
- `make-default-app` action invokes the Rust command and reports via a
  native message dialog.

## Error handling

- Unreadable file from an OS open: `read_text_file` errors propagate to the
  webview console; document state is untouched (load is all-or-nothing).
- LaunchServices failure: non-zero status surfaced as the dialog message.
- Multiple files opened at once: all are queued; the first wins on cold
  start. Warm opens load one at a time (single-document app).

## Testing

- Rust: `markdown_args` keeps existing markdown files, drops non-markdown /
  missing / `-psn` args, matches extensions case-insensitively.
- Frontend: `menu.test.ts` covers `file.make-default`.
- Manual: `open -a Folio file.md`, Finder double-click, warm second open with
  dirty confirm, File → Set as Default Markdown App.

## Out of scope

- Windows/Linux in-app "make default" (handled by the OS).
- Tabs/multi-window for simultaneous files.
