import { describe, expect, it } from "vitest";
import { isPathMenuClick, pathMenuEntries } from "../src/pathmenu";

describe("pathMenuEntries", () => {
  it("lists the file, then each folder above it, up to the root", () => {
    expect(pathMenuEntries("/Users/me/notes/plan.md").map((e) => e.label)).toEqual([
      "plan.md",
      "notes",
      "me",
      "Users",
      "/",
    ]);
  });

  it("reveals the file itself, and for each folder the item inside it on the way to the file", () => {
    expect(pathMenuEntries("/Users/me/plan.md").map((e) => e.reveal)).toEqual([
      "/Users/me/plan.md",
      "/Users/me/plan.md",
      "/Users/me",
      "/Users",
    ]);
  });

  it("handles Windows paths with a drive letter", () => {
    const entries = pathMenuEntries("C:\\Users\\me\\plan.md");
    expect(entries.map((e) => e.label)).toEqual(["plan.md", "me", "Users", "C:"]);
    expect(entries.map((e) => e.reveal)).toEqual([
      "C:\\Users\\me\\plan.md",
      "C:\\Users\\me\\plan.md",
      "C:\\Users\\me",
      "C:\\Users",
    ]);
  });

  it("ignores repeated and trailing separators", () => {
    expect(pathMenuEntries("/a//b/").map((e) => e.label)).toEqual(["b", "a", "/"]);
  });

  it("has nothing to show for an empty path", () => {
    expect(pathMenuEntries("")).toEqual([]);
  });
});

describe("isPathMenuClick", () => {
  const click = (mods: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }>, button = 0) => ({
    button,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...mods,
  });

  it("is ⌘-click on macOS", () => {
    expect(isPathMenuClick(click({ metaKey: true }), true)).toBe(true);
    expect(isPathMenuClick(click({ ctrlKey: true }), true)).toBe(false);
    expect(isPathMenuClick(click({}), true)).toBe(false);
  });

  it("is Ctrl-click elsewhere", () => {
    expect(isPathMenuClick(click({ ctrlKey: true }), false)).toBe(true);
    expect(isPathMenuClick(click({ metaKey: true }), false)).toBe(false);
  });

  it("only counts a plain primary click with that one modifier", () => {
    expect(isPathMenuClick(click({ metaKey: true }, 2), true)).toBe(false);
    expect(isPathMenuClick(click({ metaKey: true, shiftKey: true }), true)).toBe(false);
  });
});
