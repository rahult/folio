---
status: accepted
---

# The `folio` command is a separate binary that fronts the app

`folio` on PATH is a small static CLI crate, not the Tauri app. It holds
everything that must run where a window cannot: the review gate, the
terminal Review Mode, `folio lens`, `folio skill`. Opening a window is the
one thing it delegates, by launching the app binary with the same
arguments. Both binaries share a core crate that owns the file formats
(Feedback, Analysis, Revisions, lenses), per ADR 0001.

The reason is the headless case: the Tauri binary needs the platform
webview libraries just to start, so on a Linux server over SSH it cannot
run even for `--wait`, and an agent's subprocess has no TTY to draw a TUI
in anyway. A binary with no webview dependency runs anywhere.

## Where the command looks for the app

In order: `FOLIO_APP`, then the app binary sitting beside the command (the
sidecar case, which covers both the installed bundle and `tauri dev`), then
the platform's usual install locations. The override comes first so it is
never shadowed by a sibling — otherwise pointing `FOLIO_APP` at a second
build would do nothing whenever the command was run from inside a bundle,
which is the case the variable exists for. The spec's wording puts the
sibling first; this order is the deliberate difference. If no candidate
exists the command says so and exits 4 rather than opening a window or,
in the gate's case, waiting for one.

## Considered options

- One binary with a TUI feature flag. Rejected: still fails to start on a
  machine without the webview, which is exactly where a terminal review
  is wanted.
- Keep the app as `folio` and add `folio-cli`. Rejected: two names for
  people and skills to remember, and the skill would have to pick one.
