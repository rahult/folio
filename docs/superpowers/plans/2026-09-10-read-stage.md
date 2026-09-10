# Read Stage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A reading panel with an Outline tab (headings, per-section reading time, current section), reading time in the status bar, and a "What I took from it" takeaway saved to `<doc>.decision.md`.

**Architecture:** Pure modules `src/outline.ts` (remark-based outline and reading time) and `src/decisionfile.ts` (companion file sections) carry the logic and the tests. `src/panel.ts` owns the panel DOM (tabs, takeaway field, outline list) and calls back into `main.ts` for navigation and saving. The annotations sidebar becomes the panel's second tab with its existing rendering code untouched.

**Tech Stack:** TypeScript, remark-parse/remark-gfm/mdast-util-to-string (already in the tree), Vitest, Tauri v2 menu.

**Spec:** `docs/superpowers/specs/2026-09-10-read-stage-design.md`

## Global Constraints

- Reading speed 230 words per minute; minutes are `ceil`, at least 1 when words > 0, 0 for empty.
- `<doc>.decision.md` is the only file written; other sections in it must survive a takeaway save byte-for-byte.
- Every pure function gets a failing test first.
- Commit messages end with the session's attribution lines.

---

### Task 1: `countWords` moves to `src/markdown.ts`; `src/outline.ts`

**Files:** Create `src/outline.ts`; modify `src/markdown.ts`, `src/main.ts` (import `countWords`); tests `tests/outline.test.ts`, `tests/markdown.test.ts`.

**Interfaces produced:**
```ts
export interface OutlineEntry { level: number; text: string; index: number; offset: number; words: number }
export function buildOutline(markdown: string): OutlineEntry[]
export function readingMinutes(words: number, wpm?: number): number
export function sectionAtOffset(outline: OutlineEntry[], offset: number): number
```

- [ ] Tests:

```ts
const DOC = "Intro words here.\n\n# One\n\nAlpha beta gamma.\n\n## One point one\n\nDelta *epsilon*.\n\nTwo\n---\n\nZeta `eta` theta iota.\n";
it("lists headings with level, stripped text, index, and offset", () => {
  const o = buildOutline(DOC);
  expect(o.map((e) => [e.level, e.text, e.index])).toEqual([[1, "One", 0], [2, "One point one", 1], [2, "Two", 2]]);
  expect(DOC.slice(o[0].offset, o[0].offset + 5)).toBe("# One");
});
it("counts the words of each section up to the next heading", () => {
  expect(buildOutline(DOC).map((e) => e.words)).toEqual([3, 2, 4]);
});
it("returns an empty outline for a document without headings", () => { expect(buildOutline("just text")).toEqual([]); });
it("rounds reading minutes up and never reports 0 for a non-empty text", () => {
  expect(readingMinutes(0)).toBe(0); expect(readingMinutes(1)).toBe(1); expect(readingMinutes(230)).toBe(1); expect(readingMinutes(231)).toBe(2); expect(readingMinutes(460, 460)).toBe(1);
});
it("finds the section holding an offset", () => {
  const o = buildOutline(DOC);
  expect(sectionAtOffset(o, 0)).toBe(-1);
  expect(sectionAtOffset(o, o[0].offset)).toBe(0);
  expect(sectionAtOffset(o, o[1].offset + 3)).toBe(1);
  expect(sectionAtOffset(o, DOC.length)).toBe(2);
});
```

- [ ] Implement: parse with `unified().use(remarkParse).use(remarkGfm)`; walk `root.children`; for each `heading` push an entry with `toString(node)` (mdast-util-to-string) and `position.start.offset`; words of a section = `countWords` over `toString` of every root child between this heading (exclusive) and the next heading. `sectionAtOffset`: last entry with `offset <= target`, else -1.
- [ ] `countWords` exported from `src/markdown.ts`, imported in `main.ts`; add `mdast-util-to-string` to dependencies (already installed transitively).
- [ ] Commit `Add the document outline model`.

### Task 2: `src/decisionfile.ts`

**Interfaces produced:**
```ts
export function decisionFilePath(docPath: string): string
export function readTakeaway(fileText: string): string
export function writeTakeaway(fileText: string | null, docName: string, docPath: string, takeaway: string): string
```

- [ ] Tests: path helper; `readTakeaway` on a file with the section (trims, keeps inner blank lines), without the section, empty string; `writeTakeaway(null, …)` produces the skeleton; replacing an existing takeaway keeps a following `## Options` section byte-for-byte; a preceding unrelated section is kept; empty takeaway leaves the heading with no body.
- [ ] Implement with a line scan: find the `## What I took from it` heading; its body runs to the next line starting with `## ` or `# `, or EOF.
- [ ] Commit `Add the decision companion file model`.

