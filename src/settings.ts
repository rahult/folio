/**
 * Settings: the page's view model and renderer. `settingsView` turns the
 * model into plain controls (pure, tested); `renderSettings` paints them
 * (DOM only). `main.ts` owns the state, the invokes, and what each control
 * id and action id does — this file never talks to Tauri.
 */

import { storedTheme, THEMES, type Theme } from "./theme";
import { telemetryConsent } from "./telemetry";

export interface Settings {
  homeDir: string | null;
  theme: Theme;
  liveReload: boolean;
  telemetry: boolean | null;
  checkUpdates: boolean;
  review: { float: boolean; agent: string; timeoutSecs: number };
  lens: { baseUrl: string; model: string };
}

export type SettingsSection = "general" | "review" | "lenses" | "prompts" | "agents" | "about";

export interface SettingsModel {
  settings: Settings;
  homePath: string;
  section: SettingsSection;
  hasKey: boolean;
  version: string;
  lensesFolder: string;
  prompts: { lensRules: boolean; feedbackInstructions: boolean; skill: boolean; lensOverrides: string[] };
  builtinLenses: { id: string; name: string; description: string }[];
  skills: { target: "claude" | "agents"; label: string; path: string; state: "missing" | "current" | "outdated" | "custom" }[];
  cli: { link: string | null; target: string | null; ours: boolean };
  /** The inline "type a key" field is showing (there is no window.prompt
   *  in the webview, so Set…/Replace… reveals a field instead). */
  keyEntry: boolean;
  error: string | null;
}

export type Action = { id: string; label: string; danger?: boolean };

export type Control =
  | { kind: "toggle"; id: string; label: string; note?: string; value: boolean }
  | { kind: "radio"; id: string; label: string; value: string; options: { value: string; label: string }[] }
  | { kind: "text"; id: string; label: string; value: string; note?: string; placeholder?: string; secret?: boolean }
  | { kind: "number"; id: string; label: string; value: number; min: number; max: number; note?: string }
  | { kind: "path"; id: string; label: string; value: string; note?: string; actions: Action[] }
  | { kind: "row"; id: string; label: string; status: string; note?: string; actions: Action[] }
  | { kind: "command"; id: string; label: string; command: string; note?: string }
  | { kind: "info"; id: string; text: string };

export interface SettingsView {
  sections: { id: SettingsSection; label: string }[];
  current: SettingsSection;
  title: string;
  controls: Control[];
  error: string | null;
}

export const SKILLS_SH_PI = "npx skills add rahult/folio -a pi";
export const INSTALL_SH = "curl -fsSL https://raw.githubusercontent.com/rahult/folio/main/scripts/install.sh | sh";

const SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: "general", label: "General" },
  { id: "review", label: "Review" },
  { id: "lenses", label: "Lenses" },
  { id: "prompts", label: "Prompts" },
  { id: "agents", label: "Agents & command line" },
  { id: "about", label: "About" },
];

const THEME_LABELS: Record<Theme, string> = { paper: "Paper", manuscript: "Manuscript", newsprint: "Newsprint", night: "Night", slate: "Slate" };

/** Keep a number inside a control's range; `min` wins over `max` if they cross. */
const clamp = (n: number, min: number, max: number): number => Math.min(Math.max(n, min), max);

const TIMEOUT_MIN = 60;
const TIMEOUT_MAX = 540;

const edit = (id: string): Action => ({ id: `${id}.edit`, label: "Edit in Folio" });
const reset = (id: string, label = "Reset"): Action => ({ id: `${id}.reset`, label, danger: true });

function general(m: SettingsModel): Control[] {
  const s = m.settings;
  return [
    {
      kind: "path",
      id: "home",
      label: "Home folder",
      value: m.homePath,
      note: "Your decisions journal, custom lenses, and any edited prompts live here.",
      actions: [
        { id: "home.choose", label: "Choose…" },
        { id: "home.reveal", label: "Reveal" },
      ],
    },
    { kind: "radio", id: "theme", label: "Theme", value: s.theme, options: THEMES.map((t) => ({ value: t, label: THEME_LABELS[t] })) },
    { kind: "toggle", id: "liveReload", label: "Reload when the file changes on disk", note: "Your own unsaved edits are never replaced.", value: s.liveReload },
    { kind: "toggle", id: "telemetry", label: "Share anonymous usage", note: "Which features are used, never document content or file paths.", value: s.telemetry === true },
    { kind: "toggle", id: "checkUpdates", label: "Check for updates automatically", value: s.checkUpdates },
  ];
}

