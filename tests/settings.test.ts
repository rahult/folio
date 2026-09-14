import { describe, expect, it } from "vitest";
import { migrateLocalSettings, settingsView, type SettingsModel } from "../src/settings";

function model(overrides: Partial<SettingsModel> = {}): SettingsModel {
  return {
    settings: {
      homeDir: null,
      theme: "paper",
      liveReload: true,
      telemetry: null,
      checkUpdates: true,
      review: { float: true, agent: "agent", timeoutSecs: 540 },
      lens: { baseUrl: "", model: "" },
    },
    homePath: "/Users/me/Documents/Folio",
    section: "general",
    hasKey: false,
    version: "0.14.0",
    lensesFolder: "/Users/me/Documents/Folio/lenses",
    prompts: { lensRules: false, feedbackInstructions: false, skill: false, lensOverrides: [] },
    builtinLenses: [
      { id: "council", name: "Council of experts", description: "Five specialists." },
      { id: "premortem", name: "Premortem", description: "It failed." },
    ],
    skills: [
      { target: "claude", label: "Claude Code", path: "/Users/me/.claude/skills/folio/SKILL.md", state: "missing" },
      { target: "agents", label: "Codex and others", path: "/Users/me/.agents/skills/folio/SKILL.md", state: "outdated" },
    ],
    cli: { link: null, target: null, ours: false },
    keyEntry: false,
    error: null,
    ...overrides,
  };
}

const ids = (m: SettingsModel) => settingsView(m).controls.map((c) => c.id);

