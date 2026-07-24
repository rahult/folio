/**
 * Focus Mode and Typewriter Mode — pure logic (unit-testable). The DOM
 * and ProseMirror glue lives in src/main.ts.
 */

/** Where the caret should sit vertically, as a fraction of the viewport. */
export const TYPEWRITER_RATIO = 0.4;

/**
 * Scroll position that places the caret `ratio` of the way down the
 * viewport. Never negative; the caller decides whether the delta is
 * large enough to bother scrolling.
 */
export function typewriterScrollTop(
  caretTop: number,
  viewportHeight: number,
  ratio: number = TYPEWRITER_RATIO,
): number {
  return Math.max(0, caretTop - viewportHeight * ratio);
}

/** Dead zone: ignore scroll adjustments smaller than this many pixels. */
export const TYPEWRITER_DEAD_ZONE = 8;

export function shouldScroll(currentScrollTop: number, targetScrollTop: number): boolean {
  return Math.abs(targetScrollTop - currentScrollTop) > TYPEWRITER_DEAD_ZONE;
}
