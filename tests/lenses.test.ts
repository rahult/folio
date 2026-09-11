import { describe, expect, it } from "vitest";
import {
  BUILTIN_LENSES,
  parseLensFile,
  buildLensMessages,
  appendLensResult,
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
  it("appends a lens result as its own section and parses them newest first", () => {
    let text = appendLensResult(null, "plan.md", "/p.md", {
      lens: "Second-order effects",
      model: "llama3.2:3b",
      date: "2026-09-12",
      scope: "document",
      body: "## Effects\n\n- Fewer pages.",
    });
    text = appendLensResult(text, "plan.md", "/p.md", {
      lens: "Premortem",
      model: "gpt-4.1",
      date: "2026-09-13",
      scope: "Ship it.",
      body: "It failed because…",
    });
    expect(text.startsWith("# Analysis: plan.md\n\nDocument: /p.md\n")).toBe(true);
    const entries = parseAnalysis(text);
    expect(entries.map((e) => e.lens)).toEqual(["Premortem", "Second-order effects"]);
    expect(entries[1]).toMatchObject({ model: "llama3.2:3b", date: "2026-09-12", scope: "document" });
    // Headings inside results are demoted two levels so they nest under the entry.
    expect(entries[1].body).toBe("#### Effects\n\n- Fewer pages.");
    expect(entries[0].scope).toBe("Ship it.");
  });

  it("demotes headings inside a result so they cannot break the sections", () => {
    const text = appendLensResult(null, "p.md", "/p.md", {
      lens: "Council",
      model: "m",
      date: "2026-09-12",
      scope: "document",
      body: "# Verdict\n\nfine\n\n## Lens: fake\n\nno",
    });
    const entries = parseAnalysis(text);
    expect(entries).toHaveLength(1);
    expect(entries[0].body).toContain("### Verdict");
  });
});