function review(m: SettingsModel): Control[] {
  const r = m.settings.review;
  return [
    { kind: "toggle", id: "review.float", label: "Float review windows on top", note: "The default for folio review.", value: r.float },
    { kind: "text", id: "review.agent", label: "Default agent name", value: r.agent, note: "Shown in the review bar when the command omits --agent.", placeholder: "agent" },
    {
      kind: "number",
      id: "review.timeoutSecs",
      label: "Gate timeout (seconds)",
      value: clamp(r.timeoutSecs, TIMEOUT_MIN, TIMEOUT_MAX),
      min: TIMEOUT_MIN,
      max: TIMEOUT_MAX,
      note: "Coding agents cap a shell call at ten minutes; 540 leaves room to return an exit code.",
    },
  ];
}

function lenses(m: SettingsModel): Control[] {
  const keyActions: Action[] = m.hasKey
    ? [
        { id: "lens.key.set", label: "Replace…" },
        { id: "lens.key.clear", label: "Clear", danger: true },
      ]
    : [{ id: "lens.key.set", label: "Set…" }];
  const entry: Control[] = m.keyEntry
    ? [{ kind: "text", id: "lens.key.value", label: "New API key", value: "", placeholder: "sk-…", note: "Press Return to store it in the keychain.", secret: true }]
    : [];
  return [
    { kind: "text", id: "lens.baseUrl", label: "Endpoint URL", value: m.settings.lens.baseUrl, placeholder: "http://localhost:11434/v1", note: "Any OpenAI-compatible chat endpoint." },
    { kind: "text", id: "lens.model", label: "Model", value: m.settings.lens.model, placeholder: "llama3.2:3b" },
    { kind: "row", id: "lens.key", label: "API key", status: m.hasKey ? "set" : "not set", note: "Kept in the system keychain, never shown.", actions: keyActions },
    ...entry,
    { kind: "path", id: "lensesFolder", label: "Custom lenses folder", value: m.lensesFolder, actions: [{ id: "lensesFolder.reveal", label: "Reveal" }] },
  ];
}

function prompts(m: SettingsModel): Control[] {
  const p = m.prompts;
  const rules: Control = {
    kind: "row",
    id: "prompt.lensRules",
    label: "Lens response rules",
    status: p.lensRules ? "edited" : "built-in",
    note: "Appended to every lens prompt.",
    actions: p.lensRules ? [edit("prompt.lensRules"), reset("prompt.lensRules")] : [edit("prompt.lensRules")],
  };
  const instr: Control = {
    kind: "row",
    id: "prompt.feedbackInstructions",
    label: "Standing feedback instructions",
    status: p.feedbackInstructions ? "set" : "none",
    note: "Appended to every Feedback as an Instructions section.",
    actions: p.feedbackInstructions ? [edit("prompt.feedbackInstructions"), reset("prompt.feedbackInstructions", "Clear")] : [edit("prompt.feedbackInstructions")],
  };
  const skill: Control = {
    kind: "row",
    id: "prompt.skill",
    label: "The /folio skill text",
    status: p.skill ? "edited" : "built-in",
    note: "Installs use your edited text when one exists.",
    actions: p.skill ? [edit("prompt.skill"), reset("prompt.skill")] : [edit("prompt.skill")],
  };
  const lensRows: Control[] = m.builtinLenses.map((l) => {
    const edited = p.lensOverrides.includes(l.id);
    const id = `prompt.lens.${l.id}`;
    return { kind: "row", id, label: l.name, status: edited ? "edited" : "built-in", note: l.description, actions: edited ? [edit(id), reset(id)] : [edit(id)] };
  });
  return [rules, instr, skill, ...lensRows];
}

