# Review Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A read-only review mode where single keys move between blocks, mark them (comment, replace, delete, looks good), and send the verdict, with an inline entry field instead of the modal and line numbers in the feedback.

**Architecture:** Pure logic (key map, verdict, line lookup, feedback format) lives in `src/reviewmode.ts` and `src/annotations.ts` and is unit-tested with Vitest. ProseMirror glue (read-only prop, current-block decoration, inline entry widget) lives in a new `src/reviewview.ts` plugin registered by `MarkdownEditor`. `src/main.ts` wires keys, the review bar, the native menu, and the review-request auto-enter.

**Tech Stack:** TypeScript, Milkdown Crepe (ProseMirror), Tauri v2 (Rust menu), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-10-review-mode-design.md`

## Global Constraints

- Single keys act only while review mode is on, no modifier is held, source mode is off, and the event target is not a text field.
- The serialized Markdown is never changed by review mode; annotations stay in SQLite via the existing `add_annotation` / `delete_annotation` commands.
- `approve` marks never make the verdict "changes".
- Every pure function gets a failing test first (`npx vitest run tests/<file>.test.ts`).
- Commit messages end with the session's attribution lines.

---

### Task 1: Annotation kind `approve`, `locateQuote`, feedback with line numbers

**Files:**
- Modify: `src/annotations.ts`
- Test: `tests/annotations.test.ts`

**Interfaces:**
- Produces: `AnnotationKind = "comment" | "delete" | "replace" | "approve"`; `locateQuote(sourceText: string, quote: string): { startLine: number; endLine: number } | null`; `buildFeedback(fileName: string, annotations: Annotation[], sourceText?: string): string`.

- [ ] **Step 1: Write the failing tests** (append to `tests/annotations.test.ts`)

```ts
describe("locateQuote", () => {
  const text = "# Plan\n\nShip to all users at once.\nWatch the error rate.\n\nRoll back by flag.\n";
  it("finds a single-line quote", () => {
    expect(locateQuote(text, "Ship to all users at once.")).toEqual({ startLine: 3, endLine: 3 });
  });
  it("finds a quote spanning lines, tolerant of whitespace", () => {
    expect(locateQuote(text, "at once. Watch the")).toEqual({ startLine: 3, endLine: 4 });
  });
  it("returns null when the words are not there", () => {
    expect(locateQuote(text, "canary rollout")).toBeNull();
    expect(locateQuote(text, "")).toBeNull();
  });
});

