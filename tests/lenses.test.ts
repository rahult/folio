import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BUILTIN_LENSES,
  parseLensFile,
  buildLensMessages,
  parseAnalysis,
} from "../src/lenses";

describe("built-in lenses", () => {
  it("ships the named lenses with prompts", () => {
    const ids = BUILTIN_LENSES.map((l) => l.id);
    for (const id of ["council", "second-order", "two-way-door", "working-backwards", "premortem", "inversion", "steelman", "assumptions"]) {
      expect(ids).toContain(id);
    }
    for (const lens of BUILTIN_LENSES) expect(lens.prompt.length).toBeGreaterThan(80);
  });
});

describe("parseLensFile", () => {
  it("reads frontmatter name and description with the body as the prompt", () => {
    const lens = parseLensFile("regulator", "---\nname: The regulator\ndescription: Read as a regulator would.\n---\n\nYou are a regulator. List every claim that would need evidence.\n");
    expect(lens).toEqual({
      id: "custom:regulator",
      name: "The regulator",
      description: "Read as a regulator would.",
      prompt: "You are a regulator. List every claim that would need evidence.",
      builtin: false,
    });
  });

  it("falls back to the file name without frontmatter", () => {
    const lens = parseLensFile("plain", "Just a prompt.");
    expect(lens.name).toBe("plain");
    expect(lens.prompt).toBe("Just a prompt.");
  });
});

describe("buildLensMessages", () => {
  const lens = BUILTIN_LENSES[0];

  it("puts the document in the user message and asks for Markdown", () => {
    const { system, user } = buildLensMessages(lens, "plan.md", "# Plan\n\nShip it.", null);
    expect(system).toContain(lens.prompt);
    expect(system).toMatch(/Markdown/);
    expect(user).toContain("# Plan");
    expect(user).toContain("plan.md");
  });

  it("marks the selected passage as the focus and keeps the document as context", () => {
    const { user } = buildLensMessages(lens, "plan.md", "# Plan\n\nShip it. Watch it.", "Ship it.");
    expect(user).toMatch(/passage under review/i);
    expect(user.indexOf("Ship it.")).toBeGreaterThan(-1);
    expect(user).toContain("Watch it.");
  });
});

describe("analysis file", () => {
  it("parses lens sections newest first with their scope", () => {
    const text = [
      "# Analysis: plan.md",
      "",
      "Document: /p.md",
      "",
      "## Lens: Council — 2026-09-14 — llama3.2:3b",
      "",
      "Scope: the whole document",
      "",
      "- one",
      "",
      "## Lens: Inversion — 2026-09-15 — llama3.2:3b",
      "",
      'Scope: "the passage"',
      "",
      "### Top",
      "",
      "b",
      "",
    ].join("\n");
    const entries = parseAnalysis(text);
    expect(entries.map((e) => e.lens)).toEqual(["Inversion", "Council"]);
    expect(entries[0].scope).toBe("the passage");
    expect(entries[0].body).toBe("### Top\n\nb");
    expect(entries[1].scope).toBe("document");
    expect(entries[1].model).toBe("llama3.2:3b");
  });

  it("parses the Analysis file the Rust core writes", () => {
    const text = readFileSync("src-tauri/crates/core/tests/fixtures/analysis/two-readings.md", "utf8");
    const entries = parseAnalysis(text);
    expect(entries.map((e) => [e.lens, e.date, e.model])).toEqual([
      ["Inversion", "2026-09-15", "claude (agent)"],
      ["Council", "2026-09-14", "llama3.2:3b"],
    ]);
    expect(entries[0].scope).toBe("the passage");
    expect(entries[0].body).toBe("### Top\n\nb");
    expect(entries[1].scope).toBe("document");
    expect(entries[1].body).toBe("- one\n- two");
  });
});
