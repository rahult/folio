import { describe, expect, it } from "vitest";
import { hintText, reviewKeyAction, verdictFor } from "../src/reviewmode";

const k = (
  key: string,
  mods: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }> = {},
) => ({ key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods });
const closed = { entryOpen: false };

describe("reviewKeyAction", () => {
  it("moves with j/k and the arrows", () => {
    expect(reviewKeyAction(k("j"), closed)).toEqual({ kind: "move", delta: 1 });
    expect(reviewKeyAction(k("ArrowDown"), closed)).toEqual({ kind: "move", delta: 1 });
    expect(reviewKeyAction(k("k"), closed)).toEqual({ kind: "move", delta: -1 });
    expect(reviewKeyAction(k("ArrowUp"), closed)).toEqual({ kind: "move", delta: -1 });
  });

  it("maps the marking keys", () => {
    expect(reviewKeyAction(k("c"), closed)).toEqual({ kind: "annotate", annotation: "comment" });
    expect(reviewKeyAction(k("r"), closed)).toEqual({ kind: "annotate", annotation: "replace" });
    expect(reviewKeyAction(k("d"), closed)).toEqual({ kind: "mark", annotation: "delete" });
    expect(reviewKeyAction(k("a"), closed)).toEqual({ kind: "mark", annotation: "approve" });
    expect(reviewKeyAction(k("x"), closed)).toEqual({ kind: "remove" });
    expect(reviewKeyAction(k("n"), closed)).toEqual({ kind: "jump", delta: 1 });
    expect(reviewKeyAction(k("p"), closed)).toEqual({ kind: "jump", delta: -1 });
    expect(reviewKeyAction(k("Enter"), closed)).toEqual({ kind: "send" });
    expect(reviewKeyAction(k("e"), closed)).toEqual({ kind: "edit" });
    expect(reviewKeyAction(k("o"), closed)).toEqual({ kind: "outline" });
    expect(reviewKeyAction(k("m"), closed)).toEqual({ kind: "decide" });
    expect(reviewKeyAction(k("l"), closed)).toEqual({ kind: "lens" });
    expect(reviewKeyAction(k("?", { shiftKey: true }), closed)).toEqual({ kind: "hint" });
  });

  it("ignores modified keys so app shortcuts and shift-selection keep working", () => {
    expect(reviewKeyAction(k("s", { metaKey: true }), closed)).toBeNull();
    expect(reviewKeyAction(k("ArrowDown", { shiftKey: true }), closed)).toBeNull();
    expect(reviewKeyAction(k("c", { ctrlKey: true }), closed)).toBeNull();
    expect(reviewKeyAction(k("e", { altKey: true }), closed)).toBeNull();
  });

  it("does nothing while the entry field is open", () => {
    expect(reviewKeyAction(k("c"), { entryOpen: true })).toBeNull();
    expect(reviewKeyAction(k("Enter"), { entryOpen: true })).toBeNull();
  });

  it("ignores unmapped keys", () => {
    expect(reviewKeyAction(k("z"), closed)).toBeNull();
    expect(reviewKeyAction(k("Escape"), closed)).toBeNull();
  });
});

describe("verdictFor", () => {
  it("is approved with no change requests, whatever the approve marks", () => {
    expect(verdictFor([])).toBe("approved");
    expect(verdictFor([{ kind: "approve" }, { kind: "approve" }])).toBe("approved");
  });

  it("is changes with any comment, delete, or replace", () => {
    expect(verdictFor([{ kind: "approve" }, { kind: "comment" }])).toBe("changes");
    expect(verdictFor([{ kind: "delete" }])).toBe("changes");
  });
});

describe("hintText", () => {
  it("names the keys and says whether Enter sends", () => {
    expect(hintText(true)).toContain("⏎ send");
    expect(hintText(true)).toContain("c comment");
    expect(hintText(false)).toContain("no review waiting");
  });
});
