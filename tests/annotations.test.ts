import { describe, expect, it } from "vitest";
import {
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