describe("buildFeedback with approve marks and line numbers", () => {
  const text = "# Plan\n\nShip to all users at once.\n\nRoll back by flag.\n";
  it("heads entries with line ranges when the source is given", () => {
    const out = buildFeedback("plan.md", [makeAnnotation("delete", "Ship to all users at once.", "")], text);
    expect(out).toContain('## 1. Delete L3 "Ship to all users at once."');
  });
  it("lists approve marks under Keep as is and keeps the verdict approved", () => {
    const out = buildFeedback("plan.md", [makeAnnotation("approve", "Roll back by flag.", "")], text);
    expect(out).toContain("Verdict: **approved**");
    expect(out).toContain("## Keep as is");
    expect(out).toContain('- L5 "Roll back by flag."');
  });
  it("puts change requests before Keep as is and counts only them", () => {
    const out = buildFeedback("plan.md", [
      makeAnnotation("approve", "Roll back by flag.", ""),
      makeAnnotation("comment", "Ship to all users at once.", "Too fast."),
    ], text);
    expect(out).toContain("Verdict: **changes requested** (1 annotation)");
    expect(out.indexOf("## 1. Comment")).toBeLessThan(out.indexOf("## Keep as is"));
  });
  it("omits line ranges without a source text", () => {
    const out = buildFeedback("plan.md", [makeAnnotation("comment", "Ship to all", "x")]);
    expect(out).toContain('## 1. Comment on "Ship to all"');
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/annotations.test.ts` — expect failures: `locateQuote` not exported, headings differ.

- [ ] **Step 3: Implement** in `src/annotations.ts`

```ts
export type AnnotationKind = "comment" | "delete" | "replace" | "approve";
// loadAnnotations: ["comment", "delete", "replace", "approve"].includes(...)

export interface LineRange { startLine: number; endLine: number }

/** Where a quote sits in the on-disk text, as 1-based inclusive lines,
 *  matched on the word sequence so wrapping and mark splits don't matter. */
export function locateQuote(sourceText: string, quote: string): LineRange | null {
  const needle = quote.split(/\s+/).filter(Boolean);
  if (needle.length === 0) return null;
  const words: { word: string; line: number }[] = [];
  sourceText.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(/\S+/g)) words.push({ word: m[0], line: i + 1 });
  });
  outer: for (let i = 0; i + needle.length <= words.length; i++) {
    for (let j = 0; j < needle.length; j++) if (words[i + j].word !== needle[j]) continue outer;
    return { startLine: words[i].line, endLine: words[i + needle.length - 1].line };
  }
  return null;
}

function lineRef(sourceText: string | undefined, quote: string): string {
  if (sourceText === undefined) return "";
  const range = locateQuote(sourceText, quote);
  if (!range) return "";
  return range.startLine === range.endLine ? `L${range.startLine} ` : `L${range.startLine}–${range.endLine} `;
}
```

`buildFeedback(fileName, annotations, sourceText?)`: split `annotations` into `changes` (kind !== "approve") and `keeps`. Verdict line uses `changes.length`. Headings become `## ${i + 1}. Comment on ${lineRef}"${quote}"` (and `Delete ${lineRef}"…"`, `Replace ${lineRef}"…"`). After the numbered entries, if `keeps.length > 0`: `## Keep as is`, blank, then one `- ${lineRef}"${quote}"` per keep, blank. When there are no changes the verdict line is `Verdict: **approved** — no changes requested.` and the Keep section still follows.

- [ ] **Step 4: Run** `npx vitest run tests/annotations.test.ts` — PASS; run `npx vitest run` — all green (the existing "no annotations" test must still pass).

- [ ] **Step 5: Commit** `Add approve annotations and line numbers to review feedback`.

---

### Task 2: `src/reviewmode.ts` — key map and verdict

**Files:**
- Create: `src/reviewmode.ts`
- Test: `tests/reviewmode.test.ts`

**Interfaces:**
- Produces:

```ts
export type ReviewAction =
  | { kind: "move"; delta: 1 | -1 }
  | { kind: "annotate"; annotation: "comment" | "replace" }
  | { kind: "mark"; annotation: "delete" | "approve" }
  | { kind: "remove" }
  | { kind: "jump"; delta: 1 | -1 }
  | { kind: "send" }
  | { kind: "edit" }
  | { kind: "hint" };
export interface KeyLike { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }
export function reviewKeyAction(e: KeyLike, ctx: { entryOpen: boolean }): ReviewAction | null;
export function verdictFor(annotations: { kind: AnnotationKind }[]): Verdict;
export function hintText(waiting: boolean): string;
```

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from "vitest";
import { hintText, reviewKeyAction, verdictFor } from "../src/reviewmode";

const k = (key: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) =>
  ({ key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods });
const closed = { entryOpen: false };

describe("reviewKeyAction", () => {
  it("moves with j/k and the arrows", () => {
    expect(reviewKeyAction(k("j"), closed)).toEqual({ kind: "move", delta: 1 });
    expect(reviewKeyAction(k("ArrowDown"), closed)).toEqual({ kind: "move", delta: 1 });
    expect(reviewKeyAction(k("k"), closed)).toEqual({ kind: "move", delta: -1 });
    expect(reviewKeyAction(k("ArrowUp"), closed)).toEqual({ kind: "move", delta: -1 });
  });
  it("maps the marking keys", () => {
    expect(reviewKeyAction(k("c"), closed)).toEqual({ kind: "annotate", annotation: "comment" });
    expect(reviewKeyAction(k("r"), closed)).toEqual({ kind: "annotate", annotation: "replace" });
    expect(reviewKeyAction(k("d"), closed)).toEqual({ kind: "mark", annotation: "delete" });
    expect(reviewKeyAction(k("a"), closed)).toEqual({ kind: "mark", annotation: "approve" });
    expect(reviewKeyAction(k("x"), closed)).toEqual({ kind: "remove" });
    expect(reviewKeyAction(k("n"), closed)).toEqual({ kind: "jump", delta: 1 });
    expect(reviewKeyAction(k("p"), closed)).toEqual({ kind: "jump", delta: -1 });
    expect(reviewKeyAction(k("Enter"), closed)).toEqual({ kind: "send" });
    expect(reviewKeyAction(k("e"), closed)).toEqual({ kind: "edit" });
    expect(reviewKeyAction(k("?"), closed)).toEqual({ kind: "hint" });
  });
  it("ignores modified keys so app shortcuts and shift-selection keep working", () => {
    expect(reviewKeyAction(k("s", { metaKey: true }), closed)).toBeNull();
    expect(reviewKeyAction(k("ArrowDown", { shiftKey: true }), closed)).toBeNull();
    expect(reviewKeyAction(k("c", { ctrlKey: true }), closed)).toBeNull();
  });
  it("does nothing while the entry field is open", () => {
    expect(reviewKeyAction(k("c"), { entryOpen: true })).toBeNull();
    expect(reviewKeyAction(k("Enter"), { entryOpen: true })).toBeNull();
  });
  it("ignores unmapped keys", () => {
    expect(reviewKeyAction(k("z"), closed)).toBeNull();
  });
});

describe("verdictFor", () => {
  it("is approved with no change requests, whatever the approve marks", () => {
    expect(verdictFor([])).toBe("approved");
    expect(verdictFor([{ kind: "approve" }])).toBe("approved");
  });
  it("is changes with any comment, delete, or replace", () => {
    expect(verdictFor([{ kind: "approve" }, { kind: "comment" }])).toBe("changes");
  });
});

describe("hintText", () => {
  it("names every key and says when nothing is waiting", () => {
    expect(hintText(true)).toContain("⏎ send");
    expect(hintText(false)).toContain("no review waiting");
  });
});
```

- [ ] **Step 2: Run** — fails, module missing.

- [ ] **Step 3: Implement** `src/reviewmode.ts`

```ts
import type { AnnotationKind } from "./annotations";
import type { Verdict } from "./reviewgate";

const KEYS: Record<string, ReviewAction> = {
  j: { kind: "move", delta: 1 }, ArrowDown: { kind: "move", delta: 1 },
  k: { kind: "move", delta: -1 }, ArrowUp: { kind: "move", delta: -1 },
  c: { kind: "annotate", annotation: "comment" }, r: { kind: "annotate", annotation: "replace" },
  d: { kind: "mark", annotation: "delete" }, a: { kind: "mark", annotation: "approve" },
  x: { kind: "remove" }, n: { kind: "jump", delta: 1 }, p: { kind: "jump", delta: -1 },
  Enter: { kind: "send" }, e: { kind: "edit" }, "?": { kind: "hint" },
};

export function reviewKeyAction(e: KeyLike, ctx: { entryOpen: boolean }): ReviewAction | null {
  if (ctx.entryOpen) return null;
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  if (e.shiftKey && e.key !== "?") return null;
  const action = KEYS[e.key];
  return action ? { ...action } : null;
}

export function verdictFor(annotations: { kind: AnnotationKind }[]): Verdict {
  return annotations.some((a) => a.kind !== "approve") ? "changes" : "approved";
}

export function hintText(waiting: boolean): string {
  const keys = "j/k move · c comment · r replace · d delete · a looks good · x remove · n/p next · e edit";
  return waiting ? `${keys} · ⏎ send` : `${keys} · no review waiting`;
}
```

- [ ] **Step 4: Run** — PASS. **Step 5: Commit** `Add the review-mode key map and verdict rule`.

---

### Task 3: `src/reviewview.ts` — ProseMirror plugin (read-only, current block, inline entry)

**Files:**
- Create: `src/reviewview.ts`
- Modify: `src/editor.ts` (register plugin; add `withView` already exists)
- Modify: `src/annotview.ts` (render `approve` as `annot-approve`)
- Modify: `src/styles.css`

No unit tests (DOM/ProseMirror); verified in Task 6 manually. Keep the module small and free of annotation state.

- [ ] **Step 1: Write the plugin**

```ts
import { $prose } from "@milkdown/kit/utils";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/kit/prose/view";

interface ReviewState { on: boolean; current: number; entry: EntrySpec | null }
interface EntrySpec { kind: "comment" | "replace"; onSubmit: (body: string) => void; onCancel: () => void }

export const reviewKey = new PluginKey<ReviewState>("FOLIO_REVIEW");

export const reviewViewPlugin = $prose(() => new Plugin<ReviewState>({
  key: reviewKey,
  state: {
    init: () => ({ on: false, current: 0, entry: null }),
    apply(tr, prev) {
      const meta = tr.getMeta(reviewKey) as Partial<ReviewState> | undefined;
      const next = meta ? { ...prev, ...meta } : prev;
      return { ...next, current: Math.min(next.current, Math.max(0, tr.doc.childCount - 1)) };
    },
  },
  props: {
    editable: (state) => !(reviewKey.getState(state)?.on),
    decorations(state) {
      const s = reviewKey.getState(state);
      if (!s?.on || state.doc.childCount === 0) return DecorationSet.empty;
      const { from, to } = blockRange(state.doc, s.current);
      const decos = [Decoration.node(from - 1, to + 1, { "data-review-current": "" })];
      if (s.entry) decos.push(Decoration.widget(to + 1, () => entryWidget(s.entry!), { side: 1, key: "review-entry" }));
      return DecorationSet.create(state.doc, decos);
    },
    handleClick(view, pos) {
      const s = reviewKey.getState(view.state);
      if (!s?.on) return false;
      const index = view.state.doc.resolve(pos).index(0);
      view.dispatch(view.state.tr.setMeta(reviewKey, { current: index }));
      return false;
    },
  },
}));
```

`blockRange(doc, index)` sums `nodeSize` of preceding children; returns `{ from: before + 1, to: before + node.nodeSize - 1 }` (content range).

`entryWidget(spec)`: a `<div class="review-entry">` with a `<span>` label ("Comment" / "Replacement") and a `<textarea rows=2>` with placeholder ("Your note for the agent…" / "Suggested replacement…"). `keydown`: Enter without Shift → `spec.onSubmit(value.trim())` (ignore empty); Escape → `spec.onCancel()`. Stop propagation of keydown so review keys don't fire. Focus the textarea in a `requestAnimationFrame`.

Exports:

```ts
export function setReviewMode(view: EditorView, on: boolean): void      // meta {on}, also sets current from the selection's top-level index
export function isReviewMode(view: EditorView): boolean
export function moveCurrent(view: EditorView, delta: 1 | -1): void      // clamps, dispatches meta, scrolls the block into view (view.nodeDOM(from-1)?.scrollIntoView({block:"nearest"}))
export function currentBlockText(view: EditorView): string             // doc.child(current).textContent
export function targetQuote(view: EditorView): string                  // non-empty selection inside the current block → its text, else the block text
export function openEntry(view: EditorView, spec: EntrySpec): void     // meta {entry: spec}
export function closeEntry(view: EditorView): void                     // meta {entry: null}
export function isEntryOpen(view: EditorView): boolean
export function setCurrentByPos(view: EditorView, pos: number): void   // used by jump-to-annotation
```

- [ ] **Step 2: Register** in `src/editor.ts` after `annotationPlugin`: `this.crepe.editor.use(reviewViewPlugin);`

- [ ] **Step 3: `annotview.ts`** — before the comment branch: `if (annotation.kind === "approve") { decorations.push(Decoration.inline(range.from, range.to, { class: "annot-approve" })); continue; }`

- [ ] **Step 4: CSS** in `src/styles.css` near the annotation styles:

```css
body.review-mode #editor .milkdown .ProseMirror { caret-color: transparent; }
#editor .milkdown .ProseMirror > [data-review-current] {
  box-shadow: -3px 0 0 0 var(--accent);
  padding-left: 0.6rem; margin-left: -0.6rem; border-radius: 2px;
}
.review-entry { margin: 0.4rem 0 1rem; font-family: var(--font-ui); font-size: 12.5px; }
.review-entry span { display: block; color: var(--ink-faint); margin-bottom: 4px; }
.review-entry textarea { width: 100%; font: inherit; font-size: 13.5px; padding: 8px 10px; border: 1px solid var(--hairline); border-radius: 6px; background: var(--paper-raised); color: var(--ink); resize: vertical; outline: none; }
.review-entry textarea:focus { border-color: var(--accent); }
.milkdown .ProseMirror .annot-approve { text-decoration: underline; text-decoration-style: dotted; text-decoration-color: oklch(0.6 0.12 155); text-underline-offset: 3px; }
```

- [ ] **Step 5:** `npx tsc --noEmit` clean. Commit `Add the review-mode ProseMirror plugin`.

---

### Task 4: Native menu item View → Review Mode (⌘⇧R)

**Files:**
- Modify: `src-tauri/src/lib.rs` (CHECK_IDS array, `sync_menu_state` signature and `checks`, View menu builder after Typewriter Mode)
- Modify: `src/menu.ts` (`{ kind: "toggle-review-mode" }`, `case "view.review-mode"`)
- Modify: `src/main.ts` `syncMenuState` (pass `review: reviewMode`)
- Test: `tests/menu.test.ts` (add the mapping case)

- [ ] Rust: `CHECK_IDS: [&str; 9]` adding `"view.review-mode"`; `sync_menu_state(..., review: bool, ...)` with `("view.review-mode", review)`; builder: `.item(&check_item(app, "view.review-mode", "Review Mode", Some("CmdOrCtrl+Shift+R"), false)?)` after Typewriter Mode.
- [ ] `cargo test` in `src-tauri` passes. Commit `Add View → Review Mode to the native menu`.

---

### Task 5: Wire review mode in `src/main.ts`

**Files:**
- Modify: `src/main.ts`, `index.html` (remove `#annot-overlay`), `src/styles.css` (remove `.annot-*` dialog styles that only served the overlay; keep sidebar styles), `src/editor.ts` (annotate bubble callback unchanged).

