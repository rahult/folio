/**
 * The review ledger: which change requests a revision actually addressed.
 * A "revision" archive carries the feedback that caused it; this parses
 * that feedback back into requests and checks each quoted passage against
 * the revision's text. Pure and DOM-free.
 */

import type { Origin } from "./provenance";

export type RequestKind = "comment" | "delete" | "replace";

export interface ChangeRequest {
  kind: RequestKind;
  quote: string;
}

export interface RequestOutcome extends ChangeRequest {
  /** The quoted passage no longer appears unchanged in the revision. For a
   *  delete or replace that is the request done; for a comment it only
   *  says the passage moved, which is all the text can tell. */
  changed: boolean;
}

const HEADING = /^## \d+\. (Comment on|Delete|Replace) (?:L\d+(?:–\d+)? )?"(.+)"$/;

/** The change requests in a feedback file, in order (Keep as is entries
 *  are not requests and are skipped). */
export function parseFeedback(feedback: string): ChangeRequest[] {
  const requests: ChangeRequest[] = [];
  for (const line of feedback.split("\n")) {
    const match = HEADING.exec(line.trimEnd());
    if (!match) continue;
    const kind: RequestKind =
      match[1] === "Comment on" ? "comment" : match[1] === "Delete" ? "delete" : "replace";
    requests.push({ kind, quote: match[2] });
  }
  return requests;
}

/** Word cores of a text, in order (punctuation and inline marks dropped). */
function words(text: string): string[] {
  return text
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter(Boolean);
}

function containsWords(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0) return false;
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

/** Each request with whether `after` (the revision's text) still contains
 *  the quoted passage unchanged. Feedback quotes are already one-line and
 *  may be truncated with an ellipsis; only the words before it are used. */
export function requestOutcomes(requests: ChangeRequest[], after: string): RequestOutcome[] {
  const hay = words(after);
  return requests.map((request) => {
    const needle = words(request.quote.replace(/…$/, ""));
    return { ...request, changed: !containsWords(hay, needle) };
  });
}

export function revisionLabel(origin: Origin): string {
  switch (origin) {
    case "external":
      return "agent rewrite";
    case "revision":
      return "revised after your feedback";
    case "folio":
      return "your save";
    default:
      return "as opened";
  }
}
