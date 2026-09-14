/**
 * The reading panel's width: dragged by its handle, remembered per window,
 * clamped so it can neither vanish nor swallow the page.
 */

export const PANEL_MIN_WIDTH = 240;
export const PANEL_MAX_WIDTH = 520;
export const PANEL_DEFAULT_WIDTH = 300;
export const PANEL_WIDTH_KEY = "folio-panel-width";

export function clampPanelWidth(value: number): number {
  if (!Number.isFinite(value)) return PANEL_DEFAULT_WIDTH;
  return Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, Math.round(value)));
}

/** The width to start with, from what an earlier session stored. */
export function storedPanelWidth(raw: string | null): number {
  if (raw === null) return PANEL_DEFAULT_WIDTH;
  return clampPanelWidth(Number(raw));
}