- [ ] **Step 1: State and toggles**

```ts
let reviewMode = false;
/** Requests the user left with `e`; auto-enter must not fight them. */
const dismissedReviewRequests = new Set<string>();

function enterReviewMode(): void {
  if (sourceMode || reviewMode) return;
  reviewMode = true;
  document.body.classList.add("review-mode");
  editor.withView((view) => setReviewMode(view, true));
  renderReviewBar();
  syncMenuState();
}

function exitReviewMode(): void {
  if (!reviewMode) return;
  reviewMode = false;
  document.body.classList.remove("review-mode");
  editor.withView((view) => { closeEntry(view); setReviewMode(view, false); view.focus(); });
  if (reviewRequest?.state === "waiting") dismissedReviewRequests.add(reviewRequest.requestedAt);
  renderReviewBar();
  syncMenuState();
}

function toggleReviewMode(): void { reviewMode ? exitReviewMode() : enterReviewMode(); }
```

- [ ] **Step 2: Auto-enter** at the end of `refreshReviewRequest` (after `reviewRequest = result`): `if (result?.state === "waiting" && !reviewMode && !sourceMode && !dismissedReviewRequests.has(result.requestedAt)) enterReviewMode();`. On `loadContent`/`newFile` (where `reviewRequest` is reset) also `exitReviewMode()` and, because the editor is recreated by `setContent`, re-apply `setReviewMode(view, reviewMode)` after `editor.setContent` in `loadContent` and `exitSourceMode`.

