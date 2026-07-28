import { describe, expect, it } from "vitest";
import { loadSession, saveSession } from "../src/session";

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

describe("loadSession / saveSession", () => {
  it("round-trips a full session", () => {
    const storage = fakeStorage();
    saveSession({ path: "/notes/plan.md", pos: 42, scroll: 300 }, storage);
    expect(loadSession(storage)).toEqual({ path: "/notes/plan.md", pos: 42, scroll: 300 });
  });

  it("returns null when nothing is stored or data is corrupt", () => {
    expect(loadSession(fakeStorage())).toBeNull();
    expect(loadSession(fakeStorage({ "folio-session": "{bad" }))).toBeNull();
    expect(loadSession(fakeStorage({ "folio-session": '"str"' }))).toBeNull();
  });

  it("sanitizes missing and negative fields", () => {
    const storage = fakeStorage({ "folio-session": '{"pos":-5,"scroll":-1}' });
    expect(loadSession(storage)).toEqual({ path: null, pos: 0, scroll: 0 });
  });

  it("treats a non-string path as untitled", () => {
    const storage = fakeStorage({ "folio-session": '{"path":7,"pos":1,"scroll":2}' });
    expect(loadSession(storage)?.path).toBeNull();
  });
});
