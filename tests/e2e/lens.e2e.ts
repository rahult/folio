import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  axButtons,
  choosePopup,
  clickButton,
  docTitle,
  focusApp,
  folio,
  homeFor,
  launchApp,
  menu,
  quitApp,
  readHome,
  removeHome,
  seedHome,
  settingsOf,
  setTextField,
  waitFor,
  withArtifacts,
} from "./mac";

const OLLAMA = "http://localhost:11434/v1";

/** A small chat model of a local Ollama, or null when none answers within
 *  2 s. Embedding models cannot answer a lens prompt at all, and of the rest
 *  the smallest one worth having is preferred: a Premortem over the fixture
 *  is a real generation, and `llama3.2:1b` returns one in seconds where a 7B
 *  model can take most of the timeout. */
async function localModel(): Promise<string | null> {
  try {
    const res = await fetch(`${OLLAMA}/models`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: { id: string }[] };
    const ids = (body.data ?? []).map((m) => m.id).filter((id) => !id.includes("embed"));
    return ids.find((id) => id === "llama3.2:1b") ?? ids[0] ?? null;
  } catch {
    return null;
  }
}

const model = await localModel();
const home = homeFor("lens");

beforeAll(async () => {
  if (model === null) return;
  seedHome(home);
  await launchApp(home);
});

afterAll(async () => {
  if (model === null) return;
  await quitApp();
  removeHome(home);
});

describe("lens", () => {
  it.skipIf(model === null)("runs Premortem against the local model and appends a Reading", () =>
    withArtifacts("lens-premortem", async () => {
      // The clicks below land on whatever is on top at their point of the
      // screen, and the app is not always in front when a file starts.
      await focusApp();
      await menu("Folio", "Settings…");
      await waitFor(async () => (await axButtons()).includes("Done"), { timeoutMs: 5_000, what: "the Settings page" });
      await clickButton("Lenses");
      await waitFor(async () => (await axButtons()).includes("Reveal"), { timeoutMs: 5_000, what: "the Lenses section" });
      await setTextField("Endpoint URL", OLLAMA);
      await setTextField("Model", model!);
      await clickButton("Done");
      // `Run lens` is disabled until both halves are stored, and a disabled
      // button takes a click without a word; read them back instead of
      // spending the lens timeout on a click that never ran anything.
      await waitFor(() => {
        const lens = settingsOf(home)?.lens as { baseUrl?: string; model?: string } | undefined;
        return lens?.baseUrl === OLLAMA && lens?.model === model;
      }, {
        timeoutMs: 5_000,
        what: "the endpoint and model in settings.json",
      });
      const r = await folio(["docs/sample.md"], { home, cwd: home });
      expect(r.code, r.stderr).toBe(0);
      await waitFor(async () => (await docTitle()) === "sample.md", { timeoutMs: 5_000, what: "sample.md open" });
      await menu("View", "Reading Panel");
      await clickButton("Lenses");
      await waitFor(async () => (await axButtons()).includes("Run lens"), { timeoutMs: 5_000, what: "the Lenses view" });
      await choosePopup("Premortem");
      await clickButton("Run lens");
      await waitFor(() => (readHome(home, "docs/sample.md.analysis.md") ?? "").includes("## Lens: Premortem"), {
        timeoutMs: 90_000,
        everyMs: 1000,
        what: "a Premortem reading in sample.md.analysis.md",
      });
      expect(readHome(home, "docs/sample.md.analysis.md")).toContain(`— ${model!}`);
    }));
});
