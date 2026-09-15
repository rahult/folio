// The path menu a macOS title shows on ⌘-click: the document, then each
// folder that contains it, up to the root. Choosing an entry reveals it in
// the file manager; for a folder that means opening the folder with the next
// item on the way to the document selected, as Finder does.

export interface PathMenuEntry {
  /** What the menu shows: the file or folder name, or the root. */
  label: string;
  /** What to reveal when chosen. */
  reveal: string;
}

export function pathMenuEntries(path: string): PathMenuEntry[] {
  if (!path) return [];
  const windows = /^[A-Za-z]:[\\/]/.test(path);
  const sep = windows ? "\\" : "/";
  const parts = path.split(/[\\/]+/).filter((p) => p !== "");
  // `prefix(n)` is the path made of the first n parts.
  const prefix = (n: number): string =>
    windows ? parts.slice(0, n).join(sep) : sep + parts.slice(0, n).join(sep);
  const full = prefix(parts.length);
  const entries: PathMenuEntry[] = [{ label: parts[parts.length - 1], reveal: full }];
  // Each folder, innermost first. Revealing the child selects it inside the folder.
  for (let n = parts.length - 1; n >= 1; n--) {
    const isDrive = windows && n === 1;
    if (isDrive) continue;
    entries.push({ label: parts[n - 1], reveal: prefix(n + 1) });
  }
  // The root: "/" on Unix, the drive ("C:") on Windows.
  if (windows) {
    entries.push({ label: parts[0], reveal: prefix(2) });
  } else {
    entries.push({ label: "/", reveal: prefix(1) });
  }
  return entries;
}

export interface ClickLike {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/** ⌘-click on macOS, Ctrl-click elsewhere: a primary click with only that modifier. */
export function isPathMenuClick(e: ClickLike, mac: boolean): boolean {
  if (e.button !== 0 || e.altKey || e.shiftKey) return false;
  return mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
}
