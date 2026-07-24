import { describe, expect, it } from "vitest";
import { shouldScroll, TYPEWRITER_RATIO, typewriterScrollTop } from "../src/modes";

describe("typewriterScrollTop", () => {
  it("places the caret 40% down the viewport", () => {
    // caret 1000px into the content, 600px viewport → 1000 - 240
    expect(typewriterScrollTop(1000, 600)).toBe(760);
    expect(TYPEWRITER_RATIO).toBeCloseTo(0.4);
  });

  it("never scrolls above the document start", () => {
    expect(typewriterScrollTop(100, 600)).toBe(0);
    expect(typewriterScrollTop(0, 600)).toBe(0);
  });
});

describe("shouldScroll", () => {
  it("ignores adjustments inside the dead zone", () => {
    expect(shouldScroll(100, 105)).toBe(false);
    expect(shouldScroll(100, 108)).toBe(false);
    expect(shouldScroll(100, 109)).toBe(true);
    expect(shouldScroll(109, 100)).toBe(true);
  });
});
