import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { bundle, homeFor, nearest, parseDump, readHome, seedHome, settingsOf, SETTINGS_REL } from "./mac";

const dump = [
  "AXButton\tDone\t\t100\t20\t60\t24",
  "AXStaticText\tClaude Code\tClaude Code\t40\t200\t120\t18",
  "AXButton\tInstall\t\t500\t204\t70\t24",
  "AXStaticText\tPi\tPi\t40\t260\t30\t18",
  "AXButton\tInstall\t\t500\t264\t70\t24",
  "",
].join("\n");

describe("parseDump", () => {
  it("reads one element per line and skips blanks", () => {
    const els = parseDump(dump);
    expect(els).toHaveLength(5);
    expect(els[0]).toEqual({ role: "AXButton", name: "Done", value: "", x: 100, y: 20, w: 60, h: 24 });
    expect(els[1].value).toBe("Claude Code");
  });
});

describe("nearest", () => {
  it("picks the button on the same row as the anchor", () => {
    const els = parseDump(dump);
    const row = els.find((e) => e.name === "Pi")!;
    const btn = nearest(els, "AXButton", "Install", row.y + row.h / 2);
    expect(btn?.y).toBe(264);
  });

  it("accepts several roles and returns null when nothing matches", () => {
    const els = parseDump(dump);
    expect(nearest(els, ["AXRadioButton", "AXButton"], "Done", 0)?.name).toBe("Done");
    expect(nearest(els, "AXButton", "Nope", 0)).toBeNull();
  });
});

describe("paths", () => {
  it("points into the release bundle", () => {
    const b = bundle();
    expect(b.app.endsWith("src-tauri/target/release/bundle/macos/Folio.app")).toBe(true);
    expect(b.bin).toBe(join(b.app, "Contents/MacOS/folio-app"));
    expect(b.cli).toBe(join(b.app, "Contents/MacOS/folio"));
  });

  it("derives a per-file home under the temp dir unless FOLIO_E2E_HOME is set", () => {
    const saved = process.env.FOLIO_E2E_HOME;
    delete process.env.FOLIO_E2E_HOME;
    expect(homeFor("review")).toBe(join(tmpdir(), "folio-e2e", `review-${process.pid}`));
    process.env.FOLIO_E2E_HOME = "/x/home";
    expect(homeFor("review")).toBe("/x/home");
    if (saved === undefined) delete process.env.FOLIO_E2E_HOME;
    else process.env.FOLIO_E2E_HOME = saved;
  });
});

describe("seedHome", () => {
  it("lays out the folders, the fixture copy, and quiet settings", () => {
    const home = mkdtempSync(join(tmpdir(), "folio-e2e-seed-"));
    try {
      const { doc } = seedHome(home);
      expect(doc).toBe(join(home, "docs/sample.md"));
      expect(readFileSync(doc, "utf8")).toContain("# Sample plan");
      expect(readHome(home, "Documents/Folio/.keep")).toBeNull();
      expect(readHome(home, "docs/sample.md")).toContain("## Risks");
      expect(settingsOf(home)).toEqual({ telemetry: false, checkUpdates: false });
      expect(readHome(home, SETTINGS_REL)).not.toBeNull();
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
