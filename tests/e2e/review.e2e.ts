import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  axTexts,
  clickButton,
  docTitle,
  folio,
  homeFor,
  keyCode,
  keys,
  launchApp,
  quitApp,
  readHome,
  removeHome,
  reviewLabel,
  seedHome,
  waitFor,
  windowCount,
  withArtifacts,
} from "./mac";

const home = homeFor("review");
let doc = "";

beforeAll(async () => {
  ({ doc } = seedHome(home));
  await launchApp(home);
});

afterAll(async () => {
  await quitApp();
  rmSync(`${doc}.feedback.md`, { force: true });
  removeHome(home);
});

describe("review", () => {
  it("opens a relative path handed to the running app", () =>
    withArtifacts("review-relative-path", async () => {
      expect(await docTitle()).toBe("Untitled");
      const before = await windowCount();
      const r = await folio(["review", "docs/sample.md"], { home, cwd: home });
      expect(r.code, r.stderr).toBe(0);
      await waitFor(async () => (await windowCount()) === before + 1, { timeoutMs: 5_000, what: "a new window" });
      await waitFor(async () => (await docTitle()) === "sample.md", { timeoutMs: 5_000, what: "sample.md in the toolbar" });
    }));

  it("brings the same file forward instead of opening it twice", () =>
    withArtifacts("review-same-file", async () => {
      const before = await windowCount();
      const r = await folio(["review", "docs/sample.md"], { home, cwd: home });
      expect(r.code, r.stderr).toBe(0);
      await new Promise((res) => setTimeout(res, 2000));
      expect(await windowCount()).toBe(before);
      expect(await docTitle()).toBe("sample.md");
    }));

  it("approves through the bar and hands the feedback back", () =>
    withArtifacts("review-approve", async () => {
      const pending = folio(["review", "--wait", "--agent", "e2e", "docs/sample.md"], { home, cwd: home, timeoutMs: 60_000 });
      await waitFor(async () => (await reviewLabel())?.startsWith("⏳ e2e waiting") ?? false, { timeoutMs: 10_000, what: "the review bar" });
      await clickButton("✓ Approve");
      // Approving pauses once for a premortem — "or send anyway (⏎)" — when
      // the decision file has no "## Premortem" section, which a fresh home
      // never has. The second click sends.
      await waitFor(async () => (await axTexts()).some((t) => t.startsWith("Before approving:")), {
        timeoutMs: 5_000,
        what: "the premortem nudge",
      });
      await clickButton("✓ Approve");
      const r = await pending;
      expect(r.code, r.stderr).toBe(0);
      expect(r.stdout.startsWith("# Review feedback: sample.md")).toBe(true);
      const beside = readHome(home, "docs/sample.md.feedback.md");
      expect(beside).toBe(r.stdout);
    }));

  it("requests changes with a comment typed in review mode", () =>
    withArtifacts("review-changes", async () => {
      const pending = folio(["review", "--wait", "--agent", "e2e", "docs/sample.md"], { home, cwd: home, timeoutMs: 60_000 });
      await waitFor(async () => (await reviewLabel())?.startsWith("⏳ e2e waiting") ?? false, { timeoutMs: 10_000, what: "the review bar" });
      await keys("c");
      await keys("Why this?");
      await keyCode(36);
      await waitFor(async () => (await reviewLabel())?.includes("1 annotation") ?? false, { timeoutMs: 5_000, what: "the annotation count" });
      await clickButton("Request changes");
      const r = await pending;
      expect(r.code, r.stderr).toBe(2);
      expect(r.stdout).toContain("## 1. Comment on L");
      expect(r.stdout).toContain("Why this?");
      expect(r.stdout).not.toContain("## Keep as is");
      expect(readFileSync(join(home, "docs/sample.md.feedback.md"), "utf8")).toBe(r.stdout);
    }));
});
