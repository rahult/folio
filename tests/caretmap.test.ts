import { describe, expect, it } from "vitest";
import {
  alnumCount,
  offsetAfterAlnum,
  markdownBlockRanges,
  anchorFromMarkdown,
  offsetFromAnchor,
  positionForAnchor,
} from "../src/caretmap";

const DOC = `# Title

Some **bold** text here.

\`\`\`js
const x = 1;

const y = 2;
\`\`\`

- one
- two
`;

describe("alnumCount / offsetAfterAlnum", () => {
  it("counts letters and digits only", () => {
    expect(alnumCount("**bo|ld** 12")).toBe(6);
    expect(alnumCount("")).toBe(0);
  });

  it("finds the offset just after the nth letter or digit", () => {
    expect(offsetAfterAlnum("**bold**", 0)).toBe(0);
    expect(offsetAfterAlnum("**bold**", 2)).toBe(4);
    expect(offsetAfterAlnum("**bold**", 4)).toBe(6);
    // Past the end clamps to the text length.
    expect(offsetAfterAlnum("**bold**", 99)).toBe(8);
  });
});

describe("markdownBlockRanges", () => {
  it("returns one range per top-level block, in order", () => {
    const ranges = markdownBlockRanges(DOC);
    expect(ranges.map((r) => DOC.slice(r.start, r.end))).toEqual([
      "# Title",
      "Some **bold** text here.",
      "```js\nconst x = 1;\n\nconst y = 2;\n```",
      "- one\n- two",
    ]);
  });
});

describe("anchorFromMarkdown", () => {
  it("maps an offset to its block and the letters before it", () => {
    const caret = DOC.indexOf("text here");
    expect(anchorFromMarkdown(DOC, caret)).toEqual({ block: 1, alnum: 8, wordStart: true }); // Some bold |text
  });

  it("assigns an offset in the gap between blocks to the block before it", () => {
    const caret = DOC.indexOf("\n\nSome") + 1;
    expect(anchorFromMarkdown(DOC, caret)).toEqual({ block: 0, alnum: 5, wordStart: false });
  });

  it("handles the start of the document and an empty document", () => {
    expect(anchorFromMarkdown(DOC, 0)).toEqual({ block: 0, alnum: 0, wordStart: false });
    expect(anchorFromMarkdown("", 0)).toEqual({ block: 0, alnum: 0, wordStart: false });
  });
});

describe("offsetFromAnchor", () => {
  it("round-trips an anchor back to the same offset", () => {
    const caret = DOC.indexOf("text here");
    expect(offsetFromAnchor(DOC, anchorFromMarkdown(DOC, caret))).toBe(caret);
  });

  it("lands after the nth letter, or before the next word when the caret started one", () => {
    const md = "Some **bold** text";
    expect(offsetFromAnchor(md, { block: 0, alnum: 8, wordStart: false })).toBe(11);
    expect(offsetFromAnchor(md, { block: 0, alnum: 8, wordStart: true })).toBe(14);
  });

  it("clamps an out-of-range block to the end of the document", () => {
    expect(offsetFromAnchor(DOC, { block: 42, alnum: 0, wordStart: false })).toBe(DOC.length);
    expect(offsetFromAnchor("", { block: 0, alnum: 3, wordStart: false })).toBe(0);
  });
});

describe("positionForAnchor", () => {
  const at = (alnum: number, wordStart = false) => ({ block: 0, alnum, wordStart });
  // Text segments as the editor exposes them: `pmFrom` is the ProseMirror
  // position of each text node.
  const segments = [
    { pmFrom: 1, text: "Some " },
    { pmFrom: 6, text: "bold" }, // the strong mark splits the text node
    { pmFrom: 10, text: " text here." },
  ];

  it("walks segments to the position after the nth letter", () => {
    expect(positionForAnchor(segments, at(0), 1)).toBe(1);
    expect(positionForAnchor(segments, at(4), 1)).toBe(5);
    expect(positionForAnchor(segments, at(8), 1)).toBe(10);
    expect(positionForAnchor(segments, at(12), 1)).toBe(15);
  });

  it("moves to the start of the next word across a segment boundary", () => {
    expect(positionForAnchor(segments, at(4, true), 1)).toBe(6);
    expect(positionForAnchor(segments, at(8, true), 1)).toBe(11);
  });

  it("clamps past the end and falls back when there is no text", () => {
    expect(positionForAnchor(segments, at(999), 1)).toBe(21);
    expect(positionForAnchor(segments, at(999, true), 1)).toBe(21);
    expect(positionForAnchor([], at(3), 7)).toBe(7);
  });
});
