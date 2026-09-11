/**
 * Export rendering: Markdown → standalone HTML body, independent of the
 * editor. The editor DOM is an editing surface (lazily mounted code
 * blocks, gutters, contenteditable), so exporting by cloning it produced
 * whatever happened to be on screen. This pipeline is deterministic: the
 * same Markdown always yields the same HTML.
 *
 * Everything that needs a browser (syntax highlighting, mermaid, reading
 * image files) comes in through `ExportHooks`, so the structure is
 * unit-testable in Node. See docs/superpowers/specs/2026-09-10-export-pipeline-design.md.
 */

import type { Code, Image, Root } from "mdast";
import type { Element } from "hast";
import type { Raw, State } from "mdast-util-to-hast";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype, { defaultHandlers } from "remark-rehype";
import { unified } from "unified";
import { escapeHtml } from "./export";

export interface ExportHooks {
  /** Highlighted HTML for a fenced block (spans with tok-* classes), or
   *  null to emit plain escaped code. */
  highlight(code: string, language: string): Promise<string | null>;
  /** SVG markup for a mermaid block, or null to fall back to code. */
  mermaid(code: string): Promise<string | null>;
  /** Replacement src for an image (a data URI), or null to keep it. */
  image(src: string): Promise<string | null>;
}

const parser = unified().use(remarkParse).use(remarkGfm);

/** Render Markdown to the HTML that goes inside the export's <main>. */
export async function renderExportHtml(markdown: string, hooks: ExportHooks): Promise<string> {
  const tree = parser.parse(markdown) as Root;
  const rendered = await prerender(tree, hooks);

  const processor = unified()
    .use(remarkRehype, {
      allowDangerousHtml: true,
      handlers: {
        code: (_state, node: Code): Raw => ({ type: "raw", value: rendered.get(node) ?? "" }),
        image: (state: State, node: Image): Element => {
          const el = defaultHandlers.image(state, node);
          const src = rendered.get(node);
          if (src !== undefined) el.properties.src = src;
          return el;
        },
      },
    })
    .use(rehypeStringify, { allowDangerousHtml: true });

  const hast = await processor.run(tree);
  return processor.stringify(hast);
}

/** Await every browser-dependent piece up front: code blocks become
 *  finished HTML strings, images map to their replacement src. */
async function prerender(tree: Root, hooks: ExportHooks): Promise<Map<Code | Image, string>> {
  const out = new Map<Code | Image, string>();
  const jobs: Promise<void>[] = [];
  walk(tree, (node) => {
    if (node.type === "code") {
      jobs.push(renderCode(node as Code, hooks).then((html) => void out.set(node as Code, html)));
    } else if (node.type === "image") {
      const image = node as Image;
      jobs.push(
        settle(hooks.image(image.url)).then((src) => {
          if (src !== null) out.set(image, src);
        }),
      );
    }
  });
  await Promise.all(jobs);
  return out;
}

async function renderCode(node: Code, hooks: ExportHooks): Promise<string> {
  const lang = node.lang ?? "";
  if (lang === "mermaid") {
    const svg = await settle(hooks.mermaid(node.value));
    if (svg !== null) return `<figure class="mermaid">${svg}</figure>`;
  }
  const highlighted = lang ? await settle(hooks.highlight(node.value, lang)) : null;
  const body = highlighted ?? escapeCode(node.value);
  const attr = lang ? ` data-lang="${escapeHtml(lang)}"` : "";
  return `<pre class="code"${attr}><code>${body}</code></pre>`;
}

/** Escape code text the way rehype-stringify escapes text nodes, so the
 *  output is uniform whichever path produced it. */
function escapeCode(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&#x3C;").replace(/>/g, "&#x3E;");
}

/** A hook that throws counts as declining. */
async function settle<T>(promise: Promise<T | null>): Promise<T | null> {
  try {
    return await promise;
  } catch {
    return null;
  }
}

function walk(node: { type: string; children?: unknown[] }, visit: (n: { type: string }) => void): void {
  visit(node);
  for (const child of node.children ?? []) walk(child as { type: string; children?: unknown[] }, visit);
}

/** rehype-sanitize's default schema (GitHub's), minus images: a model's
 *  output must not be able to load remote resources from the page. */
const SAFE_SCHEMA = {
  ...defaultSchema,
  tagNames: (defaultSchema.tagNames ?? []).filter((tag) => tag !== "img"),
};

/**
 * Markdown from an untrusted source (a model's output) to HTML: raw HTML
 * is dropped, link protocols are limited to http(s)/mailto, images are
 * removed, and only GitHub's safe element and attribute set survives.
 */
export async function renderMarkdownSafe(markdown: string): Promise<string> {
  const tree = parser.parse(markdown) as Root;
  const processor = unified().use(remarkRehype).use(rehypeSanitize, SAFE_SCHEMA).use(rehypeStringify);
  const hast = await processor.run(tree);
  return processor.stringify(hast);
}