function agents(m: SettingsModel): Control[] {
  const skillRows: Control[] = m.skills.map((s) => {
    const status = { missing: "not installed", current: "current", outdated: "outdated", custom: "custom text installed" }[s.state];
    const label = s.state === "missing" ? "Install" : s.state === "current" ? "Reinstall" : "Update";
    return { kind: "row", id: `skill.${s.target}`, label: s.label, status, note: s.path, actions: [{ id: `skill.${s.target}.install`, label }] };
  });
  // A candidate that exists but is no symlink has a link and no target:
  // something is sitting where ours would go, and an install must not be
  // described as "linked elsewhere".
  const cliStatus =
    m.cli.link === null
      ? "not installed"
      : m.cli.target === null
        ? `a file is in the way at ${m.cli.link}`
        : m.cli.ours
          ? `folio → ${m.cli.link} → ${m.cli.target}`
          : `linked elsewhere: ${m.cli.target}`;
  return [
    ...skillRows,
    { kind: "command", id: "skill.pi", label: "Pi", command: SKILLS_SH_PI, note: "Invoked there as /skill:folio." },
    { kind: "row", id: "cli", label: "Command line tool", status: cliStatus, note: "Links the bundled folio command into /usr/local/bin or ~/.local/bin.", actions: [{ id: "cli.install", label: "Install" }] },
    { kind: "command", id: "cli.script", label: "On a machine without the app", command: INSTALL_SH },
    { kind: "row", id: "defaultApp", label: "Default Markdown app", status: "", actions: [{ id: "defaultApp.set", label: "Set as default" }] },
  ];
}

function about(m: SettingsModel): Control[] {
  return [
    { kind: "info", id: "about.version", text: `Folio ${m.version}` },
    { kind: "row", id: "about.updates", label: "Updates", status: "", actions: [{ id: "about.updates.check", label: "Check for updates" }] },
    {
      kind: "row",
      id: "about.links",
      label: "Links",
      status: "",
      actions: [
        { id: "about.site", label: "Website" },
        { id: "about.github", label: "GitHub" },
        { id: "about.roadmap", label: "Roadmap" },
        { id: "about.feedback", label: "Feedback" },
      ],
    },
  ];
}

export function settingsView(m: SettingsModel): SettingsView {
  const builders: Record<SettingsSection, (m: SettingsModel) => Control[]> = { general, review, lenses, prompts, agents, about };
  return {
    sections: SECTIONS,
    current: m.section,
    title: SECTIONS.find((s) => s.id === m.section)?.label ?? "",
    controls: builders[m.section](m),
    error: m.error,
  };
}

