import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ROOT,
  axButtons,
  axDump,
  clickButton,
  docTitle,
  homeFor,
  launchApp,
  menu,
  nearest,
  quitApp,
  raiseWindow,
  readHome,
  removeHome,
  seedHome,
  settingsOf,
  themeMark,
  waitFor,
  windowCount,
  windowRect,
  withArtifacts,
} from "./mac";

const home = homeFor("settings");

beforeAll(async () => {
  seedHome(home);
  await launchApp(home);
});

afterAll(async () => {
  await quitApp();
  removeHome(home);
});

/** Open Settings in the front window and wait for its section list. */
async function openSettings(): Promise<void> {
  await menu("Folio", "Settings…");
  await waitFor(async () => (await axButtons()).includes("Done"), { timeoutMs: 5_000, what: "the Settings page" });
}

/** Click the action button on the row whose label is `rowLabel`. */
async function clickRowAction(rowLabel: string, action: string): Promise<void> {
  const els = await axDump();
  const row = els.find((e) => e.role === "AXStaticText" && e.value === rowLabel);
  if (!row) throw new Error(`no row labelled "${rowLabel}"; texts: ${els.filter((e) => e.role === "AXStaticText").map((e) => e.value).join(" | ")}`);
  const btn = nearest(els, "AXButton", action, row.y + row.h / 2);
  if (!btn) throw new Error(`no "${action}" button near "${rowLabel}"`);
  await clickButton(action, 1, row.y + row.h / 2);
}

describe("settings", () => {
  it("opens, lists its sections, and saves a theme change", () =>
    withArtifacts("settings-theme", async () => {
      await openSettings();
      const buttons = await axButtons();
      for (const name of ["General", "Review", "Lenses", "Prompts", "Agents & command line", "About", "Done"]) {
        expect(buttons, `section ${name}`).toContain(name);
      }
      await clickButton("Night");
      await waitFor(() => settingsOf(home)?.theme === "night", { timeoutMs: 3_000, what: "theme night in settings.json" });
      await waitFor(async () => (await themeMark()) === "Night", { timeoutMs: 3_000, what: "the Night check mark" });
      await clickButton("Done");
    }));

  it("applies a theme picked in one window to the other", () =>
    withArtifacts("settings-second-window", async () => {
      await menu("File", "New Window");
      await waitFor(async () => (await windowCount()) >= 2, { timeoutMs: 5_000, what: "a second window" });
      await openSettings();
      await clickButton("Slate");
      await waitFor(() => settingsOf(home)?.theme === "slate", { timeoutMs: 3_000, what: "theme slate in settings.json" });
      await clickButton("Done");
      // Not the menu's check mark: `set_menu` installs one app-level menu and
      // every window's `settings-changed` handler syncs that same menu, so the
      // mark reads Slate even for a window that ignored the event. The other
      // window's own Settings page is the per-window reading — its Slate radio
      // answers "1" only if that window applied the change.
      // The raise has to be seen to work: if it left the order alone, Settings
      // would reopen in the window that picked Slate and prove nothing about
      // the other one. Window 1 is always the front one, so its frame changes
      // exactly when another window came in front.
      const before = await windowRect(1);
      await raiseWindow(2);
      await waitFor(
        async () => {
          const now = await windowRect(1);
          return now.x !== before.x || now.y !== before.y || now.w !== before.w || now.h !== before.h;
        },
        { timeoutMs: 3_000, what: "the other window in front" },
      );
      await openSettings();
      await waitFor(
        async () => (await axDump(1)).some((e) => e.role === "AXRadioButton" && e.name === "Slate" && e.value === "1"),
        { timeoutMs: 3_000, what: "Slate checked in the other window's Settings" },
      );
      await clickButton("Done");
    }));

  it("edits a built-in lens in Folio", () =>
    withArtifacts("settings-edit-in-folio", async () => {
      await openSettings();
      await clickButton("Prompts");
      await waitFor(async () => (await axButtons()).includes("Edit in Folio"), { timeoutMs: 5_000, what: "the Prompts section" });
      await clickRowAction("Council of experts", "Edit in Folio");
      await waitFor(() => readHome(home, "Documents/Folio/lenses/council.md") !== null, { timeoutMs: 5_000, what: "lenses/council.md" });
      expect(readHome(home, "Documents/Folio/lenses/council.md")!.startsWith("---\nname: Council of experts")).toBe(true);
      await waitFor(async () => (await docTitle()) === "council.md", { timeoutMs: 5_000, what: "council.md in the toolbar" });
    }));

  it("installs the Claude Code skill into the home folder", () =>
    withArtifacts("settings-skill-install", async () => {
      await openSettings();
      await clickButton("Agents & command line");
      await waitFor(async () => (await axButtons()).includes("Install"), { timeoutMs: 5_000, what: "the Agents section" });
      await clickRowAction("Claude Code", "Install");
      await waitFor(() => readHome(home, ".claude/skills/folio/SKILL.md") !== null, { timeoutMs: 5_000, what: "the installed skill" });
      const expected = readFileSync(join(ROOT, "skills/folio/SKILL.md"), "utf8").replace(/\r\n/g, "\n");
      expect(readHome(home, ".claude/skills/folio/SKILL.md")).toBe(expected);
      await waitFor(async () => {
        const els = await axDump();
        const row = els.find((e) => e.role === "AXStaticText" && e.value === "Claude Code");
        if (!row) return false;
        const status = nearest(els, "AXStaticText", "current", row.y + row.h / 2);
        return status !== null && Math.abs(status.y - row.y) < 40;
      }, { timeoutMs: 5_000, what: "the row's status to read current" });
      await clickButton("Done");
    }));
});
