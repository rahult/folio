# Settings

_Design settled 2026-09-14 in a brainstorming session. Vocabulary in
`CONTEXT.md` (Settings, Home folder, Override). Builds on the workspace
split (`2026-09-13-terminal-review-design.md`, stage 1) and amends the
agent-lens design's shadowing rule._

## Goal

One place to change Folio's defaults, install the `/folio` skill and the
command line tool, and point Folio at the folder where it keeps its own
files. Everything the command line also needs (the Home folder, the
review defaults, the lens rules) is read from the same store, so the app
and `folio` never disagree.

## Storage

### `settings.json`

`folio-core` gains a `settings` module owning one file,
`<config dir>/settings.json`, where `<config dir>` is the platform config
directory joined with `com.rahult.folio` — the folder Tauri already uses
for `history/` and `folio.db`. The core resolves it with the `dirs` crate
so the command line finds the same file without Tauri.

```
Settings {
  home_dir: Option<PathBuf>        // None → ~/Documents/Folio
  theme: String                    // "paper" | "manuscript" | "newsprint" | "night" | "slate"; default "paper"
  live_reload: bool                // default true  (today: localStorage "folio-watch")
  telemetry: Option<bool>          // None = not asked; default None (today: "folio-telemetry")
  check_updates: bool              // default true
  review: { float: bool (true), agent: String ("agent"), timeout_secs: u64 (540) }
  lens:   { base_url: String (""), model: String ("") }   // key stays in the keychain
}
```

Every field has a serde default, so a file from any earlier version
loads. Writes are atomic: write `settings.json.tmp`, rename. `load()`
returns defaults when the file is missing or unreadable and never fails
the caller; `save()` returns an error string. Unknown fields are dropped
on the next save (the struct is the schema).

What is deliberately not here: zoom, focus mode, typewriter mode, panel
state, recent files, session — modes and history, per window, stay where
they are.

### The app's view

Two commands: `get_settings() -> Settings` and `set_settings(Settings) ->
Result<Settings, String>` (returns what was written). The frontend keeps
one in-memory copy, applies a change immediately (theme class, watcher
on/off, telemetry init, menu checkmarks via the existing sync), then
saves. The existing View → theme items, File → External Changes, and
View → Telemetry keep working and write through the same copy.

Migration: on startup, if `settings.json` does not exist and any of the
localStorage keys `folio-theme`, `folio-watch`, `folio-telemetry`,
`folio-lens-settings` exist, their values are written into a fresh file
once. localStorage is left untouched (an older build may still run) but
is no longer read for these values.

### The command line's view

`folio review --wait` without `--agent` uses `settings.review.agent`;
without `--timeout` uses `settings.review.timeout_secs`. The lens folder
is `home_dir/lenses`. Flags always win over settings.

## The Home folder

`home_dir` (default `~/Documents/Folio`) holds every file the person may
edit by hand. All are optional:

| Path | Meaning | Today |
| --- | --- | --- |
| `decisions.md` | the Journal | exists |
| `lenses/<stem>.md` | custom lenses | exists |
| `lenses/<builtin-id>.md` | **Override** of a built-in lens (see below) | new |
| `lens-rules.md` | replaces the built-in lens response rules | new |
| `feedback-instructions.md` | appended to every Feedback as a trailing section | new |
| `skill/SKILL.md` | used by every skill install instead of the bundled text | new |

Resolution lives in the core (`prompts` module): `lens_rules(home) ->
String` (file, else built-in), `feedback_instructions(home) ->
Option<String>` (file trimmed, `None` when absent or blank), `skill_text_for(home)
-> String` (file, else bundled), `lens_override(home, id) -> Option<String>`.

**Changing the Home folder.** The person picks a folder with the native
dialog. If the new folder is not writable, the change is refused with the
error. Otherwise every known file or directory from the table that exists
in the old folder is moved (rename; copy-then-delete across volumes) —
unless any of those names already exists in the new folder, in which case
nothing is moved and the message names the conflict. The setting is saved
only after the move succeeds. The app then reloads the journal, lenses,
and prompt state.

**Override rule change.** The agent-lens design said a custom file named
like a built-in id is shadowed and not selectable by that name. It now
overrides the built-in everywhere: the Lenses tab and `folio lens list`
show one entry for that id, marked "edited", and `folio lens show` prints
the file. Reset deletes the file.

## The page

**Folio → Settings…** (⌘,) swaps the editor area for the settings view in
the current window, the way Source Mode swaps the page; Esc or the Done
button returns to the document with the caret where it was. Menu id
`app.settings`; action `{ kind: "settings" }`. The window title strip
shows "Settings". A narrow section list on the left, one section on the
right, every control saving on change; there is no Apply.

