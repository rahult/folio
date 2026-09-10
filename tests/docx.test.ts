import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { buildDocx } from "../src/docx";

const NO_IMAGES = { image: async () => null };

async function documentXml(md: string): Promise<string> {
  const bytes = await buildDocx(md, "test.md", NO_IMAGES);
  const zip = await JSZip.loadAsync(bytes);
  return (await zip.file("word/document.xml")!.async("string")).replace(/\s+/g, " ");
}

describe("buildDocx", () => {
  it("produces a Word package with headings and styled runs", async () => {
    const xml = await documentXml("# Title\n\nSome *em*, **strong**, `code`, and ~~gone~~.\n");
    expect(xml).toContain('w:val="Heading1"');
    expect(xml).toContain("Title");
    expect(xml).toMatch(/<w:i\/>.*em/);
    expect(xml).toMatch(/<w:b\/>.*strong/);
    expect(xml).toMatch(/JetBrains Mono|Consolas|Courier/);
    expect(xml).toMatch(/<w:strike\/>.*gone/);
  });

  it("defines each heading style exactly once", async () => {
    const bytes = await buildDocx("# A\n\n## B\n", "t.md", NO_IMAGES);
    const zip = await JSZip.loadAsync(bytes);
    const styles = await zip.file("word/styles.xml")!.async("string");
    expect((styles.match(/w:styleId="Heading1"/g) ?? []).length).toBe(1);
    expect(styles).toContain("Newsreader");
  });

  it("writes lists with numbering, tables, quotes, code blocks, and links", async () => {
    const md =
      "- one\n  - nested\n\n1. first\n\n> quoted\n\n```js\nlet x = 1;\n```\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n[site](https://example.com)\n";
    const xml = await documentXml(md);
    expect(xml).toContain("<w:numPr>");
    expect(xml).toContain("<w:tbl>");
    expect(xml).toContain("quoted");
    expect(xml).toContain("let x = 1;");
    expect(xml).toContain("<w:hyperlink");
    expect(xml).toContain("nested");
  });

  it("embeds images the hook provides and skips the rest", async () => {
    // A 1x1 PNG.
    const png = Uint8Array.from(
      atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="),
      (c) => c.charCodeAt(0),
    );
    const bytes = await buildDocx("![a](a.png)\n\n![r](https://x/y.png)\n", "t.md", {
      image: async (src) => (src === "a.png" ? { data: png, type: "png", width: 1, height: 1 } : null),
    });
    const zip = await JSZip.loadAsync(bytes);
    const media = Object.keys(zip.files).filter((f) => f.startsWith("word/media/") && !zip.files[f].dir);
    expect(media).toHaveLength(1);
    const xml = (await zip.file("word/document.xml")!.async("string")).replace(/\s+/g, " ");
    expect(xml).toContain("<w:drawing>");
    // The remote image becomes a link; link targets live in the rels part.
    const rels = await zip.file("word/_rels/document.xml.rels")!.async("string");
    expect(rels).toContain("https://x/y.png");
  });
});
