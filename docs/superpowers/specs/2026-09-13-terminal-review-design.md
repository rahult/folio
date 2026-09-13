# Review in the terminal: the CLI crate and terminal Review Mode

_Design settled 2026-09-13 in a grilling session. Vocabulary in
`CONTEXT.md`; decisions in `docs/adr/0001` and `0002`. Ships in three
stages: the workspace split, then `/folio lens`
(`2026-09-13-agent-lens-design.md`), then the terminal Review Mode._

## Goal

A person working in a terminal multiplexer such as herdr or tmux, or over
SSH on a machine with no display, can review an Agent's Document with the
same keys, the same Annotations, and the same Feedback file as the app,
without a window opening. The skill is unchanged; the person decides once
whether reviews open a window or a pane.

## Stage 1: the workspace split

`src-tauri` becomes a Cargo workspace:

- `folio-core` — library. The review gate (handshake, `.changes` marker,
  wait, exit codes), Feedback writing (Annotations, Verdict, Keep-as-is,
  line numbers, and the stdout text the gate prints), the Analysis append,
  Revision archiving, lens loading (built-in files and the custom folder),
  and the embedded skill. No Tauri dependency.
- `folio` — the CLI binary. `folio [--float] <paths…>` and `folio review
  <path>` without `--tui` launch the app binary with the same arguments:
  the bundled sibling first, then the platform's install location, then
  `FOLIO_APP` if set. Everything else runs in the CLI itself.
- `folio-app` — the Tauri app, depending on `folio-core`. The app's
  commands for feedback, archive, and analysis become thin calls into the
  core; the TypeScript writers (`writeFeedback`, `appendLensResult`) go
  away and their tests move to Rust. The app still accepts paths directly
  for double-click and `open`.

The app bundles the CLI and gains **Folio → Install Command Line Tool**,
which links it into `/usr/local/bin` or `~/.local/bin`, or prints the PATH
line when it cannot. Releases also attach `folio-<target>.tar.gz` for
macOS (arm64, x86_64), Linux (x86_64, aarch64), and Windows, plus an
install script in the README; `cargo install` works from the repo.

Stage 1 is behaviour-preserving: a release after it does exactly what
0.13 does, with `folio` now the CLI.

## Stage 3: terminal Review Mode

### Choosing the terminal

`folio review` opens the window when a display exists. It goes to the
terminal when there is no display, or when `--tui` is passed, or when
`FOLIO_REVIEW=tui` is set in the shell. The skill passes nothing; herdr
and tmux users set the variable once.

### Where it draws

The Agent's subprocess has no TTY, so `--wait --tui` never draws itself.
It writes the gate request, then:

- inside herdr (`HERDR_ENV=1`): `herdr pane split --current --direction
  right --cwd "$PWD"`, then `herdr pane run <id> "folio review --tui
  <path>"`, focused;
- inside tmux (`$TMUX`): `tmux split-window -h "folio review --tui
  <path>"`;
- otherwise: prints `run: folio review --tui <path>` and waits.

Then it waits on the gate exactly as today (nine minutes, exit 3, collect
next turn). `folio review --tui <path>` run by hand from any terminal,
local or over SSH, attaches to the pending request for that path, or
starts a review with no waiting Agent, writing Feedback all the same.

### What it shows

Styled Markdown, one top-level block at a time as the current block:
headings bold, emphasis and inline code styled, code blocks boxed, lists
indented, tables monospace, images as their alt text. The blocks are the
same top-level blocks the app uses, so an Annotation quotes the same
passage either way. A status line shows the file name, block `n/N`, the
Annotation count, and the key hint.

### Keys

Exactly Review Mode's: `j`/`k` or arrows move; `c` comment, `r` replace,
`d` delete, `a` looks good, `x` remove the block's Annotation; `n`/`p`
jump between annotated blocks; `Enter` opens the comment entry; `?` help;
`A` approve, `R` request changes (the app's buttons). `e` runs
`$EDITOR +<line> <path>` and reloads on return; the Feedback then records
that the person edited directly, as the app does. Entry is a one-line
field under the current block; `Esc` cancels.

### On verdict

Feedback is written by the core, the gate request resolved, a Revision
archived with origin `folio`, and the TUI exits. Whether the empty pane
closes is the multiplexer's setting. No live reload: each round of the
loop spawns a fresh review.

## Installs

No new installer target. `npx skills add rahult/folio -a pi` installs for
Pi (invoked there as `/skill:folio`; Pi honours
`disable-model-invocation`), and `-a '*'` covers every agent skills.sh
knows. README and site gain the Pi line and the `FOLIO_REVIEW=tui` note.

## Out of scope

- Lenses, Decide, outline, or editing in the terminal.
- Live reload of a rewritten Document inside the TUI.
- A herdr-specific integration beyond spawning the pane.

## Tests

- Core: Feedback text is byte-identical to fixtures the app produced
  before the move; archive, gate, and analysis tests move unchanged.
- CLI: display detection and the env/flag override; app-binary lookup
  order; herdr/tmux command construction from environment; attach to a
  pending request and standalone start.
- TUI: block segmentation matches the app's for the evaluation
  documents; key handling drives the same state machine as
  `src/reviewmode.ts` (shared fixture table); a verdict produces the
  expected Feedback and exit code.
