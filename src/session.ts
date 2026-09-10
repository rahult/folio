/**
 * Session restore: remembers the open file, caret, and scroll position so
 * a relaunch lands where the user left off. Pure serialize/parse helpers;
 * DOM/editor wiring lives in src/main.ts.
 */

const SESSION_KEY = "folio-session";

export interface SessionState {
  /** Absolute path of the active document, or null for untitled. */
  path: string | null;
  /** ProseMirror selection anchor. */
  pos: number;
  /** Editor scroll offset in pixels. */
  scroll: number;
  /** Every open tab's path, in order (untitled tabs are not kept). */
  tabs: string[];
}

/** Read the persisted session (null on missing/corrupt data). */
export function loadSession(storage: Storage = localStorage): SessionState | null {
  try {
    const raw = storage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { path, pos, scroll, tabs } = parsed as Record<string, unknown>;
    const safePath = typeof path === "string" ? path : null;
    const safeTabs = Array.isArray(tabs)
      ? tabs.filter((t): t is string => typeof t === "string")
      : safePath
        ? [safePath]
        : [];
    return {
      path: safePath,
      pos: typeof pos === "number" && pos >= 0 ? pos : 0,
      scroll: typeof scroll === "number" && scroll >= 0 ? scroll : 0,
      tabs: safeTabs,
    };
  } catch {
    return null;
  }
}

/** Persist the session. */
export function saveSession(state: SessionState, storage: Storage = localStorage): void {
  storage.setItem(SESSION_KEY, JSON.stringify(state));
}
