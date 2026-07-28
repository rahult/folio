/**
 * Rewrite diff view: after a watched file reloads, additions are highlighted
 * and removed words shown as struck-through ghosts via ProseMirror
 * decorations (never by mutating the document). Decorations clear on the
 * next user edit.
 */

import { $prose } from "@milkdown/kit/utils";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/kit/prose/view";
import { diffWords } from "./diff";

export const diffViewKey = new PluginKey<DecorationSet>("FOLIO_DIFF_VIEW");

/** The ProseMirror plugin holding the current diff decorations. Registered
 *  once per editor instance in src/editor.ts. */
export const diffViewPlugin = $prose(
  () =>
    new Plugin<DecorationSet>({
      key: diffViewKey,
      state: {
        init: () => DecorationSet.empty,
        apply(tr, set) {
          const meta = tr.getMeta(diffViewKey) as DecorationSet | undefined;
          if (meta) return meta;
          // Any real edit ends the review highlight.
          if (tr.docChanged) return DecorationSet.empty;
          return set.map(tr.mapping, tr.doc);
        },
      },
      props: {
        decorations(state) {
          return diffViewKey.getState(state);
        },
      },
    }),
);

/** A text node of the rendered document, mapped between plain-text offsets
 *  (what the diff sees) and ProseMirror positions (what decorations need). */
interface TextSegment {
  textStart: number;
  pmFrom: number;
  text: string;
}

/** Plain text of the document plus the per-text-node mapping. Block
 *  boundaries become "\n" (consuming no ProseMirror position) so additions
 *  spanning blocks still map cleanly. */
function docSegments(view: EditorView): { text: string; segments: TextSegment[] } {
  const segments: TextSegment[] = [];
  let text = "";
  view.state.doc.descendants((node, pos) => {
    if (node.isText) {
      segments.push({ textStart: text.length, pmFrom: pos, text: node.text ?? "" });
      text += node.text;
    } else if (node.isBlock && text.length > 0 && !text.endsWith("\n")) {
      text += "\n";
    }
    return true;
  });
  return { text, segments };
}

/** Plain-text offset → ProseMirror position (clamped). */
function pmPosAt(segments: TextSegment[], textOffset: number, docSize: number): number {
  for (const seg of segments) {
    if (textOffset <= seg.textStart + seg.text.length) {
      return Math.min(seg.pmFrom + Math.max(0, textOffset - seg.textStart), docSize);
    }
  }
  return docSize;
}

/** Plain text of the current document, for diffing against the next
 *  version. */
export function renderedText(view: EditorView): string {
  return docSegments(view).text;
}

/** Diff the previously rendered text against the current document and show
 *  the result as decorations. No-op when there is nothing to compare. */
export function showReloadDiff(view: EditorView, oldText: string): void {
  if (!oldText) return;
  const { text: newText, segments } = docSegments(view);
  if (newText === oldText) return;
  const docSize = view.state.doc.content.size;
  const decorations: Decoration[] = [];
  let offset = 0;
  let ghostIndex = 0;
  for (const op of diffWords(oldText, newText)) {
    if (op.kind === "add") {
      const from = pmPosAt(segments, offset, docSize);
      const to = pmPosAt(segments, offset + op.text.length, docSize);
      if (to > from && op.text.trim()) {
        decorations.push(Decoration.inline(from, to, { class: "diff-add" }));
      }
      offset += op.text.length;
    } else if (op.kind === "remove") {
      if (op.text.trim()) {
        const pos = pmPosAt(segments, offset, docSize);
        const removed = op.text.replace(/\s+/g, " ").trim();
        decorations.push(
          Decoration.widget(
            pos,
            () => {
              const ghost = document.createElement("span");
              ghost.className = "diff-del";
              ghost.textContent = removed;
              return ghost;
            },
            { side: -1, key: `diff-del-${ghostIndex++}` },
          ),
        );
      }
    } else {
      offset += op.text.length;
    }
  }
  if (decorations.length === 0) return;
  view.dispatch(
    view.state.tr.setMeta(diffViewKey, DecorationSet.create(view.state.doc, decorations)),
  );
}
