import { describe, expect, it } from "vitest";
import { findWikilinks, parseWikilink, resolveWikilink, slugify, headingForAnchor } from "../src/wikilink";

describe("findWikilinks", () => {
  it("finds every [[target]] with its offsets", () => {
    const text = "See [[plan]] and [[docs/spec#Risks|the risks]].";
    expect(findWikilinks(text)).toEqual([
      { start: 4, end: 12, raw: "plan" },
      { start: 17, end: 46, raw: "docs/spec#Risks|the risks" },
    ]);
  });

  it("ignores unclosed and empty brackets", () => {
    expect(findWikilinks("[[ ]] and [[open")).toEqual([]);
  });
});

describe("parseWikilink", () => {
  it("splits target, heading, and label", () => {
    expect(parseWikilink("docs/spec#Risks|the risks")).toEqual({ target: "docs/spec", anchor: "Risks", label: "the risks" });
    expect(parseWikilink("plan")).toEqual({ target: "plan", anchor: null, label: "plan" });
    expect(parseWikilink("#Risks")).toEqual({ target: "", anchor: "Risks", label: "#Risks" });
  });
});

describe("resolveWikilink", () => {
  const files = ["README.md", "docs/plan.md", "docs/specs/review-gate-design.md", "notes/Plan.md"];

  it("matches a bare name against file names, case-insensitively, preferring exact", () => {
    expect(resolveWikilink("plan", files)).toBe("docs/plan.md");
    expect(resolveWikilink("README", files)).toBe("README.md");
  });

  it("matches a path with or without extension", () => {
    expect(resolveWikilink("docs/specs/review-gate-design", files)).toBe("docs/specs/review-gate-design.md");
    expect(resolveWikilink("docs/plan.md", files)).toBe("docs/plan.md");
  });

  it("falls back to a fuzzy match on the name, and null when nothing fits", () => {
    expect(resolveWikilink("review gate", files)).toBe("docs/specs/review-gate-design.md");
    expect(resolveWikilink("zzz", files)).toBeNull();
  });
});

describe("slugify / headingForAnchor", () => {
  const outline = [
    { level: 1, text: "Plan", index: 0, offset: 0, words: 0 },
    { level: 2, text: "Risks & Mitigations", index: 1, offset: 10, words: 0 },
  ];

  it("slugifies the way GitHub does", () => {
    expect(slugify("Risks & Mitigations")).toBe("risks--mitigations");
  });

  it("finds a heading by slug or by loose text", () => {
    expect(headingForAnchor(outline, "risks--mitigations")).toBe(1);
    expect(headingForAnchor(outline, "Risks & Mitigations")).toBe(1);
    expect(headingForAnchor(outline, "risks")).toBe(1);
    expect(headingForAnchor(outline, "nothing")).toBe(-1);
  });
});
