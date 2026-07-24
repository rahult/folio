import { describe, expect, it } from "vitest";
import { buildHtmlDocument, escapeHtml, htmlExportTarget } from "../src/export";

describe("htmlExportTarget", () => {
  it("defaults to untitled.html for an unsaved document", () => {
    expect(htmlExportTarget(null)).toBe("untitled.html");
  });

  it("swaps markdown extensions for .html", () => {
    expect(htmlExportTarget("/Users/writer/notes.md")).toBe("/Users/writer/notes.html");
    expect(htmlExportTarget("/tmp/draft.markdown")).toBe("/tmp/draft.html");
    expect(htmlExportTarget("a/b/c.MD")).toBe("a/b/c.html");
  });

  it("appends .html when the file has another extension", () => {
    expect(htmlExportTarget("/tmp/notes.txt")).toBe("/tmp/notes.txt.html");
  });
});

describe("escapeHtml", () => {
  it("escapes markup-significant characters", () => {
    expect(escapeHtml(`a<b>&"c"`)).toBe("a&lt;b&gt;&amp;&quot;c&quot;");
  });
});

describe("buildHtmlDocument", () => {
  it("wraps content and CSS in a standalone document", () => {
    const html = buildHtmlDocument("notes.md", "<p>Hello</p>", "body { color: red; }");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("<title>notes.md</title>");
    expect(html).toContain("body { color: red; }");
    expect(html).toContain('<main id="editor"><p>Hello</p></main>');
  });

  it("escapes the title", () => {
    const html = buildHtmlDocument(`<script>`, "", "");
    expect(html).toContain("<title>&lt;script&gt;</title>");
    expect(html).not.toContain("<title><script></title>");
  });
});
