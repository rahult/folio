/**
 * Link classification for in-app navigation: Markdown links between
 * documents open inside Folio (with back/forward history); everything
 * else — web URLs, mailto, non-Markdown files — goes to the OS default
 * application. Pure and DOM-free so it is unit-testable.
 */

import { isMarkdownPath } from "./markdown";

export type LinkTarget =
  | { kind: "markdown"; path: string }
  | { kind: "external-url"; url: string }
  | { kind: "external-path"; path: string }
  | { kind: "anchor" }
  | { kind: "invalid" };

/** Collapse "." and ".." segments (POSIX-style; backslashes pre-normalized). */
export function normalizePath(path: string): string {
  const isAbsolute = path.startsWith("/");
  const out: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (out.length > 0) out.pop();
      continue;
    }
    out.push(part);
  }
  const joined = out.join("/");
  return isAbsolute ? `/${joined}` : joined;
}

/** Resolve a relative href against the file it appears in. */
export function resolveRelativePath(baseFilePath: string, href: string): string {
  const normalized = href.replace(/\\/g, "/");
  if (normalized.startsWith("/")) return normalizePath(normalized);
  const base = baseFilePath.replace(/\\/g, "/");
  const baseDir = base.includes("/") ? base.slice(0, base.lastIndexOf("/")) : "";
  return normalizePath(baseDir ? `${baseDir}/${normalized}` : normalized);
}

/**
 * Decide where a link goes. Anchors within the document are left to the
 * editor; relative links from an untitled document cannot be resolved.
 */
export function classifyLink(href: string, currentFilePath: string | null): LinkTarget {
  if (!href) return { kind: "invalid" };
  if (href.startsWith("#")) return { kind: "anchor" };

  const schemeMatch = /^[a-z][a-z0-9+.-]*:/i.exec(href);
  if (schemeMatch && !href.toLowerCase().startsWith("file://")) {
    return { kind: "external-url", url: href };
  }

  const rawPath = href.toLowerCase().startsWith("file://") ? href.slice(7) : href;
  const clean = rawPath.split("#")[0].split("?")[0];
  if (!clean) return { kind: "anchor" };
  // Relative links from an untitled document cannot be resolved.
  if (currentFilePath === null && !clean.replace(/\\/g, "/").startsWith("/")) {
    return { kind: "invalid" };
  }

  const path = resolveRelativePath(currentFilePath ?? "", clean);
  return isMarkdownPath(path) ? { kind: "markdown", path } : { kind: "external-path", path };
}
