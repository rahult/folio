/**
 * The window's half of the review gate: given the handshake state written
 * by `folio review --wait` (see src-tauri/src/reviewgate.rs), decide whether
 * the review bar shows, what it says, and which verdict button leads.
 * Pure and DOM-free so the model is unit-testable.
 */

export type ReviewState = "waiting" | "approved" | "changes";

/** The two decisions a reviewer can send back. */
export type Verdict = "approved" | "changes";

/** Mirrors `ReviewRequest` in src-tauri/src/reviewgate.rs exactly. */
export interface ReviewRequest {
  path: string;
  agent: string;
  pid: number;
  requestedAt: string;
  state: ReviewState;
  decidedAt: string | null;
  feedback: string | null;
  documentEdited: boolean;
}

export interface BarModel {
  readonly visible: boolean;
  readonly label: string;
  /** Which button gets visual weight — follows the annotation count. */
  readonly primary: Verdict;
}

const HIDDEN: BarModel = Object.freeze({ visible: false, label: "", primary: "approved" });

/**
 * The bar exists only while an agent is actually blocked: a decided request
 * (or none at all) leaves the window free of review chrome.
 *
 * Always returns a fresh object — never `HIDDEN` by reference — so a caller
 * that mutates one `BarModel` can't corrupt the shared hidden sentinel for
 * every subsequent hidden call.
 */
export function barModel(request: ReviewRequest | null, annotationCount: number): BarModel {
  if (request === null || request.state !== "waiting") return { ...HIDDEN };
  const count =
    annotationCount === 0
      ? "no annotations"
      : `${annotationCount} annotation${annotationCount === 1 ? "" : "s"}`;
  return {
    visible: true,
    label: `${request.agent} waiting · ${count}`,
    primary: annotationCount > 0 ? "changes" : "approved",
  };
}

/**
 * A reviewer may answer by editing the document rather than annotating it.
 * The agent has no way to notice that on its own, so say it plainly.
 */
export function feedbackWithEditNote(feedback: string, documentEdited: boolean): string {
  if (!documentEdited) return feedback;
  return `${feedback.trimEnd()}\n\n---\n\nThe reviewer edited the document directly during this review — re-read the file before acting on this feedback.\n`;
}
