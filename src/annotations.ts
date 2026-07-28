/**
 * Review annotations on a document being reviewed (e.g. an agent-written
 * plan): select text, then comment on it, mark it for deletion, or suggest
 * a replacement. Annotations persist in an embedded SQLite database (see
 * src-tauri) so they survive sessions, reloads, and webview data clears;
 * the localStorage helpers here remain only to migrate annotations written
 * by pre-SQLite builds. Pure and DOM-free so the model is unit-testable.
 */

export type AnnotationKind = "comment" | "delete" | "replace";

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
        ["comment", "delete", "replace"].includes((a as Annotation).kind),
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

/**
 * Serialize annotations into structured Markdown feedback an agent can act
 * on directly: a verdict, then one numbered instruction per annotation with
 * the quoted context. With no annotations the verdict is approval.
 */
export function buildFeedback(fileName: string, annotations: Annotation[]): string {
  const lines: string[] = [`# Review feedback: ${fileName}`, ""];
  if (annotations.length === 0) {
    lines.push("Verdict: **approved** — no changes requested.", "");
    return lines.join("\n");
  }
  lines.push(
    `Verdict: **changes requested** (${annotations.length} annotation${annotations.length === 1 ? "" : "s"})`,
    "",
  );
  annotations.forEach((a, i) => {
    const quote = oneLine(a.quote);
    if (a.kind === "comment") {
      lines.push(`## ${i + 1}. Comment on "${quote}"`, "", `> ${quote}`, "", a.body, "");
    } else if (a.kind === "delete") {
      lines.push(`## ${i + 1}. Delete "${quote}"`, "", `> ${quote}`, "", "Remove this section.", "");
    } else {
      lines.push(
        `## ${i + 1}. Replace "${quote}"`,
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
  return lines.join("\n");
}
