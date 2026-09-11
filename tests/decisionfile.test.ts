import { describe, expect, it } from "vitest";
import { decisionFilePath, readTakeaway, writeTakeaway } from "../src/decisionfile";

const PATH = "/docs/plan.md";
const WITH = `# Decision: plan.md

Document: /docs/plan.md

## What I took from it

Ship in stages.

Keep the flag.

## Options

- A
- B
`;

describe("decisionFilePath", () => {
  it("sits beside the document", () => {
    expect(decisionFilePath(PATH)).toBe("/docs/plan.md.decision.md");
  });
});

describe("readTakeaway", () => {
  it("returns the section body, trimmed, keeping inner blank lines", () => {
    expect(readTakeaway(WITH)).toBe("Ship in stages.\n\nKeep the flag.");
  });

  it("is empty without the section or with an empty file", () => {
    expect(readTakeaway("# Decision: plan.md\n\n## Options\n\n- A\n")).toBe("");
    expect(readTakeaway("")).toBe("");
  });
});

describe("writeTakeaway", () => {
  it("creates the skeleton when there is no file", () => {
    expect(writeTakeaway(null, "plan.md", PATH, "Ship in stages.")).toBe(
      "# Decision: plan.md\n\nDocument: /docs/plan.md\n\n## What I took from it\n\nShip in stages.\n",
    );
  });

  it("replaces an existing takeaway and keeps other sections byte-for-byte", () => {
    const out = writeTakeaway(WITH, "plan.md", PATH, "New view.");
    expect(out).toBe(WITH.replace("Ship in stages.\n\nKeep the flag.", "New view."));
    expect(out).toContain("## Options\n\n- A\n- B\n");
  });

  it("adds the section to a file that lacks it, after the header", () => {
    const file = "# Decision: plan.md\n\nDocument: /docs/plan.md\n\n## Options\n\n- A\n";
    const out = writeTakeaway(file, "plan.md", PATH, "Mine.");
    expect(out).toBe("# Decision: plan.md\n\nDocument: /docs/plan.md\n\n## What I took from it\n\nMine.\n\n## Options\n\n- A\n");
  });

  it("keeps the heading with an empty body for an empty takeaway", () => {
    const out = writeTakeaway(WITH, "plan.md", PATH, "");
    expect(out).toBe("# Decision: plan.md\n\nDocument: /docs/plan.md\n\n## What I took from it\n\n## Options\n\n- A\n- B\n");
    expect(readTakeaway(out)).toBe("");
  });
});

import {
  readSection,
  writeSection,
  parseRecall,
  writeRecall,
  parseChecklist,
  writeChecklist,
  parseDecision,
  writeDecision,
  parseRevisits,
  appendRevisit,
  CHECKLIST_ITEMS,
} from "../src/decisionfile";

describe("sections", () => {
  it("reads and writes an arbitrary ## section, preserving the others", () => {
    const base = "# Decision: p.md\n\nDocument: /p.md\n\n## What I took from it\n\nMine.\n";
    const withPre = writeSection(base, "## Premortem", "It failed because the flag never shipped.");
    expect(readSection(withPre, "## Premortem")).toBe("It failed because the flag never shipped.");
    expect(readTakeaway(withPre)).toBe("Mine.");
    const again = writeSection(withPre, "## Premortem", "Second thought.");
    expect(readSection(again, "## Premortem")).toBe("Second thought.");
    expect(again.split("## Premortem").length).toBe(2);
  });
});

describe("recall", () => {
  it("round-trips per-heading recall lines", () => {
    const text = writeRecall(null, "p.md", "/p.md", new Map([["Rollout", "Ship ten percent first."], ["Risks", ""]]));
    expect(parseRecall(text)).toEqual(new Map([["Rollout", "Ship ten percent first."]]));
    expect(readSection(text, "## Recall")).toBe("- **Rollout**: Ship ten percent first.");
  });
});

describe("checklist", () => {
  it("round-trips the three items", () => {
    const text = writeChecklist(null, "p.md", "/p.md", new Set([CHECKLIST_ITEMS[0], CHECKLIST_ITEMS[2]]));
    expect(parseChecklist(text)).toEqual(new Set([CHECKLIST_ITEMS[0], CHECKLIST_ITEMS[2]]));
    expect(readSection(text, "## Checklist")).toContain(`- [x] ${CHECKLIST_ITEMS[0]}`);
    expect(readSection(text, "## Checklist")).toContain(`- [ ] ${CHECKLIST_ITEMS[1]}`);
  });
});

describe("decision", () => {
  const record = {
    choice: "Ship the canary plan",
    reversible: true,
    confidence: 70,
    reasons: "Low blast radius; the flag exists.",
    decided: "2026-09-11",
    revisit: "2026-10-11",
  };

  it("round-trips a decision record", () => {
    const text = writeDecision(null, "p.md", "/p.md", record);
    expect(parseDecision(text)).toEqual(record);
  });

  it("returns null without a decision and tolerates a partial one", () => {
    expect(parseDecision("# Decision: p.md\n")).toBeNull();
    const partial = "# Decision: p.md\n\n## Decision\n\n- Choice: x\n- Confidence: 55%\n";
    expect(parseDecision(partial)).toEqual({ choice: "x", reversible: null, confidence: 55, reasons: "", decided: "", revisit: "" });
  });
});

describe("revisits", () => {
  it("appends dated revisit entries and parses them back", () => {
    let text = writeDecision(null, "p.md", "/p.md", { choice: "x", reversible: false, confidence: 60, reasons: "", decided: "2026-09-11", revisit: "2026-10-11" });
    text = appendRevisit(text, { date: "2026-10-12", outcome: "worse", note: "The flag broke." });
    text = appendRevisit(text, { date: "2026-11-01", outcome: "as expected", note: "" });
    expect(parseRevisits(text)).toEqual([
      { date: "2026-10-12", outcome: "worse", note: "The flag broke." },
      { date: "2026-11-01", outcome: "as expected", note: "" },
    ]);
    expect(parseDecision(text)?.choice).toBe("x");
  });
});
