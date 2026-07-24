import { describe, expect, it } from "vitest";
import { adjustHeadingLevel } from "../src/commands";

describe("adjustHeadingLevel", () => {
  it("promotes headings one level up, stopping at h1", () => {
    expect(adjustHeadingLevel(3, "up")).toBe(2);
    expect(adjustHeadingLevel(2, "up")).toBe(1);
    expect(adjustHeadingLevel(1, "up")).toBe(1);
  });

  it("turns a paragraph into h1 when promoted", () => {
    expect(adjustHeadingLevel(null, "up")).toBe(1);
  });

  it("demotes headings one level down", () => {
    expect(adjustHeadingLevel(1, "down")).toBe(2);
    expect(adjustHeadingLevel(5, "down")).toBe(6);
  });

  it("turns h6 back into a paragraph when demoted", () => {
    expect(adjustHeadingLevel(6, "down")).toBeNull();
  });

  it("leaves a paragraph alone when demoted", () => {
    expect(adjustHeadingLevel(null, "down")).toBeNull();
  });
});
