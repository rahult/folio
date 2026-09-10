import { describe, expect, it } from "vitest";
import { fuzzyScore, rankFiles } from "../src/quickopen";

describe("fuzzyScore", () => {
  it("returns null when the query is not a subsequence", () => {
    expect(fuzzyScore("xyz", "docs/plan.md")).toBeNull();
  });

  it("prefers matches at word starts and consecutive runs", () => {
    const start = fuzzyScore("plan", "docs/plan.md")!;
    const scattered = fuzzyScore("plan", "people/latin/anagram.md")!;
    expect(start).toBeGreaterThan(scattered);
  });

  it("prefers matches in the file name over the directory", () => {
    const inName = fuzzyScore("spec", "notes/spec.md")!;
    const inDir = fuzzyScore("spec", "spec/notes.md")!;
    expect(inName).toBeGreaterThan(inDir);
  });

  it("ignores spaces in the query", () => {
    expect(fuzzyScore("review gate", "docs/specs/review-gate-design.md")).not.toBeNull();
  });

  it("is case-insensitive", () => {
    expect(fuzzyScore("README", "readme.md")).not.toBeNull();
  });
});

describe("rankFiles", () => {
  const files = ["docs/plan.md", "docs/specs/review-gate.md", "README.md", "notes/todo.md"];

  it("lists recents first with an empty query, then the rest", () => {
    const out = rankFiles("", files, ["notes/todo.md"], 10);
    expect(out[0]).toBe("notes/todo.md");
    expect(out).toHaveLength(4);
  });

  it("ranks by score and caps the result", () => {
    const out = rankFiles("re", files, [], 2);
    expect(out).toHaveLength(2);
    expect(out[0]).toBe("README.md");
  });

  it("gives recents a bonus but still requires a match", () => {
    const out = rankFiles("plan", files, ["notes/todo.md"], 10);
    expect(out).toEqual(["docs/plan.md"]);
  });
});