describe("settingsView", () => {
  it("lists six sections and marks the current one", () => {
    const v = settingsView(model());
    expect(v.sections.map((s) => s.id)).toEqual(["general", "review", "lenses", "prompts", "agents", "about"]);
    expect(v.current).toBe("general");
    expect(v.title).toBe("General");
  });

  it("renders the general controls from the settings", () => {
    const v = settingsView(model({ settings: { ...model().settings, theme: "night", liveReload: false, telemetry: true } }));
    expect(ids(model())).toEqual(["home", "theme", "liveReload", "telemetry", "checkUpdates"]);
    const theme = v.controls.find((c) => c.id === "theme");
    expect(theme).toMatchObject({ kind: "radio", value: "night" });
    expect(theme && theme.kind === "radio" ? theme.options.map((o) => o.value) : []).toEqual(["paper", "manuscript", "newsprint", "night", "slate"]);
    expect(v.controls.find((c) => c.id === "liveReload")).toMatchObject({ kind: "toggle", value: false });
    expect(v.controls.find((c) => c.id === "telemetry")).toMatchObject({ kind: "toggle", value: true });
    expect(v.controls.find((c) => c.id === "home")).toMatchObject({
      kind: "path",
      value: "/Users/me/Documents/Folio",
      actions: [{ id: "home.choose", label: "Choose…" }, { id: "home.reveal", label: "Reveal" }],
    });
  });

  it("clamps the review timeout control to the allowed range", () => {
    const withTimeout = (timeoutSecs: number) =>
      settingsView(model({ section: "review", settings: { ...model().settings, review: { ...model().settings.review, timeoutSecs } } })).controls.find(
        (c) => c.id === "review.timeoutSecs",
      );
    expect(withTimeout(540)).toMatchObject({ kind: "number", value: 540, min: 60, max: 540 });
    expect(withTimeout(300)).toMatchObject({ value: 300 });
    expect(withTimeout(10)).toMatchObject({ value: 60 });
    expect(withTimeout(9999)).toMatchObject({ value: 540 });
    expect(ids(model({ section: "review" }))).toEqual(["review.float", "review.agent", "review.timeoutSecs"]);
  });

  it("shows the key as set or not and offers the right action", () => {
    const unset = settingsView(model({ section: "lenses" })).controls.find((c) => c.id === "lens.key");
    expect(unset).toMatchObject({ kind: "row", status: "not set", actions: [{ id: "lens.key.set", label: "Set…" }] });
    const set = settingsView(model({ section: "lenses", hasKey: true })).controls.find((c) => c.id === "lens.key");
    expect(set).toMatchObject({ status: "set", actions: [{ id: "lens.key.set", label: "Replace…" }, { id: "lens.key.clear", label: "Clear", danger: true }] });
  });

  it("reveals the inline key field only while one is being typed", () => {
    expect(ids(model({ section: "lenses" }))).toEqual(["lens.baseUrl", "lens.model", "lens.key", "lensesFolder"]);
    const v = settingsView(model({ section: "lenses", keyEntry: true }));
    expect(ids(model({ section: "lenses", keyEntry: true }))).toEqual(["lens.baseUrl", "lens.model", "lens.key", "lens.key.value", "lensesFolder"]);
    expect(v.controls.find((c) => c.id === "lens.key.value")).toMatchObject({ kind: "text", value: "" });
  });

  it("marks prompts built-in or edited and lists every built-in lens", () => {
    const m = model({ section: "prompts", prompts: { lensRules: true, feedbackInstructions: false, skill: false, lensOverrides: ["premortem"] } });
    const v = settingsView(m);
    expect(v.controls.find((c) => c.id === "prompt.lensRules")).toMatchObject({ status: "edited", actions: [{ id: "prompt.lensRules.edit", label: "Edit in Folio" }, { id: "prompt.lensRules.reset", label: "Reset", danger: true }] });
    expect(v.controls.find((c) => c.id === "prompt.feedbackInstructions")).toMatchObject({ status: "none", actions: [{ id: "prompt.feedbackInstructions.edit", label: "Edit in Folio" }] });
    expect(v.controls.find((c) => c.id === "prompt.lens.council")).toMatchObject({ status: "built-in", actions: [{ id: "prompt.lens.council.edit", label: "Edit in Folio" }] });
    expect(v.controls.find((c) => c.id === "prompt.lens.premortem")).toMatchObject({ status: "edited", actions: [{ id: "prompt.lens.premortem.edit", label: "Edit in Folio" }, { id: "prompt.lens.premortem.reset", label: "Reset", danger: true }] });
  });

  it("labels skill rows by state and shows the Pi and install commands", () => {
    const v = settingsView(model({ section: "agents", cli: { link: "/Users/me/.local/bin/folio", target: "/Applications/Folio.app/Contents/MacOS/folio", ours: true } }));
    expect(v.controls.find((c) => c.id === "skill.claude")).toMatchObject({ kind: "row", status: "not installed", actions: [{ id: "skill.claude.install", label: "Install" }] });
    expect(v.controls.find((c) => c.id === "skill.agents")).toMatchObject({ status: "outdated", actions: [{ id: "skill.agents.install", label: "Update" }] });
    expect(v.controls.find((c) => c.id === "skill.pi")).toMatchObject({ kind: "command", command: "npx skills add rahult/folio -a pi" });
    expect(v.controls.find((c) => c.id === "cli")).toMatchObject({ status: "folio → /Users/me/.local/bin/folio → /Applications/Folio.app/Contents/MacOS/folio", actions: [{ id: "cli.install", label: "Install" }] });
    const elsewhere = settingsView(model({ section: "agents", cli: { link: "/usr/local/bin/folio", target: "/opt/other/folio", ours: false } }));
    expect(elsewhere.controls.find((c) => c.id === "cli")).toMatchObject({ status: "linked elsewhere: /opt/other/folio" });
    const none = settingsView(model({ section: "agents" }));
    expect(none.controls.find((c) => c.id === "cli")).toMatchObject({ status: "not installed" });
  });

  it("carries the error and the about version", () => {
    expect(settingsView(model({ error: "boom" })).error).toBe("boom");
    expect(settingsView(model({ section: "about" })).controls.find((c) => c.id === "about.version")).toMatchObject({ kind: "info", text: "Folio 0.14.0" });
  });
});

describe("migrateLocalSettings", () => {
  const storage = (data: Record<string, string>) => ({ getItem: (k: string) => data[k] ?? null });

  it("returns null when nothing was stored", () => {
    expect(migrateLocalSettings(storage({}))).toBeNull();
  });

  it("maps every legacy key", () => {
    const out = migrateLocalSettings(
      storage({
        "folio-theme": "slate",
        "folio-watch": "off",
        "folio-telemetry": "on",
        "folio-lens-settings": JSON.stringify({ baseUrl: "http://localhost:11434/v1", model: "llama3.2:3b" }),
      }),
    );
    expect(out).toEqual({ theme: "slate", liveReload: false, telemetry: true, lens: { baseUrl: "http://localhost:11434/v1", model: "llama3.2:3b" } });
  });

  it("carries a declined telemetry choice across", () => {
    expect(migrateLocalSettings(storage({ "folio-telemetry": "off" }))).toEqual({ telemetry: false });
    expect(migrateLocalSettings(storage({ "folio-telemetry": "garbage" }))).toBeNull();
  });

  it("ignores unknown themes and corrupt lens json", () => {
    expect(migrateLocalSettings(storage({ "folio-theme": "neon", "folio-lens-settings": "{nope" }))).toBeNull();
  });
});
