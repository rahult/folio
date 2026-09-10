import { describe, expect, it } from "vitest";
import {
  buildFeedback,
  locateQuote,
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

describe("locateQuote", () => {
  const text = "# Plan\n\nShip to all users at once.\nWatch the error rate.\n\nRoll back by flag.\n";

  it("finds a single-line quote", () => {
    expect(locateQuote(text, "Ship to all users at once.")).toEqual({ startLine: 3, endLine: 3 });
  });

  it("finds a quote spanning lines, tolerant of whitespace", () => {
    expect(locateQuote(text, "at once.   Watch the")).toEqual({ startLine: 3, endLine: 4 });
  });

  it("returns null when the words are not there", () => {
    expect(locateQuote(text, "canary rollout")).toBeNull();
    expect(locateQuote(text, "")).toBeNull();
  });
});

describe("buildFeedback with approve marks and line numbers", () => {
  const text = "# Plan\n\nShip to all users at once.\n\nRoll back by flag.\n";

  it("heads entries with line ranges when the source is given", () => {
    const out = buildFeedback("plan.md", [makeAnnotation("delete", "Ship to all users at once.", "")], text);
    expect(out).toContain('## 1. Delete L3 "Ship to all users at once."');
  });

  it("lists approve marks under Keep as is and keeps the verdict approved", () => {
    const out = buildFeedback("plan.md", [makeAnnotation("approve", "Roll back by flag.", "")], text);
    expect(out).toContain("Verdict: **approved**");
    expect(out).toContain("## Keep as is");
    expect(out).toContain('- L5 "Roll back by flag."');
  });

  it("puts change requests before Keep as is and counts only them", () => {
    const out = buildFeedback(
      "plan.md",
      [
        makeAnnotation("approve", "Roll back by flag.", ""),
        makeAnnotation("comment", "Ship to all users at once.", "Too fast."),
      ],
      text,
    );
    expect(out).toContain("Verdict: **changes requested** (1 annotation)");
    expect(out.indexOf("## 1. Comment")).toBeLessThan(out.indexOf("## Keep as is"));
  });

  it("omits line ranges without a source text or when the quote is not found", () => {
    expect(buildFeedback("plan.md", [makeAnnotation("comment", "Ship to all", "x")])).toContain(
      '## 1. Comment on "Ship to all"',
    );
    expect(buildFeedback("plan.md", [makeAnnotation("comment", "gone", "x")], text)).toContain(
      '## 1. Comment on "gone"',
    );
  });

  it("accepts approve when loading persisted annotations", () => {
    const storage = new Map<string, string>();
    const fake = {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => void storage.set(k, v),
    } as unknown as Storage;
    fake.setItem(
      "folio-annotations:/p.md",
      JSON.stringify([{ id: "a1", kind: "approve", quote: "q", body: "", createdAt: "t" }]),
    );
    expect(loadAnnotations("/p.md", fake)).toHaveLength(1);
  });
});