export interface SettingsHandlers {
  pick(section: SettingsSection): void;
  change(id: string, value: string | number | boolean): void;
  act(id: string): void;
  done(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function actions(list: Action[], on: SettingsHandlers): HTMLElement {
  const wrap = el("div", "settings-actions");
  for (const a of list) {
    const b = el("button", a.danger ? "settings-btn danger" : "settings-btn", a.label);
    b.type = "button";
    b.addEventListener("click", () => on.act(a.id));
    wrap.append(b);
  }
  return wrap;
}

function control(c: Control, on: SettingsHandlers): HTMLElement {
  // `settings-row--<kind>`, never `settings-<kind>`: the bare names belong to
  // inner elements (`settings-path`, `settings-radio`), and a row that shared
  // one inherited its styles.
  const row = el("div", `settings-row settings-row--${c.kind}`);
  row.dataset.id = c.id;
  if (c.kind === "info") {
    row.append(el("p", "settings-info", c.text));
    return row;
  }
  const head = el("div", "settings-row-head");
  head.append(el("label", "settings-label", c.label));
  if ("note" in c && c.note) head.append(el("p", "settings-note", c.note));
  row.append(head);
  const body = el("div", "settings-row-body");
  switch (c.kind) {
    case "toggle": {
      const input = el("input");
      input.type = "checkbox";
      input.checked = c.value;
      input.addEventListener("change", () => on.change(c.id, input.checked));
      body.append(input);
      break;
    }
    case "radio": {
      for (const o of c.options) {
        const lab = el("label", "settings-radio");
        const input = el("input");
        input.type = "radio";
        input.name = c.id;
        input.value = o.value;
        input.checked = o.value === c.value;
        input.addEventListener("change", () => on.change(c.id, o.value));
        lab.append(input, document.createTextNode(o.label));
        body.append(lab);
      }
      break;
    }
    case "text": {
      const input = el("input");
      // A secret is typed, never shown; the browser's own reveal control is
      // the only way to read it back.
      input.type = c.secret ? "password" : "text";
      input.value = c.value;
      if (c.placeholder) input.placeholder = c.placeholder;
      input.addEventListener("change", () => on.change(c.id, input.value));
      body.append(input);
      break;
    }
    case "number": {
      const input = el("input");
      input.type = "number";
      input.min = String(c.min);
      input.max = String(c.max);
      input.value = String(c.value);
      input.addEventListener("change", () => {
        // Empty or unparseable input reads as NaN; leave the stored value alone.
        const n = Number(input.value);
        if (!Number.isFinite(n)) return;
        const next = clamp(n, c.min, c.max);
        input.value = String(next);
        on.change(c.id, next);
      });
      body.append(input);
      break;
    }
    case "path": {
      body.append(el("code", "settings-path", c.value), actions(c.actions, on));
      break;
    }
    case "row": {
      if (c.status) body.append(el("span", "settings-status", c.status));
      body.append(actions(c.actions, on));
      break;
    }
    case "command": {
      body.append(el("code", "settings-command", c.command), actions([{ id: `${c.id}.copy`, label: "Copy" }], on));
      break;
    }
  }
  row.append(body);
  return row;
}

/** Paint the page into `root`: the section list, the current section's
 *  controls, and the error line. Rebuilt on every call. */
export function renderSettings(root: HTMLElement, view: SettingsView, on: SettingsHandlers): void {
  // The DOM is the only memory this function needs: a secret field that was
  // not there a moment ago has just been revealed, so it takes the caret.
  // On every later repaint it is already present and focus is left alone.
  const hadSecret = root.querySelector("input[type='password']") !== null;
  root.replaceChildren();
  const nav = el("nav", "settings-nav");
  for (const s of view.sections) {
    const b = el("button", s.id === view.current ? "settings-nav-item current" : "settings-nav-item", s.label);
    b.type = "button";
    b.addEventListener("click", () => on.pick(s.id));
    nav.append(b);
  }
  const done = el("button", "settings-btn settings-done", "Done");
  done.type = "button";
  done.addEventListener("click", () => on.done());
  nav.append(done);
  const main = el("section", "settings-main");
  main.append(el("h1", "settings-title", view.title));
  for (const c of view.controls) main.append(control(c, on));
  if (view.error) main.append(el("p", "settings-error", view.error));
  root.append(nav, main);
  if (!hadSecret) root.querySelector<HTMLInputElement>("input[type='password']")?.focus();
}

/** Set once the legacy localStorage preferences have been carried over. */
export const MIGRATED_KEY = "folio-settings-migrated";

/** Whether the legacy localStorage preferences should be carried over now:
 *  only when they have never been carried over before, and only onto a
 *  settings file that says nothing yet (`isDefault`). Either way it happens
 *  at most once, so a later edit of the file cannot be undone by stale keys
 *  a browser profile is still holding. */
export function shouldMigrate(storage: Pick<Storage, "getItem">, isDefault: boolean): boolean {
  return storage.getItem(MIGRATED_KEY) === null && isDefault;
}

/** Preferences an older build kept in localStorage, mapped onto Settings.
 *  Null when none of the four keys is present or usable. */
export function migrateLocalSettings(storage: Pick<Storage, "getItem">): Partial<Settings> | null {
  const out: Partial<Settings> = {};
  const rawTheme = storage.getItem("folio-theme");
  if (rawTheme !== null && (THEMES as readonly string[]).includes(rawTheme)) out.theme = storedTheme(rawTheme);
  const watch = storage.getItem("folio-watch");
  if (watch === "on" || watch === "off") out.liveReload = watch === "on";
  const consent = telemetryConsent(storage);
  if (consent !== null) out.telemetry = consent;
  const lens = storage.getItem("folio-lens-settings");
  if (lens) {
    try {
      const parsed = JSON.parse(lens) as { baseUrl?: unknown; model?: unknown };
      if (typeof parsed.baseUrl === "string" && typeof parsed.model === "string") out.lens = { baseUrl: parsed.baseUrl, model: parsed.model };
    } catch {
      // corrupt: ignore
    }
  }
  return Object.keys(out).length === 0 ? null : out;
}
