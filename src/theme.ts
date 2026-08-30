/**
 * Theme definitions — pure and DOM-free. Applying a theme is just
 * `document.documentElement.dataset.theme = theme` plus localStorage
 * persistence (src/main.ts).
 */

export type Theme = "paper" | "night" | "newsprint";

export const THEMES: readonly Theme[] = ["paper", "night", "newsprint"];

export const THEME_STORAGE_KEY = "folio-theme";

/** Default when nothing (or something invalid) is persisted. */
export const DEFAULT_THEME: Theme = "paper";

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

/** The theme to apply at startup, from raw localStorage content. */
export function storedTheme(raw: string | null): Theme {
  return isTheme(raw) ? raw : DEFAULT_THEME;
}
