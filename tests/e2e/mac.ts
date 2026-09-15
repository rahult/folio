// Drives the built Folio.app on this Mac through System Events. The pure
// parts (paths, parsing, seeding) are unit-tested in mac.test.ts; the
// process parts are exercised by the *.e2e.ts files.
import { execFile, execFileSync, spawn, type ChildProcess } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { homedir, tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

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

const execFileP = promisify(execFile);
const PROCESS = "folio-app";
const SE = `tell application "System Events" to tell process "${PROCESS}"`;

export async function osa(script: string): Promise<string> {
  try {
    const { stdout } = await execFileP("osascript", ["-e", script], { timeout: 30_000, maxBuffer: 16 * 1024 * 1024 });
    return stdout.trim();
  } catch (e) {
    const err = e as { stderr?: string; message: string };
    throw new Error(`osascript failed: ${(err.stderr ?? err.message).trim()}\n--- script ---\n${script}`);
  }
}

export function aerospaceRunning(): boolean {
  try {
    execFileSyncQuiet("pgrep", ["-x", "AeroSpace"]);
    return true;
  } catch {
    return false;
  }
}

function execFileSyncQuiet(cmd: string, args: string[]): string {
  // Small sync helper for pgrep-style checks; throws on a non-zero exit.
  return execFileSync(cmd, args, { stdio: ["ignore", "pipe", "ignore"] }).toString();
}

function appRunning(): boolean {
  try {
    execFileSyncQuiet("pgrep", ["-x", PROCESS]);
    return true;
  } catch {
    return false;
  }
}

export async function waitFor(
  fn: () => Promise<boolean> | boolean,
  opts: { timeoutMs?: number; everyMs?: number; what?: string } = {},
): Promise<void> {
  const { timeoutMs = 10_000, everyMs = 250, what = "condition" } = opts;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await fn()) return;
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, everyMs));
  }
}

let child: ChildProcess | null = null;

/** The environment that pins every part of the app to `home`.
 *
 *  `HOME` alone is not enough: the app is code-signed, so Foundation's
 *  `NSHomeDirectory()` ignores `$HOME` and WebKit keeps the webview's
 *  localStorage — where Folio persists the session, the recent files and
 *  the annotations — under the real `~/Library/WebKit/folio-app`. A run
 *  would then restore whatever document the last direct-binary launch had
 *  open (so the first scenario never sees "Untitled") and write its own
 *  session back over it. `CFFIXED_USER_HOME` is the knob Foundation does
 *  honour, and with it the WebKit store lands inside the temp home and
 *  goes away with it.
 *
 *  `TMPDIR` for the same reason one level down: the review handshake spool
 *  and the CLI's hand-off spool sit in `std::env::temp_dir()`, which no
 *  amount of `HOME` moves. The app and the CLI must agree on it — that is
 *  how `folio review` reaches the running window — so both get it here,
 *  and `removeHome` takes the spool with the rest. */
function envFor(home: string): NodeJS.ProcessEnv {
  const tmp = join(home, "tmp");
  mkdirSync(tmp, { recursive: true });
  return { ...process.env, HOME: home, CFFIXED_USER_HOME: home, TMPDIR: tmp };
}

export async function launchApp(home: string): Promise<void> {
  if (appRunning()) throw new Error("a folio-app process is already running; the harness never touches it");
  child = spawn(bundle().bin, [], { env: envFor(home), stdio: "ignore" });
  await waitFor(async () => (await windowCount()) >= 1, { timeoutMs: 10_000, what: "the first window" });
  await new Promise((r) => setTimeout(r, 1000));
}

/** Quit the app *this helper started*, and nothing else.
 *
 *  Every branch is keyed on `child`, never on `appRunning()`: when
 *  `launchApp` refuses because a Folio was already up, vitest still runs
 *  the `afterAll` that calls this, and a global check would then read the
 *  person's own instance as "ours" and kill it — `pkill -9 -x folio-app`
 *  would take their unsaved work with it. With no child of our own there is
 *  nothing here to quit. */
export async function quitApp(): Promise<void> {
  const own = child;
  child = null;
  if (own === null) return;
  const gone = (): boolean => own.exitCode !== null || own.signalCode !== null;
  if (gone()) return;
  try {
    await menu("Folio", "Quit Folio");
    await waitFor(gone, { timeoutMs: 5_000, what: "quit" });
  } catch {
    // SIGKILL by pid, so the signal can only ever reach the process we
    // spawned — not whatever else answers to the name `folio-app`.
    own.kill("SIGKILL");
    await waitFor(gone, { timeoutMs: 5_000, what: "the process to end" });
  }
}

export async function folio(
  args: string[],
  opts: { home: string; cwd: string; timeoutMs?: number },
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolveP) => {
    execFile(
      bundle().cli,
      args,
      { cwd: opts.cwd, env: envFor(opts.home), timeout: opts.timeoutMs ?? 60_000, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const err = error as (Error & { code?: number | string; killed?: boolean }) | null;
        const code = err === null ? 0 : err.killed ? -1 : typeof err.code === "number" ? err.code : 1;
        resolveP({ code, stdout: String(stdout), stderr: String(stderr) });
      },
    );
  });
}

