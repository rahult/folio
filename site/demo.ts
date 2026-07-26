import "@fontsource-variable/instrument-sans";
import "@fontsource-variable/newsreader";
import "@fontsource-variable/jetbrains-mono";
import { MarkdownEditor } from "../src/editor";
import { buildHtmlDocument } from "../src/export";

const SAMPLE_MARKDOWN = `# Write, and watch it render

Folio renders Markdown **inline as you type** — no split panes, no preview
toggle, no clutter. Try it: make this sentence *italic*, or turn the next
line into a heading.

## Everything you expect

- Headings, emphasis, and inline \`code\`
- Ordered and unordered lists (try pressing Enter below)
- Tables, blockquotes, links, and images

> The text is the interface. Everything else steps out of the way.

## A table, rendered live

| Feature        | Free | Pro |
| -------------- | ---- | --- |
| Full editor    | ✓    | ✓   |
| Source mode    | ✓    | ✓   |
| Export & PDF   |      | ✓   |
| Focus mode     |      | ✓   |

\`\`\`rust
fn main() {
    println!("calm software, small footprint");
}
\`\`\`

Press the **Preview** tab above to see this document as an exported page.
`;

/** Minimal prose styling for the standalone preview document. The iframe is
 *  sandboxed, so the preview carries its own tiny stylesheet instead of the
 *  site's. */
const PREVIEW_CSS = `
body {
  margin: 0;
  padding: 2.5rem 1.5rem;
  background: oklch(0.981 0.007 88);
  color: oklch(0.295 0.014 72);
  font-family: "Newsreader Variable", Georgia, serif;
  font-size: 17px;
  line-height: 1.65;
}
main { max-width: 42rem; margin: 0 auto; }
h1, h2, h3 { line-height: 1.25; margin: 1.6em 0 0.4em; }
h1 { font-size: 1.9em; } h2 { font-size: 1.45em; } h3 { font-size: 1.2em; }
p { margin: 0.7em 0; }
a { color: oklch(0.47 0.105 33); }
code {
  font-family: "JetBrains Mono Variable", ui-monospace, monospace;
  font-size: 0.85em;
  background: oklch(0.961 0.009 88);
  padding: 0.1em 0.35em;
  border-radius: 4px;
}
pre {
  background: oklch(0.961 0.009 88);
  padding: 1em 1.2em;
  border-radius: 8px;
  overflow-x: auto;
}
pre code { background: none; padding: 0; }
blockquote {
  margin: 1em 0;
  padding: 0.1em 0 0.1em 1em;
  border-left: 3px solid oklch(0.47 0.105 33);
  color: oklch(0.46 0.013 72);
}
table { border-collapse: collapse; margin: 1em 0; }
th, td {
  border: 1px solid oklch(0.913 0.008 85);
  padding: 0.4em 0.8em;
  text-align: left;
}
th { background: oklch(0.961 0.009 88); }
hr { border: none; border-top: 1px solid oklch(0.913 0.008 85); margin: 2em 0; }
`;

const editorRoot = document.querySelector<HTMLElement>("#demo-editor")!;
const previewFrame = document.querySelector<HTMLIFrameElement>("#demo-preview")!;
const writeTab = document.querySelector<HTMLButtonElement>("#tab-write")!;
const previewTab = document.querySelector<HTMLButtonElement>("#tab-preview")!;

const editor = new MarkdownEditor(editorRoot, () => {});
void editor.create(SAMPLE_MARKDOWN);

function activate(view: "write" | "preview"): void {
  const isWrite = view === "write";
  writeTab.classList.toggle("active", isWrite);
  previewTab.classList.toggle("active", !isWrite);
  writeTab.setAttribute("aria-selected", String(isWrite));
  previewTab.setAttribute("aria-selected", String(!isWrite));
  editorRoot.hidden = !isWrite;
  previewFrame.hidden = isWrite;
  if (!isWrite) {
    // Re-render on every switch so the preview always reflects the draft.
    previewFrame.srcdoc = buildHtmlDocument(
      "Folio — preview",
      editor.exportHtml(),
      PREVIEW_CSS,
    );
  }
}

writeTab.addEventListener("click", () => activate("write"));
previewTab.addEventListener("click", () => activate("preview"));
