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
