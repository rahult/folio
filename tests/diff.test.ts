import { describe, expect, it } from "vitest";
import { diffWords } from "../src/diff";

describe("diffWords", () => {
  it("reports identical text as one same op", () => {
    expect(diffWords("hello world", "hello world")).toEqual([
      { kind: "same", text: "hello world" },
    ]);
  });

  it("marks an inserted word as add", () => {
    const ops = diffWords("the quick fox", "the quick brown fox");
    expect(ops).toEqual([
      { kind: "same", text: "the quick " },
      { kind: "add", text: "brown " },
      { kind: "same", text: "fox" },
    ]);
  });

  it("marks a deleted word as remove", () => {
    const ops = diffWords("the quick brown fox", "the quick fox");
    expect(ops).toEqual([
      { kind: "same", text: "the quick " },
      { kind: "remove", text: "brown " },
      { kind: "same", text: "fox" },
    ]);
  });

  it("handles a full rewrite", () => {
    const ops = diffWords("aaa bbb", "ccc ddd");
    const rebuiltNew = ops.filter((o) => o.kind !== "remove").map((o) => o.text).join("");
    const rebuiltOld = ops.filter((o) => o.kind !== "add").map((o) => o.text).join("");
    expect(rebuiltNew).toBe("ccc ddd");
    expect(rebuiltOld).toBe("aaa bbb");
    // nothing but whitespace survives the rewrite
    expect(ops.some((o) => o.kind === "same" && o.text.trim())).toBe(false);
  });

  it("concatenating same+add yields the new text, same+remove the old", () => {
    const oldText = "# Plan\n\n- step one\n- step two\n\nDetails here.\n";
    const newText = "# Plan\n\n- step one\n- step 2\n- step three\n\nDetails here.\n";
    const ops = diffWords(oldText, newText);
    const rebuiltNew = ops.filter((o) => o.kind !== "remove").map((o) => o.text).join("");
    const rebuiltOld = ops.filter((o) => o.kind !== "add").map((o) => o.text).join("");
    expect(rebuiltNew).toBe(newText);
    expect(rebuiltOld).toBe(oldText);
  });

  it("handles empty inputs", () => {
    expect(diffWords("", "")).toEqual([{ kind: "same", text: "" }]);
    expect(diffWords("", "new")).toEqual([{ kind: "add", text: "new" }]);
    expect(diffWords("old", "")).toEqual([{ kind: "remove", text: "old" }]);
  });
});
