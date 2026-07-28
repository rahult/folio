import { describe, expect, it } from "vitest";
import { findQuoteRange, type QuoteSegment } from "../src/quotematch";

const DOC_SIZE = 1000;

function segs(...entries: [number, string][]): QuoteSegment[] {
  return entries.map(([pmFrom, text]) => ({ pmFrom, text }));
}

describe("findQuoteRange", () => {
  it("finds a quote inside a single segment", () => {
    const range = findQuoteRange(segs([0, "alpha beta gamma"]), "beta", DOC_SIZE);
    expect(range).toEqual({ from: 6, to: 10 });
  });

  it("matches across block boundaries regardless of separator style", () => {
    // Quote captured with "\n" separators; document walk may differ.
    const segments = segs([0, "first paragraph"], [20, "second paragraph"]);
    expect(findQuoteRange(segments, "paragraph\n\nsecond", DOC_SIZE)).toEqual({
      from: 6,
      to: 26,
    });
    expect(findQuoteRange(segments, "paragraph second", DOC_SIZE)).toEqual({
      from: 6,
      to: 26,
    });
  });

  it("matches across mark (bold) boundaries within a paragraph", () => {
    const segments = segs([0, "some "], [5, "bold"], [9, " text"]);
    expect(findQuoteRange(segments, "some bold text", DOC_SIZE)).toEqual({
      from: 0,
      to: 14,
    });
  });

  it("is insensitive to collapsed whitespace and newlines", () => {
    const segments = segs([0, "line one"], [30, "line two"]);
    expect(findQuoteRange(segments, "line   one \n line  two", DOC_SIZE)).toEqual({
      from: 0,
      to: 38,
    });
  });

  it("returns the first occurrence when the quote repeats", () => {
    const segments = segs([0, "repeat"], [10, "repeat"]);
    expect(findQuoteRange(segments, "repeat", DOC_SIZE)).toEqual({ from: 0, to: 6 });
  });

  it("returns null when the quote is gone (rewritten away)", () => {
    expect(findQuoteRange(segs([0, "completely different"]), "missing text", DOC_SIZE)).toBeNull();
  });

  it("returns null for an empty quote", () => {
    expect(findQuoteRange(segs([0, "anything"]), "  \n ", DOC_SIZE)).toBeNull();
  });
});
