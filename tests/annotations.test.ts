import { describe, expect, it } from "vitest";
import {
  buildFeedback,
  loadAnnotations,
  makeAnnotation,
  saveAnnotations,
} from "../src/annotations";

function fakeStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}

describe("annotation persistence", () => {
  it("round-trips annotations per file path", () => {
    const storage = fakeStorage();
    const a = makeAnnotation("comment", "some quote", "why this?", "2026-07-28T00:00:00Z");
    saveAnnotations("/plan.md", [a], storage);
    expect(loadAnnotations("/plan.md", storage)).toEqual([a]);
    expect(loadAnnotations("/other.md", storage)).toEqual([]);
  });

  it("drops corrupt and malformed entries", () => {
    const storage = fakeStorage({ "folio-annotations:/p.md": "{bad" });
    expect(loadAnnotations("/p.md", storage)).toEqual([]);
    const storage2 = fakeStorage({
      "folio-annotations:/p.md": JSON.stringify([{ id: 1 }, { nope: true }]),
    });
    expect(loadAnnotations("/p.md", storage2)).toEqual([]);
  });

  it("assigns unique ids", () => {
    const a = makeAnnotation("comment", "q", "b");
    const b = makeAnnotation("comment", "q", "b");
    expect(a.id).not.toBe(b.id);
  });
});

describe("buildFeedback", () => {
  it("approves when there are no annotations", () => {
    const feedback = buildFeedback("plan.md", []);
    expect(feedback).toContain("# Review feedback: plan.md");
    expect(feedback).toContain("**approved**");
  });

  it("serializes a comment with its quoted context", () => {
    const feedback = buildFeedback("plan.md", [
      makeAnnotation("comment", "migrate everything at once", "Split into two phases."),
    ]);
    expect(feedback).toContain("**changes requested** (1 annotation)");
    expect(feedback).toContain('## 1. Comment on "migrate everything at once"');
    expect(feedback).toContain("> migrate everything at once");
    expect(feedback).toContain("Split into two phases.");
  });

  it("serializes deletions and replacements as instructions", () => {
    const feedback = buildFeedback("plan.md", [
      makeAnnotation("delete", "drop the users table", ""),
      makeAnnotation("replace", "use Redis", "use Postgres with JSONB"),
    ]);
    expect(feedback).toContain('## 1. Delete "drop the users table"');
    expect(feedback).toContain("Remove this section.");
    expect(feedback).toContain('## 2. Replace "use Redis"');
    expect(feedback).toContain("use Postgres with JSONB");
    expect(feedback).toContain("(2 annotations)");
  });

  it("collapses multiline quotes into one line", () => {
    const longQuote = "line one\n\nline two   with   spacing";
    const feedback = buildFeedback("plan.md", [makeAnnotation("comment", longQuote, "hm")]);
    expect(feedback).toContain('"line one line two with spacing"');
  });
});