const q = (s: string) => `"${s.replace(/"/g, '\\"')}"`;

/** `menu("View", "Themes", "Night")` → the innermost item through its submenus. */
export async function menu(...path: string[]): Promise<void> {
  if (path.length < 2) throw new Error("menu() needs a menu bar item and at least one item");
  let ref = `menu 1 of menu bar item ${q(path[0])} of menu bar 1`;
  for (let i = 1; i < path.length - 1; i++) ref = `menu 1 of menu item ${q(path[i])} of ${ref}`;
  await osa(`${SE} to click menu item ${q(path[path.length - 1])} of ${ref}`);
  await new Promise((r) => setTimeout(r, 300));
}

export async function keys(text: string): Promise<void> {
  await osa(`tell application "System Events" to keystroke ${q(text)}`);
  await new Promise((r) => setTimeout(r, 150));
}

export async function keyCode(code: number): Promise<void> {
  await osa(`tell application "System Events" to key code ${code}`);
  await new Promise((r) => setTimeout(r, 150));
}

const DUMP_ROLES = `{"AXButton", "AXRadioButton", "AXCheckBox", "AXStaticText", "AXGroup", "AXTextField", "AXPopUpButton"}`;
/** Roles whose `value` is worth a column. Static text *is* its value; a
 *  radio or a check box answers "1" when checked and "0" when not, which is
 *  the only per-window reading of a control's state — the menu bar is one
 *  app-level menu shared by every window, so a check mark there says nothing
 *  about which window applied the change. */
const VALUE_ROLES = `{"AXStaticText", "AXRadioButton", "AXCheckBox"}`;

/** Every interesting element of a window in one osascript round trip.
 *
 *  System Events' `entire contents of window 1` returns an empty list for
 *  this app (a webview window), so the tree is walked by hand. One Apple
 *  event per element does the walking: `{role, position, size, name, value}
 *  of (UI elements of el)` comes back as five parallel lists, which keeps a
 *  ~200-element window under a couple of seconds instead of one round trip
 *  per attribute. */
export async function axDump(win = 1): Promise<AxElement[]> {
  const script = `on walk(el)
  set out to ""
  tell application "System Events"
    set rs to {}
    set ps to {}
    set ss to {}
    set ns to {}
    set vs to {}
    try
      set res to {role, position, size, name, value} of (UI elements of el)
      set rs to item 1 of res
      set ps to item 2 of res
      set ss to item 3 of res
      set ns to item 4 of res
      set vs to item 5 of res
    end try
    repeat with i from 1 to (count of rs)
      -- A row of its own: the window keeps changing under the walk (a
      -- review bar re-rendering, an annotation entry opening), and an
      -- element that goes away between the batch read and this line must
      -- cost one row, not the whole dump.
      try
        set r to item i of rs
        if r is in ${DUMP_ROLES} then
          set p to item i of ps
          set s to item i of ss
          if p is missing value then set p to {0, 0}
          if s is missing value then set s to {0, 0}
          set n to item i of ns
          if n is missing value then set n to ""
          set v to ""
          if r is in ${VALUE_ROLES} then set v to item i of vs
          if v is missing value then set v to ""
          set out to out & r & tab & n & tab & v & tab & (item 1 of p) & tab & (item 2 of p) & tab & (item 1 of s) & tab & (item 2 of s) & linefeed
        end if
        set out to out & my walk(UI element i of el)
      end try
    end repeat
  end tell
  return out
end walk

${SE}
  return my walk(window ${win})
end tell`;
  return parseDump(await osa(script));
}

export async function axButtons(win = 1): Promise<string[]> {
  return (await axDump(win)).filter((e) => ["AXButton", "AXRadioButton", "AXCheckBox"].includes(e.role)).map((e) => e.name);
}

export async function axTexts(win = 1, maxLen = 120): Promise<string[]> {
  return (await axDump(win)).filter((e) => e.role === "AXStaticText" && e.value.length <= maxLen).map((e) => e.value);
}

export async function frames(role: string | string[], win = 1): Promise<AxElement[]> {
  const roles = Array.isArray(role) ? role : [role];
  return (await axDump(win)).filter((e) => roles.includes(e.role));
}

export async function clickAt(x: number, y: number): Promise<void> {
  await osa(`tell application "System Events" to click at {${Math.round(x)}, ${Math.round(y)}}`);
  await new Promise((r) => setTimeout(r, 300));
}

/** Where a click has to land inside an element's frame.
 *
 *  A plain button takes a click anywhere in its box. A radio or a check box
 *  written as `<label><input type="radio"> Night</label>` does not: WebKit
 *  reports one `AXRadioButton` spanning the whole label — glyph *and* text —
 *  but a synthetic click on the text half is ignored, where a person's click
 *  there would check it. Verified against the Settings theme row: a click at
 *  the frame's centre (over the word) never changed the theme, one near the
 *  leading edge always did. So aim at the control glyph, which is about as
 *  wide as the row is tall; a bare input (w == h) is unaffected. */