`src/settings.ts` holds the model and `renderSettings(model, handlers)`,
pure and DOM-only like `panel.ts`; `main.ts` owns the invokes and state.

### Sections

**General**
- Home folder: path, Choose…, Reveal in Finder. Under it, one line
  naming what lives there.
- Theme: five radios (the same five as View).
- Live reload of external changes: toggle.
- Telemetry: toggle with the one-line description from the consent
  dialog.
- Check for updates automatically: toggle, and a Check now button.

**Review**
- Float review windows on top: toggle (the default for `folio review`).
- Default agent name: text (used when `--agent` is omitted; shown in the
  review bar).
- Gate timeout: number of seconds, 60–540, with the note that coding
  agents cap a shell call at ten minutes.

**Lenses**
- Endpoint URL, Model: text fields (the same values the Lenses tab
  shows; both places edit the one setting).
- API key: "Set…" opens a field that writes to the keychain; "Clear".
  Never displayed.
- Custom lenses folder: path with Reveal.

**Prompts**
- Lens response rules: status (built-in | edited), Edit in Folio, Reset.
- Standing feedback instructions: status (none | set), Edit in Folio,
  Clear. One line explains it is appended to every Feedback.
- Built-in lenses: one row per built-in (name, description), status
  (built-in | edited), Edit in Folio, Reset.

"Edit in Folio" creates the file from the built-in text when it does not
exist, then opens it in a new tab of this window and leaves Settings.
Reset and Clear delete the file after a confirm dialog.

**Agents & command line**
- Skill targets, one row each: Claude Code (`~/.claude/skills/folio`),
  Codex, Copilot CLI, Gemini CLI and others (`~/.agents/skills/folio`).
  Status: not installed | current | outdated | custom (installed text
  differs from what an install would write now). Button: Install or
  Update. A note when `skill/SKILL.md` exists: "installs use your edited
  skill text".
- Pi: the command `npx skills add rahult/folio -a pi` with Copy, and
  "invoked there as /skill:folio".
- Command line tool: status "folio → <link> → <target>" when a link at
  `/usr/local/bin/folio` or `~/.local/bin/folio` points at this app's
  sidecar; "linked elsewhere: <target>" when it points somewhere else;
  "not installed" otherwise. Button: Install (the existing command,
  which reports replacements). Below: the `curl … install.sh | sh` line
  with Copy, for machines without the app.
- Default Markdown app: the existing Set as Default button.

**About**
- Version, Check for updates, links to the site, GitHub, and the roadmap.

## Feedback: the Instructions section

When `feedback-instructions.md` is present and non-blank, `feedback::build`
appends, after "Keep as is" and before the edit note:

```
## Instructions

<the file's text, trimmed>
```

`SKILL.md` gains one sentence: "A trailing **Instructions** section, when
present, applies to every change." `ledger.ts`'s parser ignores the
section. Absent the file, Feedback is byte-identical to today (the fixtures
stay untouched; a sixth fixture covers the section).

## Status checks

- `skill_status() -> Vec<{ target, path, state }>`: compares the file at
  each target path with `skill_text_for(home)`; `outdated` when it
  differs from the text that would be written now, `custom` when a
  `skill/SKILL.md` override exists and the installed text differs from it.
- `cli_status() -> { link: Option<path>, target: Option<path>, ours: bool }`
  from the two link locations, first match wins.
- Both are pure functions over a listing in the core, with the app
  supplying the real paths.

## Errors

Every command returns `Result<_, String>`. The page shows the message in
a line under the control that caused it, in the same style as the lens
status line; it clears on the next successful change. No modal dialogs
except the two confirms (Reset, Clear) and the native folder picker.

## Out of scope

- Editing the skill text inside the settings page (it is a file; Edit in
  Folio opens it).
- Per-document settings; a settings window; syncing settings between
  machines.
- Running a lens from the settings page ("test connection").
- A default documents folder for Open/Save.

## Tests

- Core: settings defaults, round-trip, atomic write, load of an older file
  with missing fields; prompt resolution for each of the four files (file
  vs built-in, blank instructions → None); `feedback::build` with
  instructions against a new fixture and the five existing fixtures
  unchanged; skill status for all four states; CLI status for the three
  states; home-folder move with a conflict refused.
- App/TS: migration from localStorage keys (once, then never); the
  settings model reducer and renderer (each section renders its controls
  from the model; a change calls the right handler); menu id
  `app.settings` → action; the Lenses tab and Settings show the same
  endpoint after either edits it.
- End to end: change the theme in Settings and the View menu checkmark
  follows; Install for Claude Code writes the file and the row reads
  current; Edit in Folio on a built-in lens opens a tab on
  `<home>/lenses/<id>.md` pre-filled with the built-in text and the Lenses
  tab marks it edited.