- [ ] **Step 3: Inline entry replaces the dialog**

```ts
function openInlineEntry(kind: "comment" | "replace"): void {
  if (sourceMode || !doc.filePath) return;
  editor.withView((view) => {
    const quote = reviewMode ? targetQuote(view) : selectionOrBlockQuote(view);
    if (!quote.trim()) return;
    if (!reviewMode) setCurrentByPos(view, view.state.selection.from);
    openEntry(view, {
      kind,
      onSubmit: (body) => { closeEntry(view); addAnnotation(kind, quote, body); },
      onCancel: () => { closeEntry(view); view.focus(); },
    });
  });
}

function addAnnotation(kind: AnnotationKind, quote: string, body: string): void {
  if (!doc.filePath) return;
  const annotation = makeAnnotation(kind, quote, body);
  trackEvent("annotate");
  annotations = [...annotations, annotation];
  void invoke("add_annotation", { path: doc.filePath, annotation });
  sidebarOpen = true;
  renderAnnotationsNow();
}
```

`selectionOrBlockQuote(view)` is the body of today's `openAnnotateDialog` quote logic. `openAnnotateDialog` becomes `() => openInlineEntry("comment")` for the menu item and the bubble icon. Delete `pendingQuote`, `annotQuote`, `annotBody`, `annotSaveBtn`, `annotCancelBtn`, `annotOverlay`, `selectedAnnotKind`, `syncAnnotBodyVisibility`, `closeAnnotateDialog`, `saveAnnotation`, their listeners, the Escape handler, and the overlay markup in `index.html`. Note: in edit mode the entry widget sits in an editable doc; the widget's keydown stops propagation so typing stays in the textarea.

