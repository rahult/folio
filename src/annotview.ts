/**
 * Review annotations rendered into the document: comments get a dotted
 * accent underline, deletions a strikethrough, replacements a strikethrough
 * plus an inline ghost of the suggested text. Quotes are matched to
 * ProseMirror ranges by plain-text search (first occurrence) so annotations
 * survive document reloads and edits without storing fragile positions.
 */

import { $prose } from "@milkdown/kit/utils";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/kit/prose/view";
import type { Annotation } from "./annotations";
import { docSegments, pmPosAt } from "./diffview";

export const annotationKey = new PluginKey<DecorationSet>("FOLIO_ANNOTATIONS");

/** The ProseMirror plugin holding annotation decorations. Unlike the diff
 *  view, annotations map through user edits and only change via meta. */
export const annotationPlugin = $prose(
  () =>
    new Plugin<DecorationSet>({
      key: annotationKey,
      state: {
        init: () => DecorationSet.empty,
        apply(tr, set) {
          const meta = tr.getMeta(annotationKey) as DecorationSet | undefined;
          if (meta) return meta;
          return set.map(tr.mapping, tr.doc);
        },
      },
      props: {
        decorations(state) {
          return annotationKey.getState(state);
        },
      },
    }),
);

/** First plain-text occurrence of `quote` → ProseMirror range. Quotes are
 *  captured from the rendered text (same separators docSegments produces),
 *  so an exact search maps back cleanly. */
function findQuote(
  view: EditorView,
  segments: ReturnType<typeof docSegments>["segments"],
  docText: string,
  quote: string,
): { from: number; to: number } | null {
  if (!quote.trim()) return null;
  const offset = docText.indexOf(quote);
  if (offset === -1) return null;
  const docSize = view.state.doc.content.size;
  const from = pmPosAt(segments, offset, docSize);
  const to = pmPosAt(segments, offset + quote.length, docSize);
  return to > from ? { from, to } : null;
}

/** Render the current annotation list as decorations (replacing previous). */
export function renderAnnotations(view: EditorView, annotations: Annotation[]): void {
  const { text, segments } = docSegments(view);
  const decorations: Decoration[] = [];
  let ghostIndex = 0;
  for (const annotation of annotations) {
    const range = findQuote(view, segments, text, annotation.quote);
    if (!range) continue; // quote vanished in a rewrite — feedback keeps it
    if (annotation.kind === "comment") {
      decorations.push(Decoration.inline(range.from, range.to, { class: "annot-comment" }));
    } else {
      decorations.push(Decoration.inline(range.from, range.to, { class: "annot-delete" }));
      if (annotation.kind === "replace" && annotation.body.trim()) {
        const body = annotation.body;
        decorations.push(
          Decoration.widget(
            range.to,
            () => {
              const ghost = document.createElement("span");
              ghost.className = "annot-replace";
              ghost.textContent = body;
              return ghost;
            },
            { side: 1, key: `annot-replace-${ghostIndex++}` },
          ),
        );
      }
    }
  }
  view.dispatch(
    view.state.tr.setMeta(annotationKey, DecorationSet.create(view.state.doc, decorations)),
  );
}
