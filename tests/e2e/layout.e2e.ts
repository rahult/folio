import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  aerospaceRunning,
  docTitle,
  folio,
  frames,
  homeFor,
  launchApp,
  menu,
  quitApp,
  removeHome,
  seedHome,
  waitFor,
  windowCount,
  windowRect,
  withArtifacts,
} from "./mac";

const home = homeFor("layout");

beforeAll(async () => {
  seedHome(home);
  await launchApp(home);
});

afterAll(async () => {
  await quitApp();
  removeHome(home);
});

describe("layout", () => {
  it.skipIf(aerospaceRunning())("keeps the first window's geometry when a review window opens", () =>
    withArtifacts("layout-geometry", async () => {
      const original = await windowRect(1);
      const before = await windowCount();
      const r = await folio(["review", "docs/sample.md"], { home, cwd: home });
      expect(r.code, r.stderr).toBe(0);
      await waitFor(async () => (await windowCount()) === before + 1, { timeoutMs: 5_000, what: "a new window" });
      // The new window is in front (window 1); the original is now window 2.
      expect(await windowRect(2)).toEqual(original);
      // A review window opens at the app's 800x600 *inner* default, not at
      // some compact float size of its own. The frame System Events reports
      // is that plus a native title bar: unlike the declarative first
      // window, one built by `open_window` sets no `titleBarStyle`, so it
      // keeps the standard macOS bar and its outer height may run taller
      // than its content. Hence a bound rather than an equality.
      const fresh = await windowRect(1);
      expect(fresh.w).toBe(800);
      expect(fresh.h).toBeGreaterThanOrEqual(600);
      expect(fresh.h).toBeLessThanOrEqual(640);
    }));

  it("fits every panel tab inside the reading panel", () =>
    withArtifacts("layout-panel-tabs", async () => {
      if ((await docTitle()) !== "sample.md") {
        const r = await folio(["docs/sample.md"], { home, cwd: home });
        expect(r.code, r.stderr).toBe(0);
        await waitFor(async () => (await docTitle()) === "sample.md", { timeoutMs: 5_000, what: "sample.md open" });
      }
      await menu("View", "Reading Panel");
      await waitFor(async () => (await frames("AXGroup")).some((g) => g.name === "Reading panel"), { timeoutMs: 5_000, what: "the panel" });
      const panel = (await frames("AXGroup")).find((g) => g.name === "Reading panel")!;
      const tabs = await frames(["AXRadioButton", "AXButton"]);
      for (const name of ["Outline", "Annotations", "History", "Lenses", "Decide"]) {
        const tab = tabs.find((t) => t.name === name);
        expect(tab, `tab ${name} present`).toBeDefined();
        expect(tab!.x, `${name} left edge`).toBeGreaterThanOrEqual(panel.x);
        expect(tab!.x + tab!.w, `${name} right edge`).toBeLessThanOrEqual(panel.x + panel.w);
      }
    }));
});
