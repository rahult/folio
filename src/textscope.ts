/**
 * Where a sentence or a section begins and ends in plain text — for
 * review actions that target a sentence under the caret rather than the
 * whole paragraph. Pure; offsets are 0-based, ends exclusive.
 */

export interface Span {
  start: number;
  end: number;
}

/** A sentence ends at `.`, `!` or `?` (optionally followed by closing
 *  quotes or brackets) when whitespace or the end of text follows, or at a
 *  line break. The span excludes surrounding whitespace. */
export function sentenceAt(text: string, offset: number): Span {
  if (text.length === 0) return { start: 0, end: 0 };
  const at = Math.min(Math.max(0, offset), text.length);
  const ends: number[] = [];
  const re = /[.!?]+["'\u201d\u2019)\]]*(?=\s|$)|\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) ends.push(m.index + m[0].length);
  if (ends[ends.length - 1] !== text.length) ends.push(text.length);
  let start = 0;
  for (const end of ends) {
    if (at < end || end === text.length) {
      return trimSpan(text, start, end);
    }
    start = end;
  }
  return trimSpan(text, start, text.length);
}

function trimSpan(text: string, start: number, end: number): Span {
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;
  return { start, end };
}

/** The blocks of the section around block `index`: a heading and every
 *  block after it up to the next heading of the same or a higher level; for
 *  a block under a heading, that heading's section; with no heading above,
 *  everything up to the first heading. `levels[i]` is a heading's level or
 *  0 for other blocks. */
export function sectionAround(levels: number[], index: number): Span {
  if (levels.length === 0) return { start: 0, end: 0 };
  const i = Math.min(Math.max(0, index), levels.length - 1);
  let start = i;
  while (start > 0 && levels[start] === 0) start--;
  const level = levels[start] || 0;
  let end = start + 1;
  while (end < levels.length && (levels[end] === 0 || (level > 0 && levels[end] > level))) end++;
  if (level === 0) {
    // No heading above: the run of blocks before the first heading.
    start = 0;
    end = 0;
    while (end < levels.length && levels[end] === 0) end++;
  }
  return { start, end };
}
