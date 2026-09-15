// Drives the built Folio.app on this Mac through System Events. The pure
// parts (paths, parsing, seeding) are unit-tested in mac.test.ts; the
// process parts are exercised by the *.e2e.ts files.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const FIXTURE = join(ROOT, "tests/e2e/fixtures/sample.md");
export const SETTINGS_REL = "Library/Application Support/com.rahult.folio/settings.json";

export interface AxElement {
  role: string;
  name: string;
  value: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One element per tab-separated line: role, name, value, x, y, w, h. */
export function parseDump(text: string): AxElement[] {
  const out: AxElement[] = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    const [role, name = "", value = "", x = "0", y = "0", w = "0", h = "0"] = line.split("\t");
    out.push({ role, name, value, x: Number(x), y: Number(y), w: Number(w), h: Number(h) });
  }
  return out;
}

/** The element of `role` named exactly `name` whose vertical centre is
 *  closest to `anchorY` — how a row's action button is found from the
 *  row's label. */
export function nearest(elements: AxElement[], role: string | string[], name: string, anchorY: number): AxElement | null {
  const roles = Array.isArray(role) ? role : [role];
  let best: AxElement | null = null;
  let bestDist = Infinity;
  for (const e of elements) {
    if (!roles.includes(e.role) || e.name !== name) continue;
    const d = Math.abs(e.y + e.h / 2 - anchorY);
    if (d < bestDist) {
      best = e;
      bestDist = d;
    }
  }
  return best;
}

export function bundle(): { app: string; bin: string; cli: string } {
  const app = join(ROOT, "src-tauri/target/release/bundle/macos/Folio.app");
  return { app, bin: join(app, "Contents/MacOS/folio-app"), cli: join(app, "Contents/MacOS/folio") };
}

export function homeFor(file: string): string {
  return process.env.FOLIO_E2E_HOME ?? join(tmpdir(), "folio-e2e", `${file}-${process.pid}`);
}

/** A fresh HOME: the Folio home folder, the fixture at docs/sample.md, and
 *  settings that keep the consent overlay and the update dialog away. */
export function seedHome(home: string): { doc: string } {
  mkdirSync(join(home, "Documents/Folio"), { recursive: true });
  mkdirSync(join(home, "docs"), { recursive: true });
  const doc = join(home, "docs/sample.md");
  copyFileSync(FIXTURE, doc);
  const settings = join(home, SETTINGS_REL);
  mkdirSync(dirname(settings), { recursive: true });
  writeFileSync(settings, JSON.stringify({ telemetry: false, checkUpdates: false }, null, 2));
  return { doc };
}

export function readHome(home: string, rel: string): string | null {
  const p = join(home, rel);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
}

export function settingsOf(home: string): Record<string, unknown> | null {
  const text = readHome(home, SETTINGS_REL);
  if (text === null) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}
