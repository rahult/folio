# Design: Review Mode — annotate a document with single keys

Date: 2026-09-10
Status: designed

## Problem

Folio has the plumbing for the agent review loop (`folio review --wait`,
persisted annotations, structured feedback, the review bar) but annotating
is slow: select text, press ⌥⌘A, pick a kind in a modal, type, click Save.
Every key on the page is taken by editing, so nothing can be a single
keystroke. Reviewing a plan the agent just wrote should feel like a TUI
review tool: move, mark, type a line, send.

## Approach

A **read-only review mode**. While it is on, the page does not accept
edits, one block is "current", and single keys act on the current block or
on a mouse/keyboard text selection inside it. It turns on by itself when
the open file has a waiting review request (the `/folio` flow) and can be
toggled on any document from View → Review Mode (⌘⇧R). `e` drops back to
editing.

Three consequences:

- **No modal.** The key already chose the kind; a comment or replacement is
  typed into a small field that appears under the target passage.
- **Looks good is a mark.** `a` records a fourth annotation kind,
  `approve`, so the agent hears what to leave alone. The verdict ignores it.
- **Feedback carries line numbers.** Each entry is located in the on-disk
  text and headed with `L<start>–<end>` when it can be found.

## Components

### `src/annotations.ts`

- `AnnotationKind` gains `"approve"`; `loadAnnotations` accepts it.
- `buildFeedback(fileName, annotations, sourceText?)`:
  - Change requests (comment / delete / replace) come first, numbered, as
    today, with `L12–14` in the heading when `sourceText` is given and the
    quote is found in it.
  - A trailing `## Keep as is` section lists `approve` quotes, one bullet
    each, with the same line reference. Omitted when there are none.
  - Verdict is **approved** when there are no change requests, whatever the
    number of approve marks.
- `locateQuote(sourceText, quote): { startLine, endLine } | null` — word
  sequence match (the same tolerance as `findQuoteRange`) over the source
  text; 1-based, inclusive.

### `src/reviewmode.ts` (new, pure)

The key map and the review-mode state machine, unit-testable:

```ts
type ReviewAction =
  | { kind: "move"; delta: 1 | -1 }
  | { kind: "annotate"; annotation: "comment" | "replace" }   // opens entry
  | { kind: "mark"; annotation: "delete" | "approve" }        // immediate
  | { kind: "remove" }                                         // x
  | { kind: "jump"; delta: 1 | -1 }                            // n / p
  | { kind: "send" }                                           // Enter
  | { kind: "edit" }                                           // e
  | { kind: "hint" };                                          // ?

reviewKeyAction(event: { key, metaKey, ctrlKey, altKey, shiftKey }, ctx: { entryOpen: boolean }): ReviewAction | null
```

Keys with a modifier held are never review actions (so ⌘S, ⌘O, and
shift-arrow selection keep working). While the inline entry is open the
only actions are none: the entry handles Enter/Esc itself.

`verdictFor(annotations): Verdict` — `"changes"` if any comment / delete /
replace exists, else `"approved"`.

`hintText()` — the one-line key legend for the review bar.

### `src/reviewview.ts` (new, ProseMirror glue)

A Milkdown `$prose` plugin with three responsibilities:

- **Read-only.** `props.editable` returns `!reviewOn`; the flag is set via
  transaction meta so the view re-evaluates it.
- **Current block.** Plugin state holds the current top-level block index.
  A node decoration adds `data-review-current` to that block; `moveCurrent`
  and `setCurrentFromSelection` update it. Mouse clicks move it to the
  clicked block (via `handleClick`).
- **Inline entry.** A widget decoration after the current block hosting a
  `<textarea class="review-entry">` with a kind label. Enter saves,
  Shift+Enter inserts a newline, Escape cancels. The widget calls back into
  `main.ts` with the typed body; it never touches annotation state itself.

Helpers exported for `main.ts`: `setReviewMode(view, on)`,
`moveCurrent(view, delta)`, `currentBlockRange(view)`,
`openEntry(view, kind, onSubmit, onCancel)`, `closeEntry(view)`,
`jumpToAnnotatedBlock(view, annotations, delta)`.

The **target** of an action is the text selection when it is non-empty and
lies inside the current block; otherwise the whole current block's text
(same rule `openAnnotateDialog` uses today).

### `src/annotview.ts`

Renders `approve` annotations with a quiet green-tinted underline
(`annot-approve`). Comment / delete / replace are unchanged.

### `src/main.ts`

- `reviewMode` flag; `enterReviewMode()` / `exitReviewMode()` toggle the
  plugin, a `body.review-mode` class, the bar's hint, and the menu check.
- Auto-enter when `refreshReviewRequest` sees a `waiting` request for the
  open file and the user has not explicitly left review mode for this
  request (leaving with `e` is remembered per request so the bar does not
  fight the user).
- A `keydown` listener on the window that, when `reviewMode` is on, the
  event target is not a text field, and the page is not in source mode,
  runs `reviewKeyAction` and dispatches.
- The annotate dialog and its overlay are removed; ⌥⌘A and the selection
  bubble's annotate icon open the inline entry as a comment instead (in
  edit mode too — the entry works without review mode).
- `submitVerdict` and `exportReviewFeedback` pass `diskContent` to
  `buildFeedback` for line numbers.
- Enter in review mode sends `verdictFor(annotations)` when a request is
  waiting; with no request it does nothing but the hint says so.

### Review bar

While review mode is on and no request is waiting, the bar still shows,
with the key legend only (no buttons). While a request is waiting it shows
the legend plus the existing label and buttons. `?` toggles the legend.

### Native menu (`src-tauri/src/lib.rs`, `src/menu.ts`)

View → Review Mode, check item, `CmdOrCtrl+Shift+R`, id `view.review-mode`;
`sync_menu_state` learns the flag. Edit → Annotate Selection… stays.

### `src/styles.css`

`body.review-mode`: caret hidden in the page, `[data-review-current]` gets
a hairline left rule in the accent, the entry widget's field, the
`annot-approve` underline, and the bar legend's `kbd` styling.

### `skills/folio/SKILL.md`, README, site

The skill learns the `## Keep as is` section: passages listed there are
to be left untouched. README and the site's Review shortcuts table list
the keys.

## Error handling

- An action whose target quote is empty (an empty block) does nothing.
- `x` with no annotation on the target does nothing.
- Send with no waiting request does nothing; the legend shows "no review
  waiting".
- Locating a quote for line numbers is best-effort; a miss just omits the
  `L` range.

## Testing

- `tests/reviewmode.test.ts`: every key with and without modifiers, the
  entry-open gate, `verdictFor`.
- `tests/annotations.test.ts`: `approve` accepted by `loadAnnotations`,
  `locateQuote` on single-line, multi-line, and missing quotes, feedback
  with line numbers, the "Keep as is" section, verdict rules.
- Manual: `/folio` on a plan in the running app; `j`/`k`, `c` + Enter,
  `d`, `a`, `x`, `n`, Enter; check the feedback file's headings and that
  `e` returns an editable page.

## Out of scope

- Reviewing terminal output or an agent's last message.
- Threaded replies or resolving annotations from the agent side.
