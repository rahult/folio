import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import {
  HOME_MARKER,
  ROOT,
  bundle,
  guardedInput,
  homeFor,
  isThrowawayHome,
  nearest,
  parseDump,
  readHome,
  removeHome,
  seedHome,
  settingsOf,
  SETTINGS_REL,
} from "./mac";

const dump = [
  "AXButton\tDone\t\t100\t20\t60\t24",
  "AXStaticText\tClaude Code\tClaude Code\t40\t200\t120\t18",
  "AXButton\tInstall\t\t500\t204\t70\t24",
  "AXStaticText\tPi\tPi\t40\t260\t30\t18",
  "AXButton\tInstall\t\t500\t264\t70\t24",
  "AXRadioButton\tSlate\t1\t640\t500\t60\t21",
  "",
].join("\n");

describe("parseDump", () => {
  it("reads one element per line and skips blanks", () => {
    const els = parseDump(dump);
    expect(els).toHaveLength(6);
    expect(els[0]).toEqual({ role: "AXButton", name: "Done", value: "", x: 100, y: 20, w: 60, h: 24 });
    expect(els[1].value).toBe("Claude Code");
    // A radio carries its checked state in the same column: "1" checked.
    expect(els[5]).toEqual({ role: "AXRadioButton", name: "Slate", value: "1", x: 640, y: 500, w: 60, h: 21 });
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
    expect(b.app).toBe(join(ROOT, "src-tauri", "target", "release", "bundle", "macos", "Folio.app"));
    expect(b.bin).toBe(join(b.app, "Contents", "MacOS", "folio-app"));
    expect(b.cli).toBe(join(b.app, "Contents", "MacOS", "folio"));
  });

  it("derives a per-file home under the temp dir unless FOLIO_E2E_HOME is set", () => {
    const saved = process.env.FOLIO_E2E_HOME;
    try {
      delete process.env.FOLIO_E2E_HOME;
      expect(homeFor("review")).toBe(join(tmpdir(), "folio-e2e", `review-${process.pid}`));
      const chosen = join(tmpdir(), "folio-e2e", "chosen");
      process.env.FOLIO_E2E_HOME = chosen;
      expect(homeFor("review")).toBe(chosen);
    } finally {
      if (saved === undefined) delete process.env.FOLIO_E2E_HOME;
      else process.env.FOLIO_E2E_HOME = saved;
    }
  });

  it("refuses a FOLIO_E2E_HOME that is empty or the person's own home", () => {
    const saved = process.env.FOLIO_E2E_HOME;
    try {
      process.env.FOLIO_E2E_HOME = "";
      expect(() => homeFor("review")).toThrow(/refusing FOLIO_E2E_HOME=: not a throwaway folder/);
      process.env.FOLIO_E2E_HOME = homedir();
      expect(() => homeFor("review")).toThrow(/refusing FOLIO_E2E_HOME=.*: not a throwaway folder/);
    } finally {
      if (saved === undefined) delete process.env.FOLIO_E2E_HOME;
      else process.env.FOLIO_E2E_HOME = saved;
    }
  });
});

describe("seedHome", () => {
  it("lays out the folders, the fixture copy, and quiet settings", () => {
    const home = mkdtempSync(join(tmpdir(), "folio-e2e-seed-"));
    try {
      const { doc } = seedHome(home);
      expect(doc).toBe(join(home, "docs", "sample.md"));
      expect(readFileSync(doc, "utf8")).toContain("# Sample plan");
      expect(existsSync(join(home, HOME_MARKER))).toBe(true);
      expect(existsSync(join(home, "Documents", "Folio"))).toBe(true);
      expect(readHome(home, "docs/sample.md")).toContain("## Risks");
      expect(settingsOf(home)).toEqual({ telemetry: false, checkUpdates: false });
      expect(readHome(home, SETTINGS_REL)).not.toBeNull();
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("refuses a folder that has something in it but no marker, and writes nothing", () => {
    const home = mkdtempSync(join(tmpdir(), "folio-e2e-seed-"));
    try {
      writeFileSync(join(home, "keep.txt"), "not yours");
      expect(() => seedHome(home)).toThrow(/refusing to seed/);
      expect(readdirSync(home)).toEqual(["keep.txt"]);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

// Strings only: a wrong answer here must never reach the disk.
describe("isThrowawayHome", () => {
  it("rejects blank, the person's home, and folders outside the temp dir", () => {
    for (const p of ["", "   ", homedir(), join(homedir(), "Documents"), "/usr/local"]) {
      expect(isThrowawayHome(p), JSON.stringify(p)).toBe(false);
    }
  });

  it("accepts a folder under the temp dir or one named folio-e2e", () => {
    for (const p of [join(tmpdir(), "x"), "/Volumes/data/folio-e2e/run-1"]) {
      expect(isThrowawayHome(p), p).toBe(true);
    }
  });
});

describe("removeHome", () => {
  it("removes a home seedHome laid out", () => {
    const home = mkdtempSync(join(tmpdir(), "folio-e2e-rm-"));
    try {
      seedHome(home);
      removeHome(home);
      expect(existsSync(home)).toBe(false);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("refuses a throwaway-looking folder without the marker and leaves its files", () => {
    const home = mkdtempSync(join(tmpdir(), "folio-e2e-rm-"));
    try {
      writeFileSync(join(home, "keep.txt"), "not yours to delete");
      expect(() => removeHome(home)).toThrow(/refusing to remove/);
      expect(existsSync(join(home, "keep.txt"))).toBe(true);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

describe("guardedInput", () => {
  it("checks that folio-app is frontmost before the action, which it sends once", () => {
    const action = "key code 36";
    const script = guardedInput(action);
    const check = script.indexOf("name of first application process whose frontmost is true");
    const refuse = script.indexOf('if fp is not "folio-app" then error "Folio is not frontmost (frontmost: " & fp & ")"');
    expect(check).toBeGreaterThanOrEqual(0);
    expect(refuse).toBeGreaterThan(check);
    expect(script.indexOf(action)).toBeGreaterThan(refuse);
    expect(script.split(action)).toHaveLength(2);
    expect(script.startsWith('tell application "System Events"')).toBe(true);
  });

  it("passes the action through verbatim", () => {
    for (const action of ['keystroke "a" using command down', 'keystroke "say \\"hi\\""', "click at {10, 20}"]) {
      const lines = guardedInput(action).split("\n").map((l) => l.trim());
      expect(lines).toContain(action);
    }
  });
});
