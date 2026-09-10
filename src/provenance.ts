/**
 * Authorship: which revision introduced each word of the current text.
 * Walks the archived revisions oldest to newest with the word diff, so a
 * word keeps the origin of the revision that added it until it is
 * removed. Pure and DOM-free; mapping onto the ProseMirror document lives
 * in src/provview.ts. See docs/superpowers/specs/2026-09-11-authorship-design.md.
 */

import { diffWords } from "./diff";

/** Who wrote a revision: an agent rewrite on disk (`external`), the first
 *  rewrite after "changes requested" (`revision`), a Folio save (`folio`),
 *  or the state of the file when it was first opened (`unknown`). */
export type Origin = "external" | "revision" | "folio" | "unknown";

export interface Attributed {
  text: string;
  origin: Origin;
}

export interface RevisionText {
  rendered: string;
  origin: Origin;
  /** Set when the archive came from Rust; the attribution ignores them. */
  seq?: number;
  archived_at?: number;
  feedback?: string | null;
}

/** Re-attribute `previous` (attributed text) to `next` text: unchanged
 *  tokens keep their origin, added tokens take `origin`. */
function step(previous: Attributed[], next: string, origin: Origin): Attributed[] {
  const oldText = previous.map((s) => s.text).join("");
  const ops = diffWords(oldText, next);
  const out: Attributed[] = [];
  // Cursor into `previous` by character offset.
  let span = 0;
  let offsetInSpan = 0;
  const take = (length: number): void => {
    let remaining = length;
    while (remaining > 0 && span < previous.length) {
      const available = previous[span].text.length - offsetInSpan;
      const n = Math.min(available, remaining);
      push(out, previous[span].text.slice(offsetInSpan, offsetInSpan + n), previous[span].origin);
      offsetInSpan += n;
      remaining -= n;
      if (offsetInSpan === previous[span].text.length) {
        span++;
        offsetInSpan = 0;
      }
    }
  };
  const skip = (length: number): void => {
    let remaining = length;
    while (remaining > 0 && span < previous.length) {
      const available = previous[span].text.length - offsetInSpan;
      const n = Math.min(available, remaining);
      offsetInSpan += n;
      remaining -= n;
      if (offsetInSpan === previous[span].text.length) {
        span++;
        offsetInSpan = 0;
      }
    }
  };
  for (const op of ops) {
    if (op.kind === "same") take(op.text.length);
    else if (op.kind === "remove") skip(op.text.length);
    else push(out, op.text, origin);
  }
  return out;
}

function push(out: Attributed[], text: string, origin: Origin): void {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && last.origin === origin) last.text += text;
  else out.push({ text, origin });
}

/**
 * Attribute the words of `live` (the current rendered text) given the
 * archived revisions in order, oldest first. Whatever `live` adds beyond
 * the newest revision is the reviewer's own typing.
 */
export function attribute(revisions: RevisionText[], live: string): Attributed[] {
  let spans: Attributed[] = [];
  for (const revision of revisions) {
    spans =
      spans.length === 0
        ? revision.rendered
          ? [{ text: revision.rendered, origin: revision.origin }]
          : []
        : step(spans, revision.rendered, revision.origin);
  }
  return smooth(step(spans, live, "folio"));
}

/** Whitespace has no author: a space the diff happened to match between
 *  two words of one origin joins them rather than splitting the run. */
function smooth(spans: Attributed[]): Attributed[] {
  const out: Attributed[] = [];
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    const prev = out[out.length - 1];
    const next = spans[i + 1];
    if (/^\s+$/.test(span.text) && prev && next && prev.origin === next.origin) {
      prev.text += span.text;
      continue;
    }
    if (prev && prev.origin === span.origin) prev.text += span.text;
    else out.push({ ...span });
  }
  return out;
}
