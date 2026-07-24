/**
 * Pure zoom-level arithmetic (unit-tested). The zoom value is a font-size
 * multiplier applied through the `--zoom` CSS variable.
 */

export const ZOOM_MIN = 0.6;
export const ZOOM_MAX = 2.0;
export const ZOOM_STEP = 0.1;

export type ZoomDirection = "in" | "out" | "reset";

export function clampZoom(zoom: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

/** Next zoom level after a Zoom In / Zoom Out / Actual Size action. */
export function nextZoom(current: number, direction: ZoomDirection): number {
  if (direction === "reset") return 1;
  const delta = direction === "in" ? ZOOM_STEP : -ZOOM_STEP;
  // Round to cents so repeated steps don't accumulate float error.
  return clampZoom(Math.round((current + delta) * 100) / 100);
}
