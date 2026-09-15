import { describe, expect, it } from "vitest";
import { commandKIntent, formatShortcut, rankPalette, type PaletteCommand } from "../src/palette";

describe("formatShortcut", () => {
  it("writes macOS symbols in the system order", () => {
    expect(formatShortcut("CmdOrCtrl+K", true)).toBe("⌘K");
    expect(formatShortcut("Shift+CmdOrCtrl+S", true)).toBe("⇧⌘S");
    expect(formatShortcut("Alt+CmdOrCtrl+R", true)).toBe("⌥⌘R");
    expect(formatShortcut("Ctrl+Alt+`", true)).toBe("⌃⌥`");
    expect(formatShortcut("Shift+CmdOrCtrl+=", true)).toBe("⇧⌘=");
  });

  it("spells modifiers out elsewhere", () => {
    expect(formatShortcut("CmdOrCtrl+K", false)).toBe("Ctrl+K");
    expect(formatShortcut("Shift+CmdOrCtrl+S", false)).toBe("Ctrl+Shift+S");
  });

  it("is empty without a shortcut", () => {
    expect(formatShortcut(null, true)).toBe("");
  });
});

const commands: PaletteCommand[] = [
  { id: "view.focus-mode", label: "Focus Mode", group: "View", shortcut: null },
  { id: "file.print", label: "Print…", group: "File", shortcut: "CmdOrCtrl+P" },
  { id: "paragraph.heading-1", label: "Heading 1", group: "Paragraph", shortcut: "CmdOrCtrl+1" },
  { id: "view.theme-night", label: "Night", group: "View › Themes", shortcut: null },
];

describe("rankPalette", () => {
  it("shows files first and then commands when nothing is typed", () => {
    const items = rankPalette("", ["a.md", "notes/b.md"], [], commands, { files: 8, commands: 3 });
    expect(items.map((i) => (i.kind === "file" ? i.rel : i.command.id))).toEqual([
      "a.md",
      "notes/b.md",
      "view.focus-mode",
      "file.print",
      "paragraph.heading-1",
    ]);
  });

  it("matches commands by their label and their menu", () => {
    const items = rankPalette("night", [], [], commands, { files: 8, commands: 8 });
    expect(items[0]).toMatchObject({ kind: "command", command: { id: "view.theme-night" } });
    const themes = rankPalette("themes", [], [], commands, { files: 8, commands: 8 });
    expect(themes.map((i) => (i.kind === "command" ? i.command.id : ""))).toContain("view.theme-night");
  });

  it("puts the better match first, whichever kind it is", () => {
    const items = rankPalette("print", ["notes/pricing.md"], [], commands, { files: 8, commands: 8 });
    expect(items[0]).toMatchObject({ kind: "command", command: { id: "file.print" } });
    const files = rankPalette("plan", ["plan.md"], [], commands, { files: 8, commands: 8 });
    expect(files[0]).toMatchObject({ kind: "file", rel: "plan.md" });
  });

  it("drops anything that does not match", () => {
    expect(rankPalette("zzz", ["a.md"], [], commands, { files: 8, commands: 8 })).toEqual([]);
  });
});

describe("commandKIntent", () => {
  const base = { selectionEmpty: true, sourceMode: false, settingsOpen: false };
  it("opens the palette with nothing selected", () => {
    expect(commandKIntent(base)).toBe("palette");
  });
  it("makes a link from selected document text", () => {
    expect(commandKIntent({ ...base, selectionEmpty: false })).toBe("link");
  });
  it("opens the palette in source mode or Settings, whatever is selected", () => {
    expect(commandKIntent({ ...base, selectionEmpty: false, sourceMode: true })).toBe("palette");
    expect(commandKIntent({ ...base, selectionEmpty: false, settingsOpen: true })).toBe("palette");
  });
});
