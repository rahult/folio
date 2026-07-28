import { describe, expect, it } from "vitest";
import { NavigationHistory } from "../src/navhistory";

describe("NavigationHistory", () => {
  it("starts empty with nowhere to go", () => {
    const nav = new NavigationHistory();
    expect(nav.canGoBack).toBe(false);
    expect(nav.canGoForward).toBe(false);
    expect(nav.goBack()).toBeNull();
    expect(nav.goForward()).toBeNull();
  });

  it("walks back and forward through visits", () => {
    const nav = new NavigationHistory();
    nav.visit("/a.md");
    nav.visit("/b.md");
    nav.visit("/c.md");

    expect(nav.canGoBack).toBe(true);
    expect(nav.goBack()).toBe("/b.md");
    expect(nav.goBack()).toBe("/a.md");
    expect(nav.goBack()).toBeNull();

    expect(nav.goForward()).toBe("/b.md");
    expect(nav.goForward()).toBe("/c.md");
    expect(nav.goForward()).toBeNull();
  });

  it("clears the forward stack on a new visit", () => {
    const nav = new NavigationHistory();
    nav.visit("/a.md");
    nav.visit("/b.md");
    nav.goBack();
    nav.visit("/z.md");

    expect(nav.canGoForward).toBe(false);
    expect(nav.goBack()).toBe("/a.md");
  });

  it("does not duplicate consecutive visits to the same file", () => {
    const nav = new NavigationHistory();
    nav.visit("/a.md");
    nav.visit("/a.md");
    expect(nav.canGoBack).toBe(false);
  });

  it("peeks without mutating", () => {
    const nav = new NavigationHistory();
    nav.visit("/a.md");
    nav.visit("/b.md");
    expect(nav.peekBack()).toBe("/a.md");
    expect(nav.peekBack()).toBe("/a.md");
    nav.goBack();
    expect(nav.peekForward()).toBe("/b.md");
    expect(nav.canGoBack).toBe(false);
  });
});