### Task 3: Panel DOM and styles

**Files:** `index.html` (replace `#annot-sidebar` with `#panel`), `src/styles.css`, create `src/panel.ts`.

- [ ] Markup:
```html
<aside id="panel" hidden aria-label="Reading panel">
  <header id="panel-header">
    <div id="panel-tabs" role="tablist">
      <button id="panel-tab-outline" role="tab" aria-selected="true" aria-controls="panel-outline">Outline</button>
      <button id="panel-tab-annotations" role="tab" aria-selected="false" aria-controls="panel-annotations">Annotations</button>
    </div>
    <button id="panel-close" …>×</button>
  </header>
  <section id="panel-outline" role="tabpanel">
    <textarea id="takeaway" rows="3" placeholder="What I took from it, in my own words" aria-label="What I took from it"></textarea>
    <div id="reading-stats"></div>
    <ol id="outline-list" tabindex="0" aria-label="Document outline"></ol>
  </section>
  <section id="panel-annotations" role="tabpanel" hidden>
    <div id="annot-list"></div>
  </section>
</aside>
```
- [ ] `src/panel.ts` exports `type PanelTab = "outline" | "annotations"`, `openPanel(tab?)`, `closePanel()`, `togglePanel(tab?)`, `isPanelOpen()`, `activeTab()`, `onPanelChange(cb)`, `renderOutline(entries, current, onPick)`, `renderStats(words, minutes)`, `setTakeaway(text)`, `takeawayField` (the element), `setTakeawayEnabled(enabled, placeholder)`, `markTakeawaySaveFailed(failed)`. Persists the tab in `localStorage("folio-panel-tab")`. Arrow keys in `#outline-list` move `aria-current`; Enter picks.
- [ ] Styles: rename `#annot-sidebar*` rules to `#panel*`; tabs as the quiet uppercase labels; `#takeaway` like the review entry field; `#outline-list li` rows with `padding-left: calc(8px + (level - 1) * 12px)`, `[aria-current] { box-shadow: inset 3px 0 0 var(--accent) }`, right-aligned faint minutes.
- [ ] Commit `Add the reading panel with Outline and Annotations tabs`.

### Task 4: Wire it in `main.ts`, menu, review mode

- [ ] Replace `sidebarOpen`/`annotSidebar` with `openPanel("annotations")` / `closePanel()`; `renderSidebar` keeps rendering into `#annot-list`.
- [ ] Outline refresh: `refreshOutline()` builds from `currentMarkdown()`, renders with the current section; called from `loadContent`, `markdownUpdated` (debounced 300 ms), and source `input`.
- [ ] Current section: `onSelectionUpdate` → `editor.caretAnchor()` → `offsetFromAnchor(currentMarkdown(), anchor)` → `sectionAtOffset`; source view: `selectionchange` on the textarea → `selectionStart`.
- [ ] Navigation: rendered → walk `doc.descendants`, count `heading` nodes to `entry.index`, `TextSelection.near(resolve(pos + 1))` + `scrollIntoView`, and `setCurrentByPos` when `reviewMode`; source → `placeSourceCaret(entry.offset)`.
- [ ] Stats: `renderStatus(words)` sets `wordCountEl` to `${words.toLocaleString()} words` plus ` · ${m} min` when `m > 0`; also `renderStats` in the panel.
- [ ] Takeaway: on load, `read_text_file(decisionFilePath)` (catch → ""), `setTakeaway`; disabled for untitled. `input` → debounce 800 ms → `write_text_file(decisionFilePath, writeTakeaway(existing, doc.fileName, path, value))`; keep `existing` in memory after each read/write; `blur` saves immediately; failure → `markTakeawaySaveFailed(true)`.
- [ ] Menu: `view.panel` check item "Reading Panel" `CmdOrCtrl+Shift+O` in Rust (CHECK_IDS 10, `sync_menu_state(panel: bool)`), `menu.ts` `{ kind: "toggle-panel" }`, test.
- [ ] Review mode: `o` → `{ kind: "outline" }` in `reviewmode.ts` (test), handled by `togglePanel("outline")`; add `o outline` to the hint.
- [ ] Commit `Wire the reading panel: outline navigation, stats, takeaway`.

### Task 5: Verify in the app and document

- [ ] `npm run tauri dev` on `evaluation/11-stress.md`: panel opens with ⌘⇧O, outline scrolls, current section follows the caret, click jumps, source-mode click jumps, takeaway round-trips through a relaunch, `03-lists.md.decision.md` content correct.
- [ ] README: a "Read" paragraph (panel, outline, takeaway, `<doc>.decision.md`); site shortcuts add Reading Panel ⇧⌘O; skill unchanged (later stage).
- [ ] Commit `Document the reading panel`.
