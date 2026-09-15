/**
 * Review Mode: the single-key vocabulary for reviewing a document without
 * editing it — move between blocks, mark them, send the verdict. This is
 * the pure half (key map, verdict rule, the bar's legend); the ProseMirror
 * glue lives in src/reviewview.ts and the wiring in src/main.ts. See
 * docs/superpowers/specs/2026-09-10-review-mode-design.md.
 */

import { isChangeRequest, type AnnotationKind } from "./annotations";
import type { Verdict } from "./reviewgate";

export type ReviewAction =
  | { kind: "move"; delta: 1 | -1 }
  /** Opens the inline entry field; the annotation is saved on Enter.
   *  `scope` narrows a replacement to the sentence under the caret or
   *  widens it to the whole section; unset means the selection or block. */
  | { kind: "annotate"; annotation: "comment" | "replace"; scope?: "sentence" | "section" }
  /** Pick the n-th option of the list the current block asks about. */
  | { kind: "choose"; n: number }
  /** Saved immediately — no text needed. */
  | { kind: "mark"; annotation: "delete" | "approve" }
  | { kind: "remove" }
  | { kind: "jump"; delta: 1 | -1 }
  | { kind: "send" }
  | { kind: "edit" }
  | { kind: "outline" }
  | { kind: "decide" }
  | { kind: "lens" }
  | { kind: "hint" };

export interface KeyLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

const KEYS: Record<string, ReviewAction> = {
  j: { kind: "move", delta: 1 },
  ArrowDown: { kind: "move", delta: 1 },
  k: { kind: "move", delta: -1 },
  ArrowUp: { kind: "move", delta: -1 },
  c: { kind: "annotate", annotation: "comment" },
  r: { kind: "annotate", annotation: "replace" },
  s: { kind: "annotate", annotation: "replace", scope: "sentence" },
  w: { kind: "annotate", annotation: "replace", scope: "section" },
  d: { kind: "mark", annotation: "delete" },
  a: { kind: "mark", annotation: "approve" },
  x: { kind: "remove" },
  n: { kind: "jump", delta: 1 },
  p: { kind: "jump", delta: -1 },
  Enter: { kind: "send" },
  e: { kind: "edit" },
  o: { kind: "outline" },
  m: { kind: "decide" },
  l: { kind: "lens" },
  "?": { kind: "hint" },
};

/**
 * The action a key press means in review mode, or null to let it through.
 * Modified keys are never review actions: ⌘S, ⌘O, and shift+arrow text
 * selection keep working. While the inline entry is open the field owns
 * the keyboard.
 */
export function reviewKeyAction(e: KeyLike, ctx: { entryOpen: boolean }): ReviewAction | null {
  if (ctx.entryOpen) return null;
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  // "?" arrives with shift held; every other shifted key is left alone.
  if (e.shiftKey && e.key !== "?") return null;
  if (/^[1-9]$/.test(e.key)) return { kind: "choose", n: Number(e.key) };
  const action = KEYS[e.key];
  return action ? { ...action } : null;
}

/** Enter sends this: changes if anything asks for a change, else approval. */
export function verdictFor(annotations: { kind: AnnotationKind }[]): Verdict {
  return annotations.some((a) => isChangeRequest(a.kind)) ? "changes" : "approved";
}

export interface HintItem {
  keys: string;
  label: string;
  /** What clicking the legend entry runs; null for a plain note. */
  action: ReviewAction | null;
}

/** The review bar's key legend, one entry per action so the bar can show
 *  each as a button as well as a key. */
export function hintItems(waiting: boolean): HintItem[] {
  const items: HintItem[] = [
    { keys: "j/k", label: "move", action: { kind: "move", delta: 1 } },
    { keys: "c", label: "comment", action: { kind: "annotate", annotation: "comment" } },
    { keys: "r", label: "replace", action: { kind: "annotate", annotation: "replace" } },
    { keys: "s", label: "sentence", action: { kind: "annotate", annotation: "replace", scope: "sentence" } },
    { keys: "w", label: "section", action: { kind: "annotate", annotation: "replace", scope: "section" } },
    { keys: "d", label: "delete", action: { kind: "mark", annotation: "delete" } },
    { keys: "a", label: "looks good", action: { kind: "mark", annotation: "approve" } },
    { keys: "x", label: "remove", action: { kind: "remove" } },
    { keys: "n/p", label: "next", action: { kind: "jump", delta: 1 } },
    { keys: "o", label: "outline", action: { kind: "outline" } },
    { keys: "l", label: "lens", action: { kind: "lens" } },
    { keys: "m", label: "decide", action: { kind: "decide" } },
    { keys: "e", label: "edit", action: { kind: "edit" } },
  ];
  items.push(waiting ? { keys: "⏎", label: "send", action: { kind: "send" } } : { keys: "", label: "no review waiting", action: null });
  return items;
}

/** The legend as one line of text. */
export function hintText(waiting: boolean): string {
  return hintItems(waiting)
    .map((i) => (i.keys ? `${i.keys} ${i.label}` : i.label))
    .join(" · ");
}
