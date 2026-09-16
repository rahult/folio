/**
 * Files dragged onto the window. Tauri routes every external drag into
 * `tauri://drag-*` events (the DOM never sees them, so nothing else can
 * react), and the app answers a drop by opening the Markdown files in tabs
 * — the same set of extensions the file associations and the open panel
 * accept. Anything else a person might drop is left alone. Pure and
 * DOM-free so the choice is unit-testable.
 */

const MARKDOWN_EXTENSION = /\.(md|markdown|mdown|mkd)$/i;

/** The dropped paths worth opening, in drop order; directories and
 *  non-Markdown files drop out. */
export function markdownDrops(paths: string[]): string[] {
  return paths.filter((path) => MARKDOWN_EXTENSION.test(path));
}
