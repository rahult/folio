/**
 * Wikilinks in the rendered page: `[[target]]` is plain text to Markdown,
 * so it is dressed as a link with decorations (never by changing the
 * document). Rebuilt on every document change from the text nodes.
 */

import { $prose } from "@milkdown/kit/utils";
import type { Node } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import { findWikilinks } from "./wikilink";

export const wikiKey = new PluginKey<DecorationSet>("FOLIO_WIKILINKS");

function build(doc: Node): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return true;
    for (const span of findWikilinks(node.text)) {
      decorations.push(
        Decoration.inline(pos + span.start, pos + span.end, {
          class: "wikilink",
          "data-wikilink": span.raw,
        }),
      );
    }
    return true;
  });
  return DecorationSet.create(doc, decorations);
}

export const wikiViewPlugin = $prose(
  () =>
    new Plugin<DecorationSet>({
      key: wikiKey,
      state: {
        init: (_, state) => build(state.doc),
        apply(tr, set) {
          return tr.docChanged ? build(tr.doc) : set;
        },
      },
      props: {
        decorations(state) {
          return wikiKey.getState(state);
        },
      },
    }),
);
