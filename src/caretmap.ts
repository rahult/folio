/**
 * Caret mapping between the rendered page and Source Code Mode. The two
 * views share no coordinate system — ProseMirror positions on one side,
 * character offsets into serialized Markdown on the other — so the caret
 * is described by something both agree on: which top-level block it is in,
 * and how many letters and digits precede it inside that block. Markdown
 * syntax (`**`, `#`, `- `, backticks) is punctuation and drops out of the
 * count, so the anchor survives the syntax boundary. Pure and DOM-free.
 */

import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

export interface CaretAnchor {
  /** Index of the top-level block holding the caret. */
  block: number;
  /** Letters and digits between the block start and the caret. */
  alnum: number;
  /** The caret sat immediately before a letter or digit — restore it at
   *  the start of that word rather than after the previous one, so the
   *  markup between two words (`** `) does not pull it backwards. */
  wordStart: boolean;
}

export interface BlockRange {
  start: number;
  end: number;
}

/** A text node as the editor exposes it (see `docSegments`). */
export interface TextSegment {
  pmFrom: number;
  text: string;
}

const ALNUM = /[\p{L}\p{N}]/u;

/** Number of letters and digits in `text`. */
export function alnumCount(text: string): number {
  let count = 0;
  for (const ch of text) if (ALNUM.test(ch)) count++;
  return count;
}

/** Offset just after the `count`-th letter or digit (0 → 0; past the end
 *  → text length). */
export function offsetAfterAlnum(text: string, count: number): number {
  if (count <= 0) return 0;
  let seen = 0;
  let offset = 0;
  for (const ch of text) {
    offset += ch.length;
    if (ALNUM.test(ch) && ++seen === count) return offset;
  }
  return text.length;
}

/** Offset of the first letter or digit after `count` of them (the start of
 *  the next word); text length when there is none. */
export function offsetBeforeAlnum(text: string, count: number): number {
  let seen = 0;
  let offset = 0;
  for (const ch of text) {
    if (ALNUM.test(ch)) {
      if (seen === count) return offset;
      seen++;
    }
    offset += ch.length;
  }
  return text.length;
}

function startsWithAlnum(text: string): boolean {
  const first = [...text.slice(0, 2)][0];
  return first !== undefined && ALNUM.test(first);
}

const parser = unified().use(remarkParse).use(remarkGfm);

/** Character ranges of the document's top-level blocks, in order. */
export function markdownBlockRanges(markdown: string): BlockRange[] {
  const root = parser.parse(markdown);
  const ranges: BlockRange[] = [];
  for (const node of root.children) {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start !== undefined && end !== undefined) ranges.push({ start, end });
  }
  return ranges;
}

/** Anchor for a caret at `offset` in `markdown`. An offset in the gap
 *  between two blocks belongs to the block before it. */
export function anchorFromMarkdown(markdown: string, offset: number): CaretAnchor {
  const ranges = markdownBlockRanges(markdown);
  if (ranges.length === 0) return { block: 0, alnum: 0, wordStart: false };
  let block = 0;
  for (let i = 0; i < ranges.length; i++) {
    if (ranges[i].start <= offset) block = i;
  }
  const { start, end } = ranges[block];
  const caret = Math.min(Math.max(offset, start), end);
  return {
    block,
    alnum: alnumCount(markdown.slice(start, caret)),
    wordStart: startsWithAlnum(markdown.slice(caret, end)),
  };
}

/** Character offset in `markdown` for an anchor (clamped to the document). */
export function offsetFromAnchor(markdown: string, anchor: CaretAnchor): number {
  const ranges = markdownBlockRanges(markdown);
  if (ranges.length === 0) return 0;
  if (anchor.block >= ranges.length) return markdown.length;
  const { start, end } = ranges[Math.max(0, anchor.block)];
  const text = markdown.slice(start, end);
  return start + (anchor.wordStart ? offsetBeforeAlnum(text, anchor.alnum) : offsetAfterAlnum(text, anchor.alnum));
}

/** ProseMirror position for an anchor across the given text segments (a
 *  single block's, in document order); `fallback` when the block has no
 *  text at all. */
export function positionForAnchor(
  segments: TextSegment[],
  anchor: CaretAnchor,
  fallback: number,
): number {
  if (segments.length === 0) return fallback;
  let remaining = anchor.alnum;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const here = alnumCount(seg.text);
    if (anchor.wordStart ? remaining < here : remaining <= here) {
      return (
        seg.pmFrom +
        (anchor.wordStart
          ? offsetBeforeAlnum(seg.text, remaining)
          : offsetAfterAlnum(seg.text, remaining))
      );
    }
    remaining -= here;
  }
  const last = segments[segments.length - 1];
  return last.pmFrom + last.text.length;
}
