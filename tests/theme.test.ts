import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, isTheme, storedTheme, THEMES } from "../src/theme";

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
