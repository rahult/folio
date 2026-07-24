import { describe, expect, it } from "vitest";
import {
  canApplyTheme,
  DEFAULT_THEME,
  isTheme,
  storedTheme,
  THEMES,
} from "../src/theme";

describe("isTheme", () => {
  it("accepts the three known themes", () => {
    for (const theme of THEMES) expect(isTheme(theme)).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isTheme("solarized")).toBe(false);
    expect(isTheme("")).toBe(false);
    expect(isTheme(null)).toBe(false);
    expect(isTheme(42)).toBe(false);
  });
});

describe("storedTheme", () => {
  it("returns a persisted valid theme", () => {
    expect(storedTheme("night")).toBe("night");
    expect(storedTheme("newsprint")).toBe("newsprint");
  });

  it("falls back to Paper for missing or invalid values", () => {
    expect(storedTheme(null)).toBe(DEFAULT_THEME);
    expect(storedTheme("solarized")).toBe(DEFAULT_THEME);
  });
});

describe("canApplyTheme", () => {
  it("keeps Paper free so users can always switch back", () => {
    expect(canApplyTheme("paper", false)).toBe(true);
    expect(canApplyTheme("paper", true)).toBe(true);
  });

  it("gates alternate themes behind a license", () => {
    expect(canApplyTheme("night", false)).toBe(false);
    expect(canApplyTheme("newsprint", false)).toBe(false);
    expect(canApplyTheme("night", true)).toBe(true);
    expect(canApplyTheme("newsprint", true)).toBe(true);
  });
});
