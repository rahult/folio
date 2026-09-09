import "@fontsource-variable/instrument-sans";
import "@fontsource-variable/newsreader";
import "@fontsource-variable/jetbrains-mono";
import { MarkdownEditor } from "../src/editor";
import { buildHtmlDocument } from "../src/export";
import exportCss from "../src/export.css?raw";
import { collectExportFonts, highlightWithLezer, renderMermaidSvg } from "../src/exporthooks";
import { renderExportHtml } from "../src/exportrender";

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

| Feature        | Shortcut |
| -------------- | -------- |
| Source mode    | ⌘/       |
| Export         | ⌘E       |
| Focus mode     | ⌥⌘F      |
| Typewriter     | ⌥⌘Y      |

\`\`\`rust
fn main() {
    println!("calm software, small footprint");
}
\`\`\`

Press the **Preview** tab above to see this document as an exported page.
`;

const editorRoot = document.querySelector<HTMLElement>("#demo-editor")!;
const previewFrame = document.querySelector<HTMLIFrameElement>("#demo-preview")!;
const writeTab = document.querySelector<HTMLButtonElement>("#tab-write")!;
const previewTab = document.querySelector<HTMLButtonElement>("#tab-preview")!;

const editor = new MarkdownEditor(editorRoot, () => {});
const editorReady = editor.create(SAMPLE_MARKDOWN);

async function activate(view: "write" | "preview"): Promise<void> {
  const isWrite = view === "write";
  writeTab.classList.toggle("active", isWrite);
  previewTab.classList.toggle("active", !isWrite);
  writeTab.setAttribute("aria-selected", String(isWrite));
  previewTab.setAttribute("aria-selected", String(!isWrite));
  editorRoot.hidden = !isWrite;
  previewFrame.hidden = isWrite;
  if (!isWrite) {
    // Flipping to the preview before the editor finished creating would
    // export an empty page — wait for the initial create() to settle.
    await editorReady;
    // Re-render on every switch so the preview always reflects the draft —
    // the same pipeline the app's File → Export uses (no local images here).
    const [body, fonts] = await Promise.all([
      renderExportHtml(editor.getMarkdown(), {
        highlight: highlightWithLezer,
        mermaid: renderMermaidSvg,
        image: async () => null,
      }),
      collectExportFonts(),
    ]);
    previewFrame.srcdoc = buildHtmlDocument("Folio — preview", body, `${fonts}\n${exportCss}`);
  }
}

writeTab.addEventListener("click", () => void activate("write"));
previewTab.addEventListener("click", () => void activate("preview"));

// ——— opt-in analytics (GA4; nothing loads before consent) ———
const SITE_GA_ID = "G-94QD9WH44J";
const GA_KEY = "folio-telemetry";

const gaConsent = document.querySelector<HTMLElement>("#ga-consent")!;
const gaAccept = document.querySelector<HTMLButtonElement>("#ga-accept")!;
const gaDecline = document.querySelector<HTMLButtonElement>("#ga-decline")!;

function loadSiteAnalytics(): void {
  if (SITE_GA_ID === "G-XXXXXXXXXX") return; // not configured yet
  const w = window as unknown as { dataLayer?: unknown[]; gtag?: (...a: unknown[]) => void };
  w.dataLayer = w.dataLayer ?? [];
  w.gtag = (...args: unknown[]) => {
    w.dataLayer!.push(args);
  };
  w.gtag("js", new Date());
  w.gtag("config", SITE_GA_ID, { anonymize_ip: true });
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${SITE_GA_ID}`;
  document.head.appendChild(script);
}

const gaChoice = localStorage.getItem(GA_KEY);
if (gaChoice === "on") {
  loadSiteAnalytics();
} else if (gaChoice === null) {
  gaConsent.hidden = false;
}

gaAccept.addEventListener("click", () => {
  localStorage.setItem(GA_KEY, "on");
  gaConsent.hidden = true;
  loadSiteAnalytics();
});

gaDecline.addEventListener("click", () => {
  localStorage.setItem(GA_KEY, "off");
  gaConsent.hidden = true;
});
