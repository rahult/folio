# Design: Authorship — who wrote which words

Date: 2026-09-11
Status: designed

## Problem

A reviewed document is a mix: prose the agent wrote, sentences the reviewer
retyped, and passages the agent rewrote after a change request. Nothing in
Folio shows which is which, so the reviewer re-reads text they already
approved and cannot tell an agent's revision from their own edit. iA
Writer sells "Authorship" for this but makes the user paste AI text
through a menu. Folio already watches the file and archives every version,
so it can know automatically.

## Approach

Attribute every word of the current document to the revision that
introduced it, and tint by that revision's **origin**:

| Origin | How Folio knows | Tint |
| --- | --- | --- |
| `external` | The file changed on disk while watched (an agent rewrite) | quiet cool wash |
| `revision` | Same, but it is the first rewrite after the reviewer sent "changes requested" | quiet green wash |
| `folio` | Folio saved it (the reviewer typed it) | none |
| unknown | Older than the archive, or the version that was on disk when the file was first opened | none |

Unsaved typing is `folio` too, computed live against the newest archived
version. Nothing is stored beyond one new field on each archived revision.

View → Authorship (⇧⌘A) toggles the tints; off by default; remembered.
When on, the status bar shows a two-swatch legend.

## Components

### `src-tauri/src/lib.rs`

`RevisionContent` gains `origin: String` (serde default `"unknown"` so old
archives load). `archive_revision(path, markdown, rendered, origin)`.
`RevisionMeta` exposes `origin`. A new command `list_revision_contents(path)`
returns every archived revision's `rendered` and `origin` in seq order, for
the chain.

### `src/provenance.ts` (new, pure)

```ts
type Origin = "external" | "revision" | "folio" | "unknown";
interface Attributed { text: string; origin: Origin }
attribute(revisions: { rendered: string; origin: Origin }[], live: string): Attributed[]
```

Walk the revisions oldest to newest with `diffWords`; tokens that are
`same` keep their attribution, `add` tokens take the revision's origin,
`remove` tokens drop out. Then diff the newest rendered text against `live`
(the current rendered text) and attribute additions to `folio`. Runs of the
same origin are merged. Returns the live text's tokens in order.

### `src/provview.ts` (new, ProseMirror glue)

A decoration plugin like `diffview.ts`: given `Attributed[]` and
`docSegments`, emit inline decorations `prov-external`, `prov-revision` over
the ranges (`folio` and `unknown` get none). `setProvenance(view, spans)`
and `clearProvenance(view)`.

### `src/main.ts`

- `archiveCurrentRevision(origin)`: `"unknown"` on first load,
  `"folio"` on save, `"external"` on a watched reload, or `"revision"`
  when the reload is the first after a `changes` verdict (`awaitingRevision`
  set by `submitVerdict`, cleared by the reload).
- `authorshipOn` flag, View → Authorship toggle, persisted in
  `localStorage("folio-authorship")`, menu check synced.
- `refreshAuthorship()`: when on and a file is open, fetch
  `list_revision_contents`, compute `attribute(revisions, renderedText(view))`,
  render. Called after load, reload, save, and debounced 600 ms after
  typing. Off → `clearProvenance`.
- Status-bar legend `#authorship-legend` shown while on.

### `src/styles.css`

`.prov-external { background: color-mix(in oklch, var(--tint-agent) 22%, transparent) }`,
`.prov-revision` likewise with a green, both with a 2px radius; theme
tokens `--tint-agent` (cool) per theme so it reads in Night and Slate.

### Native menu

View → Authorship, check item, `CmdOrCtrl+Shift+A`, id `view.authorship`.

## Testing

- `tests/provenance.test.ts`: a single external revision attributes all
  words external; a folio save after it attributes only the new words;
  unchanged words keep their origin across three revisions; a `revision`
  origin only marks that rewrite's additions; live edits are folio; runs
  merge; an empty archive attributes everything unknown then live edits
  folio.
- Rust: `archive_in_dir` round-trips `origin`; an old file without it
  reads as `unknown`.
- Manual: open a plan, `folio review --wait`, let an agent (or `sed`)
  rewrite it, toggle Authorship: rewritten words tinted; type a sentence:
  untinted; send changes, rewrite again: green.

## Out of scope

Per-agent identity (which agent), and attribution older than the 20-deep
archive.
