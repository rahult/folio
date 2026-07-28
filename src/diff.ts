/**
 * Word-level diff used by the review workflow: when a watched file is
 * rewritten on disk (e.g. by a coding agent), the reload highlights what
 * changed. Pure and DOM-free so it is unit-testable; mapping onto the
 * ProseMirror document lives in src/diffview.ts and src/main.ts.
 */

export type DiffKind = "same" | "add" | "remove";

export interface DiffOp {
  kind: DiffKind;
  /** Exact text covered by this op; concatenating all ops in order yields
   *  the new text for same/add and the old text for same/remove. */
  text: string;
}

/** Split into word and whitespace tokens (concatenation is lossless). */
function tokenize(text: string): string[] {
  return text.split(/(\s+)/).filter((token) => token.length > 0);
}

/** LCS table size above which we give up on alignment and report the whole
 *  middle as changed (pathological rewrites of huge documents). */
const MAX_LCS_CELLS = 4_000_000;

/** Longest-common-subsequence diff over the token middle. */
function lcsDiff(a: string[], b: string[]): DiffOp[] {
  const n = a.length;
  const m = b.length;
  if (n === 0 && m === 0) return [];
  if (n === 0) return [{ kind: "add", text: b.join("") }];
  if (m === 0) return [{ kind: "remove", text: a.join("") }];
  if (n * m > MAX_LCS_CELLS) {
    return [
      { kind: "remove", text: a.join("") },
      { kind: "add", text: b.join("") },
    ];
  }

  // lengths[i][j] = LCS length of a[i:] and b[j:]
  const lengths: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lengths[i][j] =
        a[i] === b[j]
          ? lengths[i + 1][j + 1] + 1
          : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }

  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  const push = (kind: DiffKind, token: string) => {
    const last = ops[ops.length - 1];
    if (last && last.kind === kind) last.text += token;
    else ops.push({ kind, text: token });
  };
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push("same", a[i]);
      i++;
      j++;
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
      push("remove", a[i]);
      i++;
    } else {
      push("add", b[j]);
      j++;
    }
  }
  while (i < n) push("remove", a[i++]);
  while (j < m) push("add", b[j++]);
  return ops;
}

/** Diff two texts at word granularity. Common prefix/suffix is matched
 *  first so small edits in large documents stay cheap. */
export function diffWords(oldText: string, newText: string): DiffOp[] {
  if (oldText === newText) return [{ kind: "same", text: oldText }];
  const a = tokenize(oldText);
  const b = tokenize(newText);

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  const ops: DiffOp[] = [];
  if (start > 0) ops.push({ kind: "same", text: a.slice(0, start).join("") });
  ops.push(...lcsDiff(a.slice(start, endA), b.slice(start, endB)));
  if (endA < a.length) ops.push({ kind: "same", text: a.slice(endA).join("") });
  return ops;
}
