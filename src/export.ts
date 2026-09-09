/**
 * HTML export helpers. Pure and DOM-free so they are unit-testable; the
 * DOM scraping (cloning the rendered document, serializing stylesheets)
 * lives in src/main.ts and src/editor.ts.
 */

/** Where to offer saving the exported HTML, given the current file path. */
export function htmlExportTarget(filePath: string | null): string {
  if (!filePath) return "untitled.html";
  if (/\.(md|markdown|mdown|mkd)$/i.test(filePath)) {
    return filePath.replace(/\.(md|markdown|mdown|mkd)$/i, ".html");
  }
  return `${filePath}.html`;
}

/** Escape text interpolated into the exported document's <title>. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Assemble a standalone HTML document around rendered content.
 * `contentHtml` is the body produced by `renderExportHtml`; `cssText` is
 * the export stylesheet (plus embedded font faces when available).
 */
export function buildHtmlDocument(
  title: string,
  contentHtml: string,
  cssText: string,
): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <style>
${cssText}
    </style>
    <style>
      body { margin: 0; background: oklch(0.981 0.007 88); }
    </style>
  </head>
  <body>
    <main class="folio-export">${contentHtml}</main>
  </body>
</html>
`;
}
