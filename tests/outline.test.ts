import { describe, expect, it } from "vitest";
import { buildOutline, readingMinutes, sectionAtOffset } from "../src/outline";

const DOC =
  "Intro words here.\n\n# One\n\nAlpha beta gamma.\n\n## One point one\n\nDelta *epsilon*.\n\nTwo\n---\n\nZeta `eta` theta iota.\n";

describe("buildOutline", () => {
  it("lists headings with level, stripped text, index, and offset", () => {
    const o = buildOutline(DOC);
    expect(o.map((e) => [e.level, e.text, e.index])).toEqual([
      [1, "One", 0],
      [2, "One point one", 1],
      [2, "Two", 2],
    ]);
    expect(DOC.slice(o[0].offset, o[0].offset + 5)).toBe("# One");
    expect(DOC.slice(o[2].offset, o[2].offset + 3)).toBe("Two");
  });

  it("counts the words of each section up to the next heading", () => {
    expect(buildOutline(DOC).map((e) => e.words)).toEqual([3, 2, 4]);
  });

  it("ignores code fences that look like headings", () => {
    const o = buildOutline("# Real\n\n```\n# not a heading\n```\n");
    expect(o.map((e) => e.text)).toEqual(["Real"]);
  });

  it("returns an empty outline for a document without headings", () => {
    expect(buildOutline("just text")).toEqual([]);
    expect(buildOutline("")).toEqual([]);
  });
});

describe("readingMinutes", () => {
  it("rounds up and never reports 0 for a non-empty text", () => {
    expect(readingMinutes(0)).toBe(0);
    expect(readingMinutes(1)).toBe(1);
    expect(readingMinutes(230)).toBe(1);
    expect(readingMinutes(231)).toBe(2);
    expect(readingMinutes(460, 460)).toBe(1);
  });
});

describe("sectionAtOffset", () => {
  it("finds the section holding an offset", () => {
    const o = buildOutline(DOC);
    expect(sectionAtOffset(o, 0)).toBe(-1);
    expect(sectionAtOffset(o, o[0].offset)).toBe(0);
    expect(sectionAtOffset(o, o[1].offset + 3)).toBe(1);
    expect(sectionAtOffset(o, DOC.length)).toBe(2);
    expect(sectionAtOffset([], 5)).toBe(-1);
  });
});
