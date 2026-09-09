/**
 * The browser half of export rendering: the hooks `renderExportHtml`
 * calls for anything that needs the app runtime — the editor's Lezer
 * grammars for syntax highlighting, Mermaid for diagrams, and the asset
 * protocol for embedding local images. See src/exportrender.ts.
 */

import { LanguageDescription } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { classHighlighter, highlightCode } from "@lezer/highlight";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { ExportHooks } from "./exportrender";
import { localImagePath } from "./images";
import { renderMermaidDiagram } from "./mermaid";

function escapeText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&#x3C;").replace(/>/g, "&#x3E;");
}

/** Highlight with the same grammars the editor loads, emitting `tok-*`
 *  classes (styled in src/export.css). Unknown languages decline. */
export async function highlightWithLezer(code: string, language: string): Promise<string | null> {
  const description = LanguageDescription.matchLanguageName(languages, language, true);
  if (!description) return null;
  const support = await description.load();
  const tree = support.language.parser.parse(code);
  let html = "";
  highlightCode(
    code,
    tree,
    classHighlighter,
    (text, classes) => {
      html += classes ? `<span class="${classes}">${escapeText(text)}</span>` : escapeText(text);
    },
    () => {
      html += "\n";
    },
  );
  return html;
}

/** Mermaid source → inline SVG markup (null on parse errors). */
export async function renderMermaidSvg(code: string): Promise<string | null> {
  const el = await renderMermaidDiagram(code);
  return el ? el.innerHTML : null;
}

/** Read a local image through the asset protocol and return it as a data
 *  URI so the export is self-contained. Remote and unresolvable srcs are
 *  left alone. */
export async function embedLocalImage(src: string, filePath: string | null): Promise<string | null> {
  const path = localImagePath(src, filePath);
  if (path === null) return null;
  const response = await fetch(convertFileSrc(path));
  if (!response.ok) return null;
  const blob = await response.blob();
  // Belt and braces with the extension check: never embed a non-image.
  if (!blob.type.startsWith("image/")) return null;
  return blobToDataUrl(blob);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Hooks for a document at `filePath` (null for untitled). */
export function exportHooksFor(filePath: string | null): ExportHooks {
  return {
    highlight: highlightWithLezer,
    mermaid: renderMermaidSvg,
    image: (src) => embedLocalImage(src, filePath),
  };
}

const EXPORT_FONT_FILES = /(newsreader-latin-wght-(normal|italic)|instrument-sans-latin-wght-normal|jetbrains-mono-latin-wght-normal)\.woff2/;

let fontCssPromise: Promise<string> | null = null;

/**
 * The app's @font-face rules for the latin subsets of its three typefaces,
 * with each font file inlined as a data URI (≈190 KB of woff2). Computed
 * once per session; an empty string if the fonts cannot be read, in which
 * case the export falls back to the stacks' system fonts.
 */
export function collectExportFonts(): Promise<string> {
  fontCssPromise ??= buildFontCss().catch(() => "");
  return fontCssPromise;
}

async function buildFontCss(): Promise<string> {
  const rules: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let cssRules: CSSRuleList;
    try {
      cssRules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of Array.from(cssRules)) {
      if (!(rule instanceof CSSFontFaceRule)) continue;
      const url = /url\(["']?([^"')]+)["']?\)/.exec(rule.style.getPropertyValue("src"))?.[1];
      if (!url || !EXPORT_FONT_FILES.test(url)) continue;
      const response = await fetch(url);
      if (!response.ok) continue;
      const dataUrl = await blobToDataUrl(await response.blob());
      rules.push(rule.cssText.replace(/url\(["']?[^"')]+["']?\)/, `url("${dataUrl}")`));
    }
  }
  return rules.join("\n");
}
