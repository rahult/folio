/**
 * Quote-to-document matching for review annotations. Quotes are captured
 * from the rendered selection, whose whitespace/separators do not always
 * match the document walk's (block boundaries, hard breaks, mark splits),
 * and whose edge words may stop short of the document's punctuation
 * ("jugs" for "jugs,") — exact string search silently fails on real-world
 * files. Matching on the word sequence instead makes annotations robust
 * for any existing document.
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
  /** The word without edge punctuation, for matching; and how much
   *  punctuation sat at each edge, so a matched range can cover exactly
   *  what the quote named. */
  core: string;
  lead: number;
  trail: number;
}

/** Characters that make a word a word; anything else at an edge is
 *  punctuation as far as matching is concerned. */
const LEAD_PUNCT = /^[^\p{L}\p{N}_]+/u;
const TRAIL_PUNCT = /[^\p{L}\p{N}_]+$/u;

/** A word split into its edge punctuation and the part that matches. */
function wordWithEdges(word: string): { core: string; lead: number; trail: number } {
  const lead = word.match(LEAD_PUNCT)?.[0].length ?? 0;
  // With a leading run, the trailing run can only follow it (a bare
  // punctuation "word" trims to nothing).
  const rest = word.slice(lead);
  const trail = rest.match(TRAIL_PUNCT)?.[0].length ?? 0;
  return { core: word.slice(lead, word.length - trail), lead, trail };
}

/** Words of a text with their local offsets (whitespace-separated). */
function wordsOf(text: string, segIndex: number): WordSpan[] {
  const spans: WordSpan[] = [];
  for (const match of text.matchAll(/\S+/g)) {
    const word = match[0];
    const { core, lead, trail } = wordWithEdges(word);
    spans.push({
      segIndex,
      start: match.index,
      end: match.index + word.length,
      word,
      core,
      lead,
      trail,
    });
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
  // A quote taken from a selection ends wherever the person stopped
  // dragging, so its edge words may stop short of the document's
  // punctuation ("jugs" for "jugs,"). Matching compares the words with
  // edge punctuation ignored; the range keeps the punctuation the quote
  // itself carried and skips the rest.
  const words = quote.split(/\s+/).filter(Boolean).map(wordWithEdges).filter((w) => w.core);
  if (words.length === 0) return null;

  const spans = segments.flatMap((seg, i) => wordsOf(seg.text, i));
  outer: for (let i = 0; i + words.length <= spans.length; i++) {
    for (let j = 0; j < words.length; j++) {
      if (spans[i + j].core !== words[j].core) continue outer;
    }
    const first = spans[i];
    const last = spans[i + words.length - 1];
    const from = segments[first.segIndex].pmFrom + first.start + (words[0].lead > 0 ? 0 : first.lead);
    const to =
      segments[last.segIndex].pmFrom + last.end - (words[words.length - 1].trail > 0 ? 0 : last.trail);
    return { from: Math.min(from, docSize), to: Math.min(to, docSize) };
  }
  return null;
}
