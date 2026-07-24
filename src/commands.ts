/**
 * Editor command identifiers shared by the native-menu dispatch and the
 * editor wrapper, plus the pure heading-level arithmetic (unit-tested).
 */

export type EditorCommand =
  | "strong"
  | "emphasis"
  | "inline-code"
  | "strike"
  | "link"
  | "clear-format"
  | "paragraph"
  | "heading-1"
  | "heading-2"
  | "heading-3"
  | "heading-4"
  | "heading-5"
  | "heading-6"
  | "heading-up"
  | "heading-down"
  | "quote"
  | "bullet-list"
  | "ordered-list"
  | "task-list"
  | "code-fence"
  | "table"
  | "hr";

export type HeadingDirection = "up" | "down";

/**
 * Compute the new heading level for Increase/Decrease Heading Level.
 * `null` represents a plain paragraph (no heading level).
 * - up (promote): h3 -> h2, …, h1 stays h1; a paragraph becomes h1.
 * - down (demote): h1 -> h2, …, h6 becomes a paragraph; a paragraph is a no-op.
 */
export function adjustHeadingLevel(
  current: number | null,
  direction: HeadingDirection,
): number | null {
  if (direction === "up") {
    return current === null ? 1 : Math.max(1, current - 1);
  }
  if (current === null) return null;
  return current >= 6 ? null : current + 1;
}
