/**
 * Review annotations on a document being reviewed (e.g. an agent-written
 * plan): select text, then comment on it, mark it for deletion, or suggest
 * a replacement. Annotations persist in an embedded SQLite database (see
 * src-tauri) so they survive sessions, reloads, and webview data clears;
 * the localStorage helpers here remain only to migrate annotations written
 * by pre-SQLite builds. Pure and DOM-free so the model is unit-testable.
 */

export type AnnotationKind = "comment" | "delete" | "replace" | "approve";

/** Kinds that ask the agent to change something; `approve` says keep it. */
export function isChangeRequest(kind: AnnotationKind): boolean {
  return kind !== "approve";
}

export interface Annotation {
  /** Stable id (position-independent so edits and reloads keep it). */
  id: string;
  kind: AnnotationKind;
  /** The selected text the annotation refers to (context for the agent). */
  quote: string;
  /** Comment text; for "replace", the suggested replacement. Empty for "delete". */
  body: string;
  /** ISO timestamp. */
  createdAt: string;
}

const storageKey = (path: string): string => `folio-annotations:${path}`;

/** Read the persisted annotations for a file (empty on missing/corrupt). */
export function loadAnnotations(path: string, storage: Storage = localStorage): Annotation[] {
  try {
    const raw = storage.getItem(storageKey(path));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (a): a is Annotation =>
        typeof a === "object" &&
        a !== null &&
        typeof (a as Annotation).id === "string" &&
        typeof (a as Annotation).quote === "string" &&
        typeof (a as Annotation).body === "string" &&
        ["comment", "delete", "replace", "approve"].includes((a as Annotation).kind),
    );
  } catch {
    return [];
  }
}

/** Persist the full annotation list for a file. */
export function saveAnnotations(
  path: string,
  annotations: Annotation[],
  storage: Storage = localStorage,
): void {
  storage.setItem(storageKey(path), JSON.stringify(annotations));
}

let nextId = 1;

/** Create an annotation with a unique id. */
export function makeAnnotation(
  kind: AnnotationKind,
  quote: string,
  body: string,
  now: string = new Date().toISOString(),
): Annotation {
  return {
    id: `a${Date.now().toString(36)}-${(nextId++).toString(36)}`,
    kind,
    quote,
    body,
    createdAt: now,
  };
}

/** Collapse whitespace for compact one-line quotes in feedback. */
function oneLine(text: string, max = 72): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > max ? `${collapsed.slice(0, max - 1)}…` : collapsed;
}

export interface LineRange {
  startLine: number;
  endLine: number;
}

/**
 * Where a quote sits in the on-disk text, as 1-based inclusive lines.
 * Matched on the word sequence (like `findQuoteRange`) so wrapping, mark
 * splits, and whitespace differences don't matter. Null when absent.
 */
export function locateQuote(sourceText: string, quote: string): LineRange | null {
  const needle = quote.split(/\s+/).map(wordCore).filter(Boolean);
  if (needle.length === 0) return null;
  const words: { word: string; line: number }[] = [];
  sourceText.split("\n").forEach((line, i) => {
    for (const match of line.matchAll(/\S+/g)) {
      if (MARKDOWN_MARKER.test(match[0])) continue;
      const core = wordCore(match[0]);
      if (core) words.push({ word: core, line: i + 1 });
    }
  });
  outer: for (let i = 0; i + needle.length <= words.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (words[i + j].word !== needle[j]) continue outer;
    }
    return { startLine: words[i].line, endLine: words[i + needle.length - 1].line };
  }
  return null;
}

/** Block-level syntax that the rendered text never contains: list
 *  bullets and numbers, heading hashes, quote bars, task checkboxes. */
const MARKDOWN_MARKER = /^(?:[-*+>]|#{1,6}|\d+[.)]|\[[ xX]\])$/;

/** A word stripped of surrounding punctuation (`**bold**,` → `bold`), so
 *  inline marks and sentence punctuation don't break the match. */
function wordCore(word: string): string {
  return word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

/** "L12 " or "L12–14 " for a heading, or "" when unknown. */
function lineRef(sourceText: string | undefined, quote: string): string {
  if (sourceText === undefined) return "";
  const range = locateQuote(sourceText, quote);
  if (!range) return "";
  return range.startLine === range.endLine
    ? `L${range.startLine} `
    : `L${range.startLine}–${range.endLine} `;
}

/**
 * Serialize annotations into structured Markdown feedback an agent can act
 * on directly: a verdict, one numbered instruction per change request with
 * the quoted context (and its line range when `sourceText`, the on-disk
 * file, is given), then the passages marked as good under "Keep as is".
 * With no change requests the verdict is approval.
 */
export function buildFeedback(
  fileName: string,
  annotations: Annotation[],
  sourceText?: string,
): string {
  const changes = annotations.filter((a) => isChangeRequest(a.kind));
  const keeps = annotations.filter((a) => !isChangeRequest(a.kind));
  const lines: string[] = [`# Review feedback: ${fileName}`, ""];
  if (changes.length === 0) {
    lines.push("Verdict: **approved** — no changes requested.", "");
  } else {
    lines.push(
      `Verdict: **changes requested** (${changes.length} annotation${changes.length === 1 ? "" : "s"})`,
      "",
    );
  }
  changes.forEach((a, i) => {
    const quote = oneLine(a.quote);
    const at = lineRef(sourceText, a.quote);
    if (a.kind === "comment") {
      lines.push(`## ${i + 1}. Comment on ${at}"${quote}"`, "", `> ${quote}`, "", a.body, "");
    } else if (a.kind === "delete") {
      lines.push(`## ${i + 1}. Delete ${at}"${quote}"`, "", `> ${quote}`, "", "Remove this section.", "");
    } else {
      lines.push(
        `## ${i + 1}. Replace ${at}"${quote}"`,
        "",
        `> ${quote}`,
        "",
        "Suggested replacement:",
        "",
        a.body,
        "",
      );
    }
  });
  if (keeps.length > 0) {
    lines.push("## Keep as is", "");
    for (const a of keeps) lines.push(`- ${lineRef(sourceText, a.quote)}"${oneLine(a.quote)}"`);
    lines.push("");
  }
  return lines.join("\n");
}
