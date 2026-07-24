/**
 * Pure, DOM-free markdown/document helpers (unit-tested).
 */

/** Extract the file name from a filesystem path (handles both / and \ separators). */
export function fileNameFromPath(path: string): string {
  const segments = path.split(/[\\/]/).filter((s) => s.length > 0);
  return segments.length > 0 ? segments[segments.length - 1] : path;
}

/** Normalize line endings (CRLF / CR -> LF) and strip a BOM if present. */
export function normalizeMarkdown(markdown: string): string {
  let text = markdown;
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  return text.replace(/\r\n?/g, "\n");
}

/** Ensure the document ends with exactly one trailing newline. */
export function ensureTrailingNewline(markdown: string): string {
  return markdown.replace(/\s*$/, "") + (markdown.trim().length > 0 ? "\n" : "");
}

/** True if the path looks like a markdown file. */
export function isMarkdownPath(path: string): boolean {
  return /\.(md|markdown|mdown|mkd)$/i.test(path);
}
