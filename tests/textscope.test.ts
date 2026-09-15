import { describe, expect, it } from "vitest";
import { sectionAround, sentenceAt } from "../src/textscope";

const text = "Ship it today. Roll back by flag! Is that enough? Maybe.";

describe("sentenceAt", () => {
  it("finds the sentence around an offset", () => {
    const s = sentenceAt(text, 20);
    expect(text.slice(s.start, s.end)).toBe("Roll back by flag!");
  });

  it("handles the first and last sentences and a caret at a boundary", () => {
    expect(text.slice(...Object.values(sentenceAt(text, 0)) as [number, number])).toBe("Ship it today.");
    const last = sentenceAt(text, text.length);
    expect(text.slice(last.start, last.end)).toBe("Maybe.");
    const atDot = sentenceAt(text, 13);
    expect(text.slice(atDot.start, atDot.end)).toBe("Ship it today.");
  });

  it("does not split on a dot with no space after it, and breaks on newlines", () => {
    const t = "Version 1.2 ships now\nThen 2.0";
    const first = sentenceAt(t, 3);
    expect(t.slice(first.start, first.end)).toBe("Version 1.2 ships now");
    const second = sentenceAt(t, 25);
    expect(t.slice(second.start, second.end)).toBe("Then 2.0");
  });

  it("copes with empty text and closing quotes", () => {
    expect(sentenceAt("", 0)).toEqual({ start: 0, end: 0 });
    const q = 'He said "go." Then left.';
    const s = sentenceAt(q, 2);
    expect(q.slice(s.start, s.end)).toBe('He said "go."');
  });
});

describe("sectionAround", () => {
  // levels: intro, H1, p, H2, p, p, H1, p
  const levels = [0, 1, 0, 2, 0, 0, 1, 0];

  it("gives a heading its own section up to the next heading of the same or a higher level", () => {
    expect(sectionAround(levels, 1)).toEqual({ start: 1, end: 6 });
    expect(sectionAround(levels, 3)).toEqual({ start: 3, end: 6 });
    expect(sectionAround(levels, 6)).toEqual({ start: 6, end: 8 });
  });

  it("gives a paragraph the section of the heading above it", () => {
    expect(sectionAround(levels, 5)).toEqual({ start: 3, end: 6 });
    expect(sectionAround(levels, 2)).toEqual({ start: 1, end: 6 });
  });

  it("uses the run before the first heading when there is none above", () => {
    expect(sectionAround(levels, 0)).toEqual({ start: 0, end: 1 });
    expect(sectionAround([0, 0, 0], 1)).toEqual({ start: 0, end: 3 });
    expect(sectionAround([], 0)).toEqual({ start: 0, end: 0 });
  });
});
