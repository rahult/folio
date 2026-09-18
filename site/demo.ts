import "@fontsource-variable/instrument-sans";
import "@fontsource-variable/newsreader";
import "@fontsource-variable/jetbrains-mono";
import { MarkdownEditor } from "../src/editor";
import { buildHtmlDocument } from "../src/export";
import exportCss from "../src/export.css?raw";
import { collectExportFonts, highlightWithLezer, renderMermaidSvg } from "../src/exporthooks";
import { renderExportHtml } from "../src/exportrender";

const SAMPLE_MARKDOWN = `# Write, and watch it render

Folio renders Markdown **inline as you type**. There is no preview pane to
glance at and no toolbar to reach for: make this sentence *italic*, turn the
next line into a heading with \`#\`, or press ⌘/ to see the source.

## Everything you expect

- Headings, emphasis, links, and inline \`code\`
- Ordered and unordered lists (press Enter below to add one)
- Tables with draggable columns, blockquotes, images

- [x] Task lists that round-trip to \`- [x]\`
- [ ] A checkbox you can tick

> The text is the interface. Everything else steps out of the way.

## A table

| Feature        | Shortcut |
| -------------- | -------- |
| Source mode    | ⌘/       |
| Export         | ⌘E       |
| Focus mode     | ⌥⌘F      |
| Annotate       | ⌥⌘A      |

## Code and diagrams

\`\`\`rust
fn main() {
    println!("calm software, small footprint");
}
\`\`\`

\`\`\`mermaid
graph LR
  Agent -- writes --> plan.md
  plan.md -- reviewed in --> Folio
  Folio -- verdict --> Agent
\`\`\`

Switch to **Exported page** above to see this document the way File → Export
writes it.
`;

const editorRoot = document.querySelector<HTMLElement>("#demo-editor")!;
const previewFrame = document.querySelector<HTMLIFrameElement>("#demo-preview")!;
const writeTab = document.querySelector<HTMLButtonElement>("#tab-write")!;
const previewTab = document.querySelector<HTMLButtonElement>("#tab-preview")!;

const editor = new MarkdownEditor(editorRoot, () => {});
// The frame ships with a static pre-render of the same document (for
// file:// and pre-JS viewing). create() wipes that markup; only after the
// live editor is up do we drop the fallback class and its prose styling.
const editorReady = editor
  .create(SAMPLE_MARKDOWN)
  .then(() => editorRoot.classList.remove("demo-fallback"));

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
  // Ask only once the visitor has engaged: first scroll, or 20 seconds
  // if they never scroll. Nothing tracks before the choice either way.
  const ask = () => {
    gaConsent.hidden = false;
    window.removeEventListener("scroll", onScroll, { capture: true });
    clearTimeout(fallback);
  };
  const onScroll = () => ask();
  const fallback = setTimeout(ask, 20_000);
  window.addEventListener("scroll", onScroll, { passive: true, capture: true });
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

// ——— feedback attribution ———
//
// The app's Feedback button lands here with ?utm_source=app. Count which
// channel people pick (and where they came from) for consented visitors
// only; the links themselves work identically without analytics.
const utmSource = new URLSearchParams(location.search).get("utm_source") ?? "site";
for (const el of document.querySelectorAll<HTMLAnchorElement>("[data-feedback-channel]")) {
  el.addEventListener("click", () => {
    const w = window as unknown as { gtag?: (...args: unknown[]) => void };
    w.gtag?.("event", "feedback_click", {
      channel: el.dataset.feedbackChannel ?? "unknown",
      source: utmSource,
    });
  });
}