- [ ] **Step 4: Key handling**

```ts
window.addEventListener("keydown", (e) => {
  if (!reviewMode || sourceMode) return;
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.isContentEditable && !target.closest(".ProseMirror"))) return;
  let entryOpen = false;
  editor.withView((view) => { entryOpen = isEntryOpen(view); });
  const action = reviewKeyAction(e, { entryOpen });
  if (!action) return;
  e.preventDefault();
  runReviewAction(action);
});

function runReviewAction(action: ReviewAction): void {
  switch (action.kind) {
    case "move": editor.withView((view) => moveCurrent(view, action.delta)); break;
    case "annotate": openInlineEntry(action.annotation); break;
    case "mark": editor.withView((view) => { const q = targetQuote(view); if (q.trim()) addAnnotation(action.annotation, q, ""); }); break;
    case "remove": editor.withView((view) => { const q = targetQuote(view); const hit = annotations.find((a) => a.quote === q); if (hit) void deleteAnnotation(hit); }); break;
    case "jump": jumpToAnnotation(nextAnnotation(action.delta)); break;
    case "send": if (reviewRequest?.state === "waiting") void submitVerdict(verdictFor(annotations)); break;
    case "edit": exitReviewMode(); break;
    case "hint": hintVisible = !hintVisible; renderReviewBar(); break;
  }
}
```

