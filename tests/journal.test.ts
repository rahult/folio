import { describe, expect, it } from "vitest";
import { journalEntryLine, parseJournal, dueRevisits } from "../src/journal";

describe("journal", () => {
  const line = journalEntryLine({
    date: "2026-09-11",
    docPath: "/docs/plan.md",
    docName: "plan.md",
    choice: "Ship the canary plan",
    confidence: 70,
    reversible: true,
    revisit: "2026-10-11",
  });

  it("writes one line per decision that parses back", () => {
    expect(line).toBe(
      "- 2026-09-11 · [plan.md](/docs/plan.md) · Ship the canary plan · 70% · reversible · revisit 2026-10-11",
    );
    expect(parseJournal(`# Decisions\n\n${line}\n`)).toEqual([
      {
        date: "2026-09-11",
        docPath: "/docs/plan.md",
        docName: "plan.md",
        choice: "Ship the canary plan",
        confidence: 70,
        reversible: true,
        revisit: "2026-10-11",
      },
    ]);
  });

  it("lists entries whose revisit date has passed without an outcome", () => {
    const entries = parseJournal(
      `${line}\n- 2026-09-11 · [b.md](/b.md) · Other · 55% · irreversible · revisit 2026-12-01\n`,
    );
    const due = dueRevisits(entries, "2026-10-15", (path) => (path === "/docs/plan.md" ? [] : []));
    expect(due.map((e) => e.docPath)).toEqual(["/docs/plan.md"]);
    const done = dueRevisits(entries, "2026-10-15", (path) =>
      path === "/docs/plan.md" ? [{ date: "2026-10-12", outcome: "worse", note: "" }] : [],
    );
    expect(done).toEqual([]);
  });
});
