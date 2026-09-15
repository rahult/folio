/**
 * Review Mode's ProseMirror half: while review mode is on the document is
 * read-only, one top-level block is "current" (marked with
 * data-review-current so CSS can rule it), and an inline entry field can be
 * shown beneath it for typing a comment or replacement. This module holds
 * no annotation state — main.ts decides what a typed body becomes.
 */

import { $prose } from "@milkdown/kit/utils";
import type { Node } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/kit/prose/view";
import { sectionAround, sentenceAt } from "./textscope";

export interface EntrySpec {
  kind: "comment" | "replace";
  /** Text the field starts with (a lens finding, for instance). */
  prefill?: string;
  /** Overrides the field's label, e.g. "Replace the sentence". */
  label?: string;
  onSubmit: (body: string) => void;
  onCancel: () => void;
}

interface ReviewState {
  on: boolean;
  /** Index of the current top-level block. */
  current: number;
  entry: EntrySpec | null;
  /** Where the entry field sits: right after the selected text when the
   *  selection lies in the current block, else after the block. */
  entryAt: number | null;
}

export const reviewKey = new PluginKey<ReviewState>("FOLIO_REVIEW");

/** Content range (inside the block) of top-level child `index`. */
function blockRange(doc: Node, index: number): { from: number; to: number } {
  let before = 0;
  for (let i = 0; i < index; i++) before += doc.child(i).nodeSize;
  return { from: before + 1, to: before + doc.child(index).nodeSize - 1 };
}

const ENTRY_LABEL = { comment: "Comment", replace: "Suggested replacement" };
const ENTRY_PLACEHOLDER = {
  comment: "Your note for the agent — Enter saves, Esc cancels",
  replace: "The text you'd put here instead — Enter saves, Esc cancels",
};

function entryWidget(spec: EntrySpec): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "review-entry";
  const label = document.createElement("span");
  label.textContent = spec.label ?? ENTRY_LABEL[spec.kind];
  const field = document.createElement("textarea");
  field.rows = 2;
  field.placeholder = ENTRY_PLACEHOLDER[spec.kind];
  if (spec.prefill) field.value = spec.prefill;
  field.addEventListener("keydown", (e) => {
    // The field owns the keyboard: nothing here is a review key or an
    // editor command.
    e.stopPropagation();
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const body = field.value.trim();
      if (body) spec.onSubmit(body);
    } else if (e.key === "Escape") {
      e.preventDefault();
      spec.onCancel();
    }
  });
  // ProseMirror would otherwise treat clicks in the widget as selection.
  wrap.addEventListener("mousedown", (e) => e.stopPropagation());
  wrap.append(label, field);
  requestAnimationFrame(() => {
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  });
  return wrap;
}

export const reviewViewPlugin = $prose(
  () =>
    new Plugin<ReviewState>({
      key: reviewKey,
      state: {
        init: () => ({ on: false, current: 0, entry: null, entryAt: null }),
        apply(tr, prev) {
          const meta = tr.getMeta(reviewKey) as Partial<ReviewState> | undefined;
          const next = meta ? { ...prev, ...meta } : prev;
          const last = Math.max(0, tr.doc.childCount - 1);
          return next.current > last ? { ...next, current: last } : next;
        },
      },
      // The document stays editable so the caret shows and the mouse can
      // select; while review is on, any change to the text is refused, so
      // typing does nothing and the single-key vocabulary owns the keys.
      filterTransaction(tr, state) {
        return !(reviewKey.getState(state)?.on && tr.docChanged);
      },
      props: {
        decorations(state) {
          const s = reviewKey.getState(state);
          if (!s || state.doc.childCount === 0) return DecorationSet.empty;
          const { from, to } = blockRange(state.doc, s.current);
          const decorations: Decoration[] = [];
          if (s.on) {
            decorations.push(Decoration.node(from - 1, to + 1, { "data-review-current": "" }));
          }
          if (s.entry) {
            const entry = s.entry;
            const at = Math.min(s.entryAt ?? to + 1, state.doc.content.size);
            decorations.push(
              Decoration.widget(at, () => entryWidget(entry), {
                side: 1,
                key: `review-entry-${entry.kind}-${at}`,
              }),
            );
          }
          return DecorationSet.create(state.doc, decorations);
        },
        handleClick(view, pos) {
          const s = reviewKey.getState(view.state);
          if (!s?.on) return false;
          view.dispatch(view.state.tr.setMeta(reviewKey, { current: view.state.doc.resolve(pos).index(0) }));
          return false;
        },
      },
    }),
);

function state(view: EditorView): ReviewState | undefined {
  return reviewKey.getState(view.state);
}

function currentIndex(view: EditorView): number {
  const s = state(view);
  return Math.min(s?.current ?? 0, Math.max(0, view.state.doc.childCount - 1));
}

function scrollBlockIntoView(view: EditorView, index: number): void {
  if (view.state.doc.childCount === 0) return;
  const { from } = blockRange(view.state.doc, index);
  const dom = view.nodeDOM(from - 1);
  if (dom instanceof HTMLElement) dom.scrollIntoView({ block: "nearest" });
}

