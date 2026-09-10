/**
 * Wikilinks: `[[target]]`, `[[target#Heading]]`, `[[target|label]]`,
 * resolved against the project's Markdown files, plus heading anchors for
 * `file.md#heading` links. Pure and DOM-free; rendering lives in
 * src/wikiview.ts and navigation in main.ts.
 */

import type { OutlineEntry } from "./outline";
import { fuzzyScore } from "./quickopen";

export interface WikilinkSpan {
  /** Offset of the opening `[[`. */
  start: number;
  /** Offset just past the closing `]]`. */
  end: number;
  raw: string;
}

const WIKILINK = /\[\[([^\[\]\n]+?)\]\]/g;

export function findWikilinks(text: string): WikilinkSpan[] {
  const out: WikilinkSpan[] = [];
  for (const m of text.matchAll(WIKILINK)) {
    if (!m[1].trim()) continue;
    out.push({ start: m.index, end: m.index + m[0].length, raw: m[1] });
  }
  return out;
}

export interface ParsedWikilink {
  target: string;
  anchor: string | null;
  label: string;
}

export function parseWikilink(raw: string): ParsedWikilink {
  const [body, label] = raw.split("|", 2);
  const hash = body.indexOf("#");
  const target = (hash === -1 ? body : body.slice(0, hash)).trim();
  const anchor = hash === -1 ? null : body.slice(hash + 1).trim() || null;
  return { target, anchor, label: (label ?? body).trim() };
}

const MD_EXT = /\.(md|markdown|mdown|mkd)$/i;

function stem(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return name.replace(MD_EXT, "");
}

/** The project file a wikilink target names: exact path, exact file
 *  name (case-insensitive), then the best fuzzy match; null if none. */
export function resolveWikilink(target: string, files: string[]): string | null {
  const t = target.replace(/\\/g, "/").replace(/^\.\//, "").trim();
  if (!t) return null;
  const lower = t.toLowerCase();
  const asPath = files.find((f) => f.toLowerCase() === lower || f.replace(MD_EXT, "").toLowerCase() === lower);
  if (asPath) return asPath;
  const byName = files.filter((f) => stem(f).toLowerCase() === lower);
  if (byName.length > 0) {
    // Shortest path wins ties: the file nearest the root.
    return byName.sort((a, b) => a.length - b.length)[0];
  }
  let best: { file: string; score: number } | null = null;
  for (const file of files) {
    const score = fuzzyScore(t, file);
    if (score !== null && (best === null || score > best.score)) best = { file, score };
  }
  return best?.file ?? null;
}

/** GitHub-style heading slug. */
export function slugify(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s/g, "-");
}

/** Outline index for an anchor: by slug, by exact text, or by the first
 *  heading whose slug starts with it. -1 when nothing matches. */
export function headingForAnchor(outline: OutlineEntry[], anchor: string): number {
  const want = slugify(decodeURIComponent(anchor));
  if (!want) return -1;
  const exact = outline.find((e) => slugify(e.text) === want);
  if (exact) return exact.index;
  const prefix = outline.find((e) => slugify(e.text).startsWith(want));
  return prefix ? prefix.index : -1;
}
