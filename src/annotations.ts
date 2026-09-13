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
