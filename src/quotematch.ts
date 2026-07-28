/**
 * Quote-to-document matching for review annotations. Quotes are captured
 * from the rendered selection, whose whitespace/separators do not always
 * match the document walk's (block boundaries, hard breaks, mark splits) —
 * exact string search silently fails on real-world files. Matching on the
 * word sequence instead makes annotations robust for any existing document.
 * Pure and DOM-free so it is unit-testable.
 */

export interface QuoteSegment {
  /** ProseMirror position where this text node starts. */
  pmFrom: number;
  text: string;
}

interface WordSpan {
  segIndex: number;
  start: number;
  end: number;
  word: string;
}

/** Words of a text with their local offsets (whitespace-separated). */
function wordsOf(text: string, segIndex: number): WordSpan[] {
  const spans: WordSpan[] = [];
  for (const match of text.matchAll(/\S+/g)) {
    spans.push({ segIndex, start: match.index, end: match.index + match[0].length, word: match[0] });
  }
  return spans;
}

/**
 * Find the first occurrence of `quote` in the document's word stream and
 * return it as a ProseMirror range, or null when the quote is not present
 * (e.g. the text was removed by a rewrite — the annotation is kept for
 * feedback regardless).
 */
export function findQuoteRange(
  segments: QuoteSegment[],
  quote: string,
  docSize: number,
): { from: number; to: number } | null {
  const needle = quote.split(/\s+/).filter(Boolean);
  if (needle.length === 0) return null;

  const spans = segments.flatMap((seg, i) => wordsOf(seg.text, i));
  outer: for (let i = 0; i + needle.length <= spans.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (spans[i + j].word !== needle[j]) continue outer;
    }
    const first = spans[i];
    const last = spans[i + needle.length - 1];
    const from = segments[first.segIndex].pmFrom + first.start;
    const to = segments[last.segIndex].pmFrom + last.end;
    return { from: Math.min(from, docSize), to: Math.min(to, docSize) };
  }
  return null;
}
