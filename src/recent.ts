/**
 * Recent-files list persisted in localStorage and mirrored into the native
 * File → Open Recent submenu. Pure logic (load/add/save) so it is
 * unit-testable without Tauri.
 */

const STORAGE_KEY = "folio-recent-files";
const MAX_RECENT = 10;

/** Read the persisted list (empty array on missing/corrupt data). */
export function loadRecent(storage: Storage = localStorage): string[] {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p): p is string => typeof p === "string").slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

/** Prepend a path, deduplicated and capped (newest first). */
export function addRecent(list: string[], path: string, max = MAX_RECENT): string[] {
  return [path, ...list.filter((p) => p !== path)].slice(0, max);
}

/** Persist the list. */
export function saveRecent(list: string[], storage: Storage = localStorage): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
}
