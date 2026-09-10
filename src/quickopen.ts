/**
 * Quick Open (⌘P): fuzzy ranking of the Markdown files under the current
 * project folder, with recent files floated up. Pure and DOM-free; the
 * palette itself lives in main.ts and the file listing comes from Rust.
 */

const NAME_BONUS = 12;
const START_BONUS = 8;
const RUN_BONUS = 5;
const GAP_PENALTY = 1;
const RECENT_BONUS = 30;

/** Subsequence match score, or null when `query` does not match. Higher
 *  is better: matches at word starts, consecutive runs, and inside the
 *  file name score more; gaps cost a little. */
export function fuzzyScore(query: string, candidate: string): number | null {
  // Spaces in the query are for the typist, not the match.
  const q = query.replace(/\s+/g, "").toLowerCase();
  const c = candidate.toLowerCase();
  if (q.length === 0) return 0;
  const nameStart = c.lastIndexOf("/") + 1;
  let score = 0;
  let qi = 0;
  let lastMatch = -2;
  for (let ci = 0; ci < c.length && qi < q.length; ci++) {
    if (c[ci] !== q[qi]) continue;
    const prev = ci > 0 ? c[ci - 1] : "/";
    const atStart = ci === 0 || /[\/\-_. ]/.test(prev);
    score += 1;
    if (atStart) score += START_BONUS;
    if (ci === lastMatch + 1) score += RUN_BONUS;
    if (ci >= nameStart) score += NAME_BONUS;
    if (lastMatch >= 0 && ci > lastMatch + 1) score -= Math.min(GAP_PENALTY * (ci - lastMatch - 1), 6);
    lastMatch = ci;
    qi++;
  }
  if (qi < q.length) return null;
  // Shorter candidates win ties.
  return score - c.length / 100;
}

/** The best `limit` files for `query`. With no query, recents come first
 *  (most recent first) and then everything else in the given order. */
export function rankFiles(query: string, files: string[], recents: string[], limit: number): string[] {
  if (query.trim() === "") {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of recents) if (files.includes(r) && !seen.has(r)) { seen.add(r); out.push(r); }
    for (const f of files) if (!seen.has(f)) { seen.add(f); out.push(f); }
    return out.slice(0, limit);
  }
  const recentRank = new Map(recents.map((r, i) => [r, i]));
  const scored: { file: string; score: number }[] = [];
  for (const file of files) {
    const s = fuzzyScore(query, file);
    if (s === null) continue;
    const rank = recentRank.get(file);
    scored.push({ file, score: s + (rank === undefined ? 0 : RECENT_BONUS - rank) });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.file);
}
