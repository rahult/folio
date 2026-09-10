/**
 * The document's shape for the reading panel: headings in order, each
 * with its section's word count, plus reading-time arithmetic and "which
 * section is the caret in". Built from the Markdown with remark so it is
 * the same in the rendered view and Source Code Mode, and unit-testable.
 */

import type { Heading, Root, RootContent } from "mdast";
import { toString } from "mdast-util-to-string";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { countWords } from "./markdown";

export interface OutlineEntry {
  /** Heading level, 1–6. */
  level: number;
  /** Heading text with inline syntax stripped. */
  text: string;
  /** 0-based index among all headings, in document order. */
  index: number;
  /** Character offset of the heading in the Markdown. */
  offset: number;
  /** Words from this heading to the next heading of any level. */
  words: number;
}

const parser = unified().use(remarkParse).use(remarkGfm);

/** Headings in document order with their section word counts. */
export function buildOutline(markdown: string): OutlineEntry[] {
  const root = parser.parse(markdown) as Root;
  const entries: OutlineEntry[] = [];
  let current: OutlineEntry | null = null;
  for (const node of root.children as RootContent[]) {
    if (node.type === "heading") {
      const heading = node as Heading;
      current = {
        level: heading.depth,
        text: toString(heading).trim(),
        index: entries.length,
        offset: heading.position?.start.offset ?? 0,
        words: 0,
      };
      entries.push(current);
    } else if (current) {
      current.words += countWords(toString(node));
    }
  }
  return entries;
}

/** Whole minutes to read `words`, rounded up; 0 only for nothing at all. */
export function readingMinutes(words: number, wpm = 230): number {
  if (words <= 0) return 0;
  return Math.max(1, Math.ceil(words / wpm));
}

/** Index of the entry whose section holds `offset`, or -1 before the
 *  first heading (or with no headings). */
export function sectionAtOffset(outline: OutlineEntry[], offset: number): number {
  let found = -1;
  for (const entry of outline) {
    if (entry.offset <= offset) found = entry.index;
    else break;
  }
  return found;
}
