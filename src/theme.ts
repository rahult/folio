/**
 * Theme definitions — pure and DOM-free. Applying a theme is just
 * `document.documentElement.dataset.theme = theme` plus localStorage
 * persistence (src/main.ts).
 */

export type Theme = "paper" | "manuscript" | "newsprint" | "night" | "slate";

/** In menu order: two light, one bright, two dark. */
export const THEMES: readonly Theme[] = ["paper", "manuscript", "newsprint", "night", "slate"];

/** Dark themes tell the OS so native controls and scrollbars match. */
export function isDarkTheme(theme: Theme): boolean {
  return theme === "night" || theme === "slate";
}

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
