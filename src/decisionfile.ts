/**
 * The decision companion file, `<doc>.decision.md`: plain Markdown beside
 * the document that records what the reader made of it. The Read stage
 * owns one section, "What I took from it"; later stages (options, choice,
 * outcome) add their own to the same file, so edits here must leave every
 * other section untouched. Pure and DOM-free.
 */

export const TAKEAWAY_HEADING = "## What I took from it";

export function decisionFilePath(docPath: string): string {
  return `${docPath}.decision.md`;
}

/** Lines [start, end) of the takeaway section's body, or null. `start` is
 *  the line after the heading; `end` is the next heading line or EOF. */
function takeawayBody(lines: string[]): { start: number; end: number } | null {
  const headingAt = lines.findIndex((line) => line.trimEnd() === TAKEAWAY_HEADING);
  if (headingAt === -1) return null;
  let end = lines.length;
  for (let i = headingAt + 1; i < lines.length; i++) {
    if (/^#{1,2} /.test(lines[i])) {
      end = i;
      break;
    }
  }
  return { start: headingAt + 1, end };
}

/** The takeaway text, trimmed of surrounding blank lines; "" when absent. */
export function readTakeaway(fileText: string): string {
  const lines = fileText.split("\n");
  const body = takeawayBody(lines);
  if (!body) return "";
  return lines.slice(body.start, body.end).join("\n").trim();
}

function skeleton(docName: string, docPath: string): string {
  return `# Decision: ${docName}\n\nDocument: ${docPath}\n`;
}

/**
 * The file text with the takeaway section set to `takeaway`. Creates the
 * file skeleton when `fileText` is null, replaces the section when it
 * exists, and otherwise inserts it after the header (before the first
 * `##` section). Other content is preserved byte-for-byte.
 */
export function writeTakeaway(
  fileText: string | null,
  docName: string,
  docPath: string,
  takeaway: string,
): string {
  const text = fileText ?? skeleton(docName, docPath);
  const lines = text.split("\n");
  const trimmed = takeaway.trim();
  const section = trimmed ? [TAKEAWAY_HEADING, "", trimmed, ""] : [TAKEAWAY_HEADING, ""];

  const body = takeawayBody(lines);
  if (body) {
    lines.splice(body.start, body.end - body.start, ...section.slice(1));
  } else {
    const firstSection = lines.findIndex((line, i) => i > 0 && /^## /.test(line));
    const at = firstSection === -1 ? lines.length : firstSection;
    // Keep one blank line between the header (or previous section) and us.
    const before = at > 0 && lines[at - 1] !== "" ? [""] : [];
    lines.splice(at, 0, ...before, ...section);
  }
  return normalizeEnd(lines.join("\n"));
}

/** Exactly one trailing newline, no run of blank lines at the end. */
function normalizeEnd(text: string): string {
  return `${text.replace(/\n+$/, "")}\n`;
}
