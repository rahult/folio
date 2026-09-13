# Agent-produced Readings: `/folio lens`

_Design settled 2026-09-13 in a grilling session. Vocabulary is in
`CONTEXT.md`; the one architectural decision is `docs/adr/0001`._

## Goal

A person with no Model endpoint can still get a Reading of a Document
through a Lens, by asking their coding Agent. The Reading lands in the
same Analysis file, shows in the same Lenses tab, and can be turned into a
comment like any other. Nothing here runs unless the person types the
command.

## The person's experience

In the agent's terminal:

```
/folio lens council plan.md
/folio lens two-way-door
/folio lens premortem plan.md "We will migrate the billing tables first"
```

The agent replies with one line, for example: `Reading written to
plan.md.analysis.md — open the Lenses tab in Folio.` It does not summarize
the Reading or open Folio. If Folio is open on that Document with the
Lenses tab showing, the Reading appears within a couple of seconds, newest
on top, with no highlight.

An unknown lens name gets the list of available lenses and nothing else.
An ad-hoc question is not a Reading; the person just talks to the agent.

## The skill

One skill, `/folio`, in `skills/folio/SKILL.md`. The first word of
`$ARGUMENTS` decides the branch: `lens` produces a Reading; anything else
is the existing Review loop, unchanged. `argument-hint` becomes
`[lens <name>] [path] ["passage"]`.

Document selection for `lens`, in order: a path in the arguments; the
Markdown file the person most recently named in the conversation; a
Markdown file the agent wrote in the conversation; otherwise ask. Never
guess from the filesystem.

The lens branch:

1. `folio lens show <name>` — the system text. Non-zero exit means the
   name is unknown; print the list it gave and stop.
2. Read the Document from disk with the agent's own tools (unsaved edits
   in Folio are not included, and the skill says so). If a passage was
   quoted, it is the focus and the Document is context, exactly as the
   Model path treats a selection.
3. Write the Reading following the output rules in the system text.
4. `printf '%s' "$reading" | folio lens append --lens <name> --agent
   <harness> [--passage "<text>"] "<path>"`.
5. Print the one line and stop.

## The CLI

`folio lens …` lives in the `folio` CLI crate (ADR 0002; see
`2026-09-13-terminal-review-design.md`, stage 1) and never opens a window.
It ships after the workspace split.

- `folio lens list` — one line per lens: `id — name — description`.
  Built-ins first, then custom lenses from `~/Documents/Folio/lenses`
  (stem, name, description). A custom file whose stem matches a built-in
  id is listed as shadowed and not selectable by that name.
- `folio lens show <name>` — the lens prompt followed by the shared output
  rules, exactly the system text Folio sends a Model. Lookup: built-in id,
  then custom stem. Unknown: the list on stderr, exit 1.
- `folio lens append --lens <name> --agent <harness> [--passage <text>]
  <path>` — body on stdin. Appends a Reading with today's date, producer
  `<harness> (agent)`, scope the whole document or the passage. Prints the
  Analysis path. Exit 1 on empty body, missing `--agent`, or unknown lens;
  exit 4 when `<path>` is not an existing Markdown file (matches `review`).
- `folio lens` alone prints help.

## Where the Lens prompts live

The eight built-in lenses move out of `src/lenses.ts` into
`lenses/<id>.md` at the repo root, each in the custom-lens format
(frontmatter `name`, `description`; body is the prompt). The core crate embeds
them with `include_str!`; the app imports them at build time and parses them
with the existing custom-lens parser. The shared output rules move to a
single text embedded the same way, so the app and the CLI cannot drift.

## The Analysis file

Format unchanged: `## Lens: <name> — <YYYY-MM-DD> — <producer>`, a
`Scope:` line, then the body with headings demoted. Per ADR 0001 the
append moves to the core crate, exposed as a command (`append_reading`) the app invokes
after a Model run; `appendLensResult` in TypeScript goes away and its tests
move to Rust. `parseAnalysis` stays in TypeScript for rendering.

## The Lenses tab

- While the panel shows the Lenses tab, the Analysis companion is re-read
  on the same 1.5 s tick as the Document, and once when the tab opens.
  This does not depend on the External Changes toggle: a Reading arriving
  cannot clobber anything.
- A changed file re-renders the list, newest first. No highlight, scroll,
  or tab switch.
- When no endpoint is saved, one line under the settings reads: "No
  endpoint? In your coding agent type `/folio lens <name> <file>` and the
  Reading appears here." It disappears once an endpoint is saved.
- Agent-produced Readings render like any other; the producer text shows
  `claude (agent)` as written.

## Out of scope

- Running a Lens against the endpoint from the CLI (settings live in the
  app).
- Folio sharing its current selection with the agent.
- Ad-hoc questions as Readings, or saving them as custom lenses.
- Opening or raising Folio from the lens command.

## Tests

- Rust: lens lookup order and shadowing; `show` output equals prompt plus
  rules; `append` formatting for document and passage scope, creating the
  file head when absent; exit codes; CRLF-safe embedding.
- App: `parseAnalysis` round-trips a Rust-written file; the tab re-reads
  on the tick only while showing; the hint appears only without an
  endpoint.
- Skill text: the lens branch and the review branch both present; install
  message updated.