`nextAnnotation(delta)`: cycle through `annotations` from `jumpIndex` (a module-level counter, reset on load). The `isContentEditable` clause: the ProseMirror root is contenteditable="false" in review mode, so keys reach the window; an editable ProseMirror (edit mode) never gets here because `reviewMode` is false.

- [ ] **Step 5: Review bar** — add `<span id="review-bar-hint"></span>` to `#review-bar` in `index.html` (before the label) and `let hintVisible = true;`. In `renderReviewBar`: `reviewBar.hidden = !(model.visible || reviewMode)`; hint text `hintText(reviewRequest?.state === "waiting")` when `reviewMode && hintVisible`, else empty; buttons and label shown only when `model.visible`. CSS: `#review-bar-hint { color: var(--ink-faint); font-size: 11.5px; }` and, when the bar is on with no request, no buttons. `feedbackWithEditNote` / `buildFeedback` calls pass `diskContent ?? undefined`.

- [ ] **Step 6: Menu dispatch** — `case "toggle-review-mode": toggleReviewMode(); return;` and `syncMenuState` passes `review: reviewMode`.

- [ ] **Step 7:** `npx tsc --noEmit`, `npx vitest run`, commit `Add Review Mode: single-key annotation with an inline entry`.

---

### Task 6: Verify in the app

- [ ] `npm run tauri dev -- -- evaluation/03-lists.md`; View → Review Mode; `j`/`k` move the rule; `c` opens the field under the block; Enter saves a comment (sidebar shows it); `d`, `a`, `x` behave; `e` restores editing; File → Export Review Feedback writes `L` ranges and a Keep as is section.
- [ ] From a shell: `folio review --wait --agent test evaluation/03-lists.md` → the window enters review mode by itself, the bar shows the legend plus the buttons, Enter with no change requests exits the CLI with 0.

---

### Task 7: Docs, skill, site

**Files:** `skills/folio/SKILL.md`, `README.md`, `site/index.html` (Review shortcuts table).

- [ ] SKILL.md, after the feedback-format paragraph: `A **Keep as is** section lists passages the user marked as good. Leave those untouched when you revise.`
- [ ] README "Annotate the plan, send it back": describe review mode and the keys (`j`/`k`, `c`, `r`, `d`, `a`, `x`, `n`/`p`, Enter, `e`, ⌘⇧R).
- [ ] Site Review table rows: Review Mode ⌘⇧R; then a row per key group.
- [ ] Commit `Document Review Mode`.
