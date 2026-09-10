import { describe, expect, it } from "vitest";
import { TabList, type TabSnapshot } from "../src/tabs";

const snap = (over: Partial<TabSnapshot> = {}): TabSnapshot => ({
  content: "",
  baseline: "",
  dirty: false,
  scroll: 0,
  anchor: null,
  ...over,
});

describe("TabList", () => {
  it("starts with one untitled tab that is active", () => {
    const tabs = new TabList();
    expect(tabs.all).toHaveLength(1);
    expect(tabs.active.path).toBeNull();
    expect(tabs.activeIndex).toBe(0);
  });

  it("opens a path in a new tab after the active one and activates it", () => {
    const tabs = new TabList();
    const a = tabs.open("/a.md");
    const b = tabs.open("/b.md");
    expect(tabs.all.map((t) => t.path)).toEqual(["/a.md", "/b.md"]);
    expect(tabs.active).toBe(b);
    tabs.activate(a.id);
    tabs.open("/c.md");
    expect(tabs.all.map((t) => t.path)).toEqual(["/a.md", "/c.md", "/b.md"]);
  });

  it("re-activates an existing tab instead of opening a path twice", () => {
    const tabs = new TabList();
    const a = tabs.open("/a.md");
    tabs.open("/b.md");
    expect(tabs.open("/a.md")).toBe(a);
    expect(tabs.all).toHaveLength(2);
    expect(tabs.active).toBe(a);
  });

  it("reuses a clean untitled active tab for the first open", () => {
    const tabs = new TabList();
    const first = tabs.active;
    const opened = tabs.open("/a.md");
    expect(opened).toBe(first);
    expect(tabs.all).toHaveLength(1);
    expect(first.path).toBe("/a.md");
  });

  it("keeps a dirty untitled tab when opening beside it", () => {
    const tabs = new TabList();
    tabs.remember(snap({ content: "draft", dirty: true }));
    tabs.open("/a.md");
    expect(tabs.all).toHaveLength(2);
    expect(tabs.all[0].snapshot?.dirty).toBe(true);
  });

  it("closes a tab and activates its neighbour", () => {
    const tabs = new TabList();
    tabs.open("/a.md");
    const b = tabs.open("/b.md");
    tabs.open("/c.md");
    tabs.activate(b.id);
    expect(tabs.close(b.id)).toBe(true);
    expect(tabs.all.map((t) => t.path)).toEqual(["/a.md", "/c.md"]);
    expect(tabs.active.path).toBe("/c.md");
    tabs.close(tabs.active.id);
    expect(tabs.active.path).toBe("/a.md");
  });

  it("refuses to close the last tab", () => {
    const tabs = new TabList();
    expect(tabs.close(tabs.active.id)).toBe(false);
    expect(tabs.all).toHaveLength(1);
  });

  it("cycles with next and previous", () => {
    const tabs = new TabList();
    tabs.open("/a.md");
    tabs.open("/b.md");
    expect(tabs.active.path).toBe("/b.md");
    tabs.step(1);
    expect(tabs.active.path).toBe("/a.md");
    tabs.step(-1);
    expect(tabs.active.path).toBe("/b.md");
  });

  it("adds an untitled tab on demand", () => {
    const tabs = new TabList();
    tabs.open("/a.md");
    const fresh = tabs.addUntitled();
    expect(fresh.path).toBeNull();
    expect(tabs.active).toBe(fresh);
    expect(tabs.all).toHaveLength(2);
  });

  it("renames a tab when its document is saved under a path", () => {
    const tabs = new TabList();
    const t = tabs.active;
    tabs.setPath(t.id, "/new.md");
    expect(t.path).toBe("/new.md");
    expect(t.title).toBe("new.md");
  });
});
