/**
 * Authorship tints: inline decorations over the words an agent wrote
 * (`external`) and the words it rewrote after a change request
 * (`revision`). The reviewer's own words carry no tint. Spans come from
 * src/provenance.ts; this maps them onto ProseMirror positions the same
 * way the reload diff does. Decorations survive edits (they map through
 * transactions) and are recomputed by main.ts after typing settles.
 */

import { $prose } from "@milkdown/kit/utils";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/kit/prose/view";
import { docSegments, pmPosAt } from "./diffview";
import type { Attributed } from "./provenance";

export const provKey = new PluginKey<DecorationSet>("FOLIO_PROVENANCE");

export const provViewPlugin = $prose(
  () =>
    new Plugin<DecorationSet>({
      key: provKey,
      state: {
        init: () => DecorationSet.empty,
        apply(tr, set) {
          const meta = tr.getMeta(provKey) as DecorationSet | undefined;
          if (meta) return meta;
          return set.map(tr.mapping, tr.doc);
        },
      },
      props: {
        decorations(state) {
          return provKey.getState(state);
        },
      },
    }),
);

const CLASS: Partial<Record<Attributed["origin"], string>> = {
  external: "prov-external",
  revision: "prov-revision",
};

/** Paint `spans` (which concatenate to the document's rendered text). */
export function setProvenance(view: EditorView, spans: Attributed[]): void {
  const { segments } = docSegments(view);
  const docSize = view.state.doc.content.size;
  const decorations: Decoration[] = [];
  let offset = 0;
  for (const span of spans) {
    const cls = CLASS[span.origin];
    if (cls && span.text.trim()) {
      const from = pmPosAt(segments, offset, docSize);
      const to = pmPosAt(segments, offset + span.text.length, docSize);
      if (to > from) decorations.push(Decoration.inline(from, to, { class: cls }));
    }
    offset += span.text.length;
  }
  view.dispatch(view.state.tr.setMeta(provKey, DecorationSet.create(view.state.doc, decorations)));
}

export function clearProvenance(view: EditorView): void {
  if (provKey.getState(view.state) !== DecorationSet.empty) {
    view.dispatch(view.state.tr.setMeta(provKey, DecorationSet.empty));
  }
}
