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
  /** Opens the inline entry field; the annotation is saved on Enter. */
  | { kind: "annotate"; annotation: "comment" | "replace" }
  /** Saved immediately — no text needed. */
  | { kind: "mark"; annotation: "delete" | "approve" }
  | { kind: "remove" }
  | { kind: "jump"; delta: 1 | -1 }
  | { kind: "send" }
  | { kind: "edit" }
  | { kind: "outline" }
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
  d: { kind: "mark", annotation: "delete" },
  a: { kind: "mark", annotation: "approve" },
  x: { kind: "remove" },
  n: { kind: "jump", delta: 1 },
  p: { kind: "jump", delta: -1 },
  Enter: { kind: "send" },
  e: { kind: "edit" },
  o: { kind: "outline" },
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
  const action = KEYS[e.key];
  return action ? { ...action } : null;
}

/** Enter sends this: changes if anything asks for a change, else approval. */
export function verdictFor(annotations: { kind: AnnotationKind }[]): Verdict {
  return annotations.some((a) => isChangeRequest(a.kind)) ? "changes" : "approved";
}

/** The review bar's key legend. */
export function hintText(waiting: boolean): string {
  const keys =
    "j/k move · c comment · r replace · d delete · a looks good · x remove · n/p next · o outline · e edit";
  return waiting ? `${keys} · ⏎ send` : `${keys} · no review waiting`;
}
