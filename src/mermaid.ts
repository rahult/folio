/**
 * Mermaid diagrams in code blocks: Crepe's code block calls
 * `renderPreview(language, content, applyPreview)`; for `mermaid` blocks we
 * render the diagram asynchronously into the built-in preview panel, whose
 * Edit/Hide toggle is the click-to-edit surface. Mermaid is lazy-loaded
 * (dynamic import) so the main bundle stays small.
 */

import type mermaid from "mermaid";

type MermaidConfig = Parameters<typeof mermaid.initialize>[0];

/** Paper-palette theme so diagrams read as part of the document. */
const MERMAID_CONFIG: MermaidConfig = {
  startOnLoad: false,
  securityLevel: "strict",
  theme: "base",
  fontFamily: '"Newsreader Variable", Georgia, serif',
  themeVariables: {
    background: "#faf7f0",
    primaryColor: "#f2ecdf",
    primaryTextColor: "#3d362c",
    primaryBorderColor: "#b7ab93",
    lineColor: "#7d7261",
    secondaryColor: "#ece4d2",
    tertiaryColor: "#f7f2e6",
    noteBkgColor: "#efe7d4",
    noteTextColor: "#3d362c",
  },
};

type Mermaid = typeof import("mermaid")["default"];

let mermaidPromise: Promise<Mermaid> | null = null;
let renderSeq = 0;

function loadMermaid(): Promise<Mermaid> {
  mermaidPromise ??= import("mermaid").then((module) => {
    module.default.initialize(MERMAID_CONFIG);
    return module.default;
  });
  return mermaidPromise;
}

/** Render mermaid source to a detached element (null on parse errors —
 *  the code editor stays visible while the diagram is incomplete). */
export async function renderMermaidDiagram(code: string): Promise<HTMLElement | null> {
  if (!code.trim()) return null;
  try {
    const mermaid = await loadMermaid();
    const { svg } = await mermaid.render(`folio-mermaid-${renderSeq++}`, code);
    const el = document.createElement("div");
    el.className = "mermaid-diagram";
    el.innerHTML = svg;
    return el;
  } catch {
    return null;
  }
}

type ApplyPreview = (value: null | string | HTMLElement) => void;

/** Crepe code-block `renderPreview`: diagrams for mermaid, nothing
 *  (fall back to plain code) for every other language. */
export function mermaidRenderPreview(
  language: string,
  content: string,
  applyPreview: ApplyPreview,
): void | null {
  if (language !== "mermaid") return null;
  void renderMermaidDiagram(content).then(applyPreview);
  return undefined; // async — applyPreview delivers the element
}
