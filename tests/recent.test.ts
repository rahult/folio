import { describe, expect, it } from "vitest";
import { addRecent, loadRecent, saveRecent } from "../src/recent";

/** In-memory Storage stand-in. */
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

describe("addRecent", () => {
  it("prepends new paths, newest first", () => {
    expect(addRecent(["/b.md", "/a.md"], "/c.md")).toEqual(["/c.md", "/b.md", "/a.md"]);
  });

  it("dedupes a re-opened path to the front", () => {
    expect(addRecent(["/b.md", "/a.md"], "/a.md")).toEqual(["/a.md", "/b.md"]);
  });

  it("caps the list at 10 entries", () => {
    const list = Array.from({ length: 10 }, (_, i) => `/f${i}.md`);
    const next = addRecent(list, "/new.md");
    expect(next).toHaveLength(10);
    expect(next[0]).toBe("/new.md");
    expect(next).not.toContain("/f9.md");
  });
});

describe("loadRecent / saveRecent", () => {
  it("round-trips through storage", () => {
    const storage = fakeStorage();
    saveRecent(["/a.md", "/b.md"], storage);
    expect(loadRecent(storage)).toEqual(["/a.md", "/b.md"]);
  });

  it("returns an empty list on corrupt data", () => {
    expect(loadRecent(fakeStorage({ "folio-recent-files": "{oops" }))).toEqual([]);
    expect(loadRecent(fakeStorage({ "folio-recent-files": '{"a":1}' }))).toEqual([]);
    expect(loadRecent(fakeStorage({ "folio-recent-files": '[1, "/a.md"]' }))).toEqual(["/a.md"]);
  });
});