/** Turn review mode on or off. Entering makes the block under the caret
 *  current, so the reviewer starts where they were reading. */
export function setReviewMode(view: EditorView, on: boolean): void {
  const { $from } = view.state.selection;
  const current = on && $from.depth > 0 ? $from.index(0) : currentIndex(view);
  view.dispatch(view.state.tr.setMeta(reviewKey, { on, current, entry: null, entryAt: null }));
  if (on) scrollBlockIntoView(view, current);
}

export function isReviewMode(view: EditorView): boolean {
  return state(view)?.on ?? false;
}

export function moveCurrent(view: EditorView, delta: 1 | -1): void {
  const last = Math.max(0, view.state.doc.childCount - 1);
  const current = Math.min(last, Math.max(0, currentIndex(view) + delta));
  view.dispatch(view.state.tr.setMeta(reviewKey, { current, entry: null, entryAt: null }));
  scrollBlockIntoView(view, current);
}

/** Make the block containing `pos` current. */
export function setCurrentByPos(view: EditorView, pos: number): void {
  const $pos = view.state.doc.resolve(Math.min(pos, view.state.doc.content.size));
  const current = $pos.depth > 0 ? $pos.index(0) : Math.min($pos.index(0), Math.max(0, view.state.doc.childCount - 1));
  view.dispatch(view.state.tr.setMeta(reviewKey, { current }));
  scrollBlockIntoView(view, current);
}

/** What an action applies to: the text selection when it is non-empty and
 *  inside the current block, otherwise the whole current block's text. */
export function targetQuote(view: EditorView): string {
  const { doc, selection } = view.state;
  if (doc.childCount === 0) return "";
  const { from, to } = blockRange(doc, currentIndex(view));
  if (!selection.empty && selection.from >= from && selection.to <= to) {
    return doc.textBetween(selection.from, selection.to, "\n", " ");
  }
  return doc.textBetween(from, to, "\n", " ");
}

/** Show the entry field beside the selected text when the selection sits
 *  in the current block, otherwise under the block. */
export type QuoteScope = "selection" | "sentence" | "section";

/** The passage an action applies to, by scope: the selection or block
 *  (see `targetQuote`), the sentence under the caret inside the current
 *  block, or the whole section the current block belongs to. */
export function quoteFor(view: EditorView, scope: QuoteScope): string {
  const { doc, selection } = view.state;
  if (doc.childCount === 0) return "";
  if (scope === "selection") return targetQuote(view);
  const index = currentIndex(view);
  if (scope === "sentence") {
    const { from, to } = blockRange(doc, index);
    const text = doc.textBetween(from, to, "\n", " ");
    const caret = Math.min(Math.max(selection.from, from), to) - from;
    const span = sentenceAt(text, caret);
    return text.slice(span.start, span.end);
  }
  const levels: number[] = [];
  doc.forEach((node) => levels.push(node.type.name === "heading" ? Number(node.attrs.level ?? 1) : 0));
  const { start, end } = sectionAround(levels, index);
  const parts: string[] = [];
  for (let i = start; i < end; i++) {
    const { from, to } = blockRange(doc, i);
    parts.push(doc.textBetween(from, to, "\n", " "));
  }
  return parts.join("\n");
}

/** When the current block asks a question with a numbered or bulleted
 *  list of options right after it (or is that list), the question and the
 *  option texts; else null. */
export function currentOptions(view: EditorView): { question: string; options: string[] } | null {
  const { doc } = view.state;
  if (doc.childCount === 0) return null;
  const index = currentIndex(view);
  const isList = (i: number) => {
    const name = doc.child(i).type.name;
    return name === "ordered_list" || name === "bullet_list";
  };
  const textOf = (i: number) => {
    const { from, to } = blockRange(doc, i);
    return doc.textBetween(from, to, "\n", " ");
  };
  const itemsOf = (i: number) => {
    const items: string[] = [];
    doc.child(i).forEach((item) => items.push(item.textContent.trim()));
    return items.filter((t) => t.length > 0);
  };
  if (isList(index)) {
    return { question: index > 0 ? textOf(index - 1) : "", options: itemsOf(index) };
  }
  if (index + 1 < doc.childCount && isList(index + 1)) {
    return { question: textOf(index), options: itemsOf(index + 1) };
  }
  return null;
}

export function openEntry(view: EditorView, spec: EntrySpec): void {
  const { doc, selection } = view.state;
  let entryAt: number | null = null;
  if (doc.childCount > 0) {
    const { from, to } = blockRange(doc, currentIndex(view));
    if (!selection.empty && selection.from >= from && selection.to <= to) entryAt = selection.to;
  }
  view.dispatch(view.state.tr.setMeta(reviewKey, { entry: spec, entryAt }));
}

export function closeEntry(view: EditorView): void {
  if (state(view)?.entry) view.dispatch(view.state.tr.setMeta(reviewKey, { entry: null, entryAt: null }));
}

export function isEntryOpen(view: EditorView): boolean {
  return state(view)?.entry != null;
}
