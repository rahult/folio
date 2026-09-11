import { describe, expect, it } from "vitest";
import { renderExportHtml, type ExportHooks } from "../src/exportrender";

/** Hooks that decline everything: plain code, no diagrams, images kept. */
const NONE: ExportHooks = {
  highlight: async () => null,
  mermaid: async () => null,
  image: async () => null,
};

describe("renderExportHtml", () => {
  it("renders CommonMark prose", async () => {
    const html = await renderExportHtml("# Title\n\nSome *em* and **strong** [link](https://x.y).\n", NONE);
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<em>em</em>");
    expect(html).toContain("<strong>strong</strong>");
    expect(html).toContain('<a href="https://x.y">link</a>');
  });

  it("renders GFM tables with alignment, task lists, and strikethrough", async () => {
    const md = "| a | b |\n| :-- | --: |\n| 1 | 2 |\n\n- [x] done\n- [ ] todo\n\n~~gone~~\n";
    const html = await renderExportHtml(md, NONE);
    expect(html).toContain('<th align="left">a</th>');
    expect(html).toContain('<td align="right">2</td>');
    expect(html).toContain('<input type="checkbox" checked disabled>');
    expect(html).toContain('<input type="checkbox" disabled>');
    expect(html).toContain("<del>gone</del>");
  });

  it("emits plain escaped code when no highlighter applies", async () => {
    const html = await renderExportHtml("```js\nif (a < b) {}\n```\n", NONE);
    expect(html).toContain('<pre class="code" data-lang="js"><code>if (a &#x3C; b) {}</code></pre>');
  });

  it("uses the highlighter's markup when it returns some", async () => {
    const hooks = { ...NONE, highlight: async (code: string, lang: string) => `<span class="tok-${lang}">${code.trim()}</span>` };
    const html = await renderExportHtml("```rust\nfn main() {}\n```\n", hooks);
    expect(html).toContain('<pre class="code" data-lang="rust"><code><span class="tok-rust">fn main() {}</span></code></pre>');
  });

  it("renders mermaid blocks as figures and falls back to code on failure", async () => {
    const md = "```mermaid\ngraph TD; A-->B;\n```\n";
    const ok = await renderExportHtml(md, { ...NONE, mermaid: async () => "<svg><g/></svg>" });
    expect(ok).toContain('<figure class="mermaid"><svg><g/></svg></figure>');
    const fallback = await renderExportHtml(md, NONE);
    expect(fallback).toContain('<pre class="code" data-lang="mermaid"><code>graph TD; A--&#x3E;B;</code></pre>');
  });

  it("embeds images when the hook resolves them and keeps the src otherwise", async () => {
    const hooks = { ...NONE, image: async (src: string) => (src === "a.png" ? "data:image/png;base64,AA==" : null) };
    const html = await renderExportHtml("![alt](a.png)\n\n![r](https://x.y/b.png)\n", hooks);
    expect(html).toContain('<img src="data:image/png;base64,AA==" alt="alt">');
    expect(html).toContain('<img src="https://x.y/b.png" alt="r">');
  });

  it("passes raw HTML through", async () => {
    const html = await renderExportHtml("<div class=\"note\">hi</div>\n\ntext <kbd>⌘K</kbd>\n", NONE);
    expect(html).toContain('<div class="note">hi</div>');
    expect(html).toContain("<kbd>⌘K</kbd>");
  });

  it("degrades to the fallback when a hook throws", async () => {
    const hooks: ExportHooks = {
      highlight: async () => { throw new Error("boom"); },
      mermaid: async () => { throw new Error("boom"); },
      image: async () => { throw new Error("boom"); },
    };
    const html = await renderExportHtml("```js\nx\n```\n\n```mermaid\ng\n```\n\n![a](a.png)\n", hooks);
    expect(html).toContain('<pre class="code" data-lang="js"><code>x</code></pre>');
    expect(html).toContain('<pre class="code" data-lang="mermaid"><code>g</code></pre>');
    expect(html).toContain('<img src="a.png" alt="a">');
  });
});

import { renderMarkdownSafe } from "../src/exportrender";

describe("renderMarkdownSafe", () => {
  it("renders Markdown but drops raw HTML", async () => {
    const html = await renderMarkdownSafe("## A\n\n- one <script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n");
    expect(html).toContain("<h2>A</h2>");
    expect(html).toContain("<li>one");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("onerror");
  });
});
