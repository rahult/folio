/**
 * The ⌘K palette: Markdown files in the project and every menu command, in
 * one list. Pure and DOM-free; the palette element lives in main.ts, the
 * file listing and the command list come from Rust.
 */

import { fuzzyScore, rankFiles } from "./quickopen";

/** A native menu command the palette can run. */
export interface PaletteCommand {
  /** The menu item id, as `actionForMenuId` understands it. */
  id: string;
  label: string;
  /** Where it lives in the menu bar, e.g. "View › Themes". */
  group: string;
  /** The accelerator as the menu declares it ("Shift+CmdOrCtrl+S"), or null. */
  shortcut: string | null;
}

export type PaletteItem = { kind: "file"; rel: string } | { kind: "command"; command: PaletteCommand };

const MAC_SYMBOL: Record<string, string> = { Ctrl: "⌃", Alt: "⌥", Shift: "⇧", CmdOrCtrl: "⌘", Cmd: "⌘", Super: "⌘" };
/** macOS lists modifiers as ⌃ ⌥ ⇧ ⌘, whatever order the accelerator uses. */
const MAC_ORDER = ["⌃", "⌥", "⇧", "⌘"];

/** An accelerator as people read it: "⇧⌘S" on macOS, "Ctrl+Shift+S" elsewhere. */
export function formatShortcut(accelerator: string | null, mac: boolean): string {
  if (!accelerator) return "";
  const parts = accelerator.split("+");
  // A trailing "+" key (e.g. "CmdOrCtrl++") splits into empty strings.
  const key = parts[parts.length - 1] === "" ? "+" : parts[parts.length - 1];
  const mods = parts.slice(0, parts[parts.length - 1] === "" ? -2 : -1);
  if (mac) {
    const symbols = mods.map((m) => MAC_SYMBOL[m] ?? m);
    symbols.sort((a, b) => MAC_ORDER.indexOf(a) - MAC_ORDER.indexOf(b));
    return symbols.join("") + key.toUpperCase();
  }
  const names = mods.map((m) => (m === "CmdOrCtrl" || m === "Cmd" ? "Ctrl" : m === "Super" ? "Win" : m));
  names.sort((a, b) => ["Ctrl", "Alt", "Shift", "Win"].indexOf(a) - ["Ctrl", "Alt", "Shift", "Win"].indexOf(b));
  return [...names, key.toUpperCase()].join("+");
}

/** What a command is matched against: its menu, then its label, so the
 *  label gets the name bonus `fuzzyScore` gives the part after a slash. */
function commandText(c: PaletteCommand): string {
  return `${c.group}/${c.label}`;
}

/**
 * The palette's list. With no query: files (recent first), then commands in
 * menu order. With a query: every match of either kind, best first.
 */
export function rankPalette(
  query: string,
  files: string[],
  recents: string[],
  commands: PaletteCommand[],
  limits: { files: number; commands: number },
): PaletteItem[] {
  if (query.trim() === "") {
    return [
      ...rankFiles("", files, recents, limits.files).map((rel): PaletteItem => ({ kind: "file", rel })),
      ...commands.slice(0, limits.commands).map((command): PaletteItem => ({ kind: "command", command })),
    ];
  }
  const scored: { item: PaletteItem; score: number }[] = [];
  for (const rel of rankFiles(query, files, recents, limits.files)) {
    scored.push({ item: { kind: "file", rel }, score: fuzzyScore(query, rel) ?? 0 });
  }
  const commandMatches: { item: PaletteItem; score: number }[] = [];
  for (const command of commands) {
    const s = fuzzyScore(query, commandText(command));
    if (s !== null) commandMatches.push({ item: { kind: "command", command }, score: s });
  }
  commandMatches.sort((a, b) => b.score - a.score);
  scored.push(...commandMatches.slice(0, limits.commands));
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.item);
}

/** What ⌘K does: make a link from selected document text, otherwise open
 *  the palette. Source mode and Settings have no document selection to link. */
export function commandKIntent(state: { selectionEmpty: boolean; sourceMode: boolean; settingsOpen: boolean }): "link" | "palette" {
  return !state.selectionEmpty && !state.sourceMode && !state.settingsOpen ? "link" : "palette";
}
