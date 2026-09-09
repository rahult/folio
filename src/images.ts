/**
 * Image source resolution for the rendered page. Markdown keeps whatever
 * the author wrote (`![alt](img/a.png)`); the webview cannot load that
 * because relative URLs resolve against the app origin, not the file. This
 * maps a local image reference to an absolute filesystem path so the
 * caller can hand it to Tauri's asset protocol. Pure and DOM-free.
 */

import { resolveRelativePath } from "./links";

/**
 * Absolute filesystem path for a local image reference, or null when the
 * src is remote, inline (data:/blob:), empty, or relative to an untitled
 * document that has no folder to resolve against.
 */
export function localImagePath(src: string, filePath: string | null): string | null {
  if (!src) return null;
  let raw = src;
  if (/^file:\/\//i.test(raw)) {
    raw = raw.slice("file://".length);
  } else if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    return null; // http(s), data, blob, mailto, …
  }
  raw = safeDecode(raw.split("#")[0].split("?")[0]);
  const isAbsolute = raw.replace(/\\/g, "/").startsWith("/");
  if (!isAbsolute && filePath === null) return null;
  return resolveRelativePath(filePath ?? "", raw);
}

/** The src an <img> should display: local files go through `toAssetUrl`,
 *  everything else is left exactly as written. */
export function resolveImageSrc(
  src: string,
  filePath: string | null,
  toAssetUrl: (path: string) => string,
): string {
  const path = localImagePath(src, filePath);
  return path === null ? src : toAssetUrl(path);
}

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}
