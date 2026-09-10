# Design: Read stage — the reading panel, outline, and takeaway

Date: 2026-09-10
Status: designed

Part 1 of 3 of "Folio as a document reader and analyser": Read →
Interrogate → Decide. Each stage ships on its own; this spec covers Read.
The other two build on the panel and the companion-file conventions set
here.

## Problem

Folio renders a document beautifully and lets you mark it up, but it does
nothing to help you *read* it: no sense of its shape, how long it will
take, where you are in it, or what you took from it once you're done.
Reading a long agent-written plan is a scroll through prose with no map,
and whatever you concluded evaporates the moment the window closes.

## Approach

A **reading panel** on the right, in the slot the annotations sidebar
already occupies, with tabs. The Read stage adds the first tab, Outline;
the existing annotations list becomes the second. Later stages add
Analysis and Decision tabs to the same panel.

Everything the Read stage adds is local and deterministic:

- **Outline.** The document's headings as a nested list, each with its
  section's reading time. The section containing the caret is marked, so
  the outline is also a progress indicator. Click a heading to go there.
- **Reading stats** in the status bar next to the word count: total
  reading time.
- **Takeaway.** A "What I took from it" field at the top of the Outline
  tab. Whatever you write is saved beside the document in
  `<doc>.decision.md`, the companion file the Decide stage will later
  extend with options, choice, and outcome. Writing it in your own words
  is the reading exercise; the file is the receipt.

Three properties:

- **The file is still the seam.** The takeaway is plain Markdown an agent
  can read (`/folio` will later be taught to look for it).
- **Nothing new to learn.** The panel opens from the toolbar button that
  already opens annotations, from View → Reading Panel (⌘⇧O), or with `o`
  in Review Mode. Outline navigation is click or arrow keys inside the
  panel.
- **Works in every mode.** Edit, Review, and Source mode all keep the
  panel; in Source mode the outline still comes from the Markdown, and
  clicking a heading moves the textarea caret.

## Components

### `src/outline.ts` (new, pure)

```ts
interface OutlineEntry {
  /** 1–6 */
  level: number;
  /** Heading text with inline syntax stripped. */
  text: string;
  /** 0-based index among all headings, in document order. */
  index: number;
  /** Character offset of the heading line in the Markdown. */
  offset: number;
  /** Words from this heading to the next heading of any level. */
  words: number;
}

buildOutline(markdown: string): OutlineEntry[]
readingMinutes(words: number, wpm = 230): number   // ceil, min 1 when words > 0
sectionAtOffset(outline: OutlineEntry[], offset: number): number  // index of the entry whose section holds `offset`, or -1 before the first heading
```

`buildOutline` parses with remark (already a dependency, same as
`caretmap.ts`) so setext and ATX headings, nested emphasis, and code
spans in headings all come out right. Words are counted the way the
status bar counts them (`countWords`, moved to `src/markdown.ts`), on the
text between headings with block syntax ignored by the parser's
`toString`.

### `src/decisionfile.ts` (new, pure)

The companion file `<doc>.decision.md` and its sections. The Read stage
owns one section; later stages add theirs to the same file without
disturbing it.

```
# Decision: plan.md

Document: /abs/path/plan.md

## What I took from it

<takeaway text>
```

```ts
decisionFilePath(docPath: string): string           // `${docPath}.decision.md`
readTakeaway(fileText: string): string              // "" when absent
writeTakeaway(fileText: string | null, docName: string, docPath: string, takeaway: string): string
```

`writeTakeaway` creates the file skeleton when there is none, replaces the
"What I took from it" section when there is, and leaves every other
section untouched (the Decide stage's sections will live here too). An
empty takeaway removes the section body but keeps the file once it exists.

### `src/panel.ts` (new, DOM)

The reading panel: tabs, open/close state, and which tab is active.
Persists the last tab in `localStorage` (`folio-panel-tab`). Exposes
`openPanel(tab?)`, `closePanel()`, `togglePanel()`, `setTab(tab)`,
`isOpen()`. The annotations list moves into this panel unchanged; the
existing `sidebarOpen` logic in `main.ts` maps onto `openPanel("annotations")`.

The Outline tab renders:

1. The takeaway field: a textarea with the placeholder "What I took from
   it, in my own words". Saved 800 ms after the last keystroke and on
   blur, through `writeTakeaway` and the existing `write_text_file`
   command. Loaded with the document (`read_text_file` on the decision
   path; a missing file is an empty takeaway).
2. A one-line stat: `1,240 words · 6 min`.
3. The outline list, indented by level, each row `text` and a right-aligned
   `3 min`. The current section's row carries `aria-current="true"` and
   the accent rule.

### `src/main.ts`

- On document load and on every `markdownUpdated`, rebuild the outline
  from `currentMarkdown()` (debounced 300 ms while typing) and re-render
  the tab.
- On `selectionUpdated` (rendered view) or `selectionchange` in the
  textarea (source view), compute the caret's Markdown offset — the
  existing `caretmap` anchor machinery already maps a ProseMirror
  selection to an offset — and mark `sectionAtOffset`.
- Clicking an outline row: rendered view → find the nth heading node in
  the ProseMirror document, place the caret at its start, scroll into
  view, and in Review Mode make it the current block
  (`setCurrentByPos`); source view → `placeSourceCaret(entry.offset)`.
- Arrow keys while the outline list has focus move the highlighted row;
  Enter navigates; Escape returns focus to the document.
- Status bar: `wordCountEl` shows `1,240 words · 6 min` (reading time
  omitted under 1 minute).
- `o` in Review Mode toggles the panel on the Outline tab
  (`reviewmode.ts` gains `{ kind: "outline" }`).

### Native menu (`src-tauri/src/lib.rs`, `src/menu.ts`)

View → Reading Panel, check item, `CmdOrCtrl+Shift+O`, id `view.panel`;
synced like Focus Mode. The toolbar's annotations button keeps its icon
and title but opens the panel on the Annotations tab.

### `index.html`, `src/styles.css`

`#annot-sidebar` becomes `#panel` with a tab strip (`role="tablist"`,
two buttons), a takeaway block, a stats line, and the outline list; the
annotation list markup moves inside as the second tab's panel. Styles
follow the existing sidebar: 248px, hairline left border, quiet
uppercase tab labels, the accent rule for the current section.

## Error handling

- A decision file that fails to read (permissions, not text) is treated
  as empty; a failed save shows the takeaway field with a red hairline
  and a title "could not save" until the next successful save.
- Untitled documents: the takeaway field is disabled with the placeholder
  "Save the document to keep a takeaway"; the outline and stats still
  work.
- Documents with no headings: the outline shows "No headings" and the
  stats line alone.

## Testing

- `tests/outline.test.ts`: ATX and setext headings, nesting, inline
  syntax stripped, words per section including the preamble before the
  first heading (which belongs to no entry), reading minutes rounding,
  `sectionAtOffset` at boundaries.
- `tests/decisionfile.test.ts`: create from nothing, replace an existing
  takeaway, preserve unrelated sections, empty takeaway, path helper.
- `tests/markdown.test.ts`: `countWords` after the move.
- Manual: the evaluation stress document (`11-stress.md`) for outline
  performance and scroll sync; a document with no headings; source-mode
  click navigation; the takeaway round trip through a relaunch.

## Out of scope (later stages)

- Anything produced by a model or agent (Interrogate).
- Options, choice, confidence, revisit, journal (Decide).
- Highlights beyond the existing annotations.