function clickPoint(e: AxElement): { x: number; y: number } {
  const glyph = ["AXRadioButton", "AXCheckBox"].includes(e.role);
  return { x: e.x + (glyph ? Math.min(e.w, e.h) / 2 : e.w / 2), y: e.y + e.h / 2 };
}

export async function clickButton(name: string, win = 1, near?: number): Promise<void> {
  const els = await axDump(win);
  const roles = ["AXButton", "AXRadioButton", "AXCheckBox"];
  const target = near === undefined ? els.find((e) => roles.includes(e.role) && e.name === name) ?? null : nearest(els, roles, name, near);
  if (!target) {
    const seen = els.filter((e) => roles.includes(e.role)).map((e) => e.name).join(", ");
    throw new Error(`no button named "${name}" in window ${win}; saw: ${seen}`);
  }
  const p = clickPoint(target);
  await clickAt(p.x, p.y);
}

export async function windowRect(win = 1): Promise<{ x: number; y: number; w: number; h: number }> {
  const out = await osa(`${SE} to get {position, size} of window ${win}`);
  const [x, y, w, h] = out.split(",").map((s) => Number(s.trim()));
  return { x, y, w, h };
}

export async function windowCount(): Promise<number> {
  try {
    return Number(await osa(`${SE} to count windows`));
  } catch {
    return 0;
  }
}

export async function raiseWindow(win: number): Promise<void> {
  await osa(`${SE} to perform action "AXRaise" of window ${win}`);
  await new Promise((r) => setTimeout(r, 300));
}

export function artifactsDir(): string {
  const dir = join(tmpdir(), "folio-e2e", "artifacts");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export async function screenshotWindow(name: string, win = 1): Promise<string> {
  const { x, y, w, h } = await windowRect(win);
  const path = join(artifactsDir(), `${name}.png`);
  await execFileP("screencapture", ["-x", "-o", "-R", `${x},${y},${w},${h}`, path]);
  return path;
}

/** The checked item of View → Themes, read from the menu without opening it. */
export async function themeMark(): Promise<string | null> {
  const ref = `menu 1 of menu item "Themes" of menu 1 of menu bar item "View" of menu bar 1`;
  const out = await osa(`${SE}
  set out to ""
  repeat with m in menu items of ${ref}
    try
      if (value of attribute "AXMenuItemMarkChar" of m) is not missing value and (value of attribute "AXMenuItemMarkChar" of m) is not "" then
        set out to out & (name of m) & linefeed
      end if
    end try
  end repeat
  return out
end tell`);
  const first = out.split("\n").find((l) => l.trim() !== "");
  return first ? first.trim() : null;
}

export async function docTitle(win = 1): Promise<string> {
  const texts = (await axDump(win)).filter((e) => e.role === "AXStaticText" && (e.value === "Untitled" || /\.md$/.test(e.value)));
  texts.sort((a, b) => a.y - b.y);
  return texts[0]?.value ?? "";
}

export async function reviewLabel(win = 1): Promise<string | null> {
  const t = (await axTexts(win)).find((v) => v.includes(" waiting · ") || v.includes(" left · "));
  return t ?? null;
}

/** Run a scenario; on failure keep a screenshot and the accessibility dump
 *  and name both in the error. */
export async function withArtifacts(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    let note = "";
    try {
      const shot = await screenshotWindow(name);
      const dump = await axDump();
      const axPath = join(artifactsDir(), `${name}.ax.txt`);
      writeFileSync(axPath, dump.map((d) => `${d.role}\t${d.name}\t${d.value}\t${d.x}\t${d.y}\t${d.w}\t${d.h}`).join("\n"));
      note = `\nartifacts: ${shot}, ${axPath}`;
    } catch (artErr) {
      note = `\n(no artifacts: ${(artErr as Error).message.split("\n")[0]})`;
    }
    err.message += note;
    throw err;
  }
}

/** `rm -rf` on a throwaway home, with a fuse.
 *
 *  `homeFor` hands back `FOLIO_E2E_HOME` verbatim, so a stale or mistyped
 *  export — `FOLIO_E2E_HOME=$HOME` is the one that hurts — would otherwise
 *  arrive here and be deleted without a word, `force: true` swallowing every
 *  complaint. A path only counts as disposable when it sits under the temp
 *  directory or names itself `folio-e2e`, and never when it is the person's
 *  own home. */
export function removeHome(home: string): void {
  const path = resolve(home);
  const underTmp = path.startsWith(resolve(tmpdir()) + sep);
  const named = path.split(sep).some((part) => part.includes("folio-e2e"));
  if (path === resolve(homedir()) || !(underTmp || named)) {
    throw new Error(`refusing to remove ${path}: not a throwaway home under ${tmpdir()} or named folio-e2e`);
  }
  rmSync(path, { recursive: true, force: true });
}
