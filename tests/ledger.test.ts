import { describe, expect, it } from "vitest";
import { parseFeedback, requestOutcomes, revisionLabel } from "../src/ledger";

const FEEDBACK = `# Review feedback: plan.md

Verdict: **changes requested** (3 annotations)

## 1. Replace L3 "Ship to all users at once."

> Ship to all users at once.

Suggested replacement:

Canary first.

## 2. Delete "Watch the error rate."

> Watch the error rate.

Remove this section.

## 3. Comment on L5–6 "Roll back by flipping the flag."

> Roll back by flipping the flag.

Who owns the flag?

## Keep as is

- L9 "Done."
`;

describe("parseFeedback", () => {
  it("recovers each change request's kind and quote, ignoring Keep as is", () => {
    expect(parseFeedback(FEEDBACK)).toEqual([
      { kind: "replace", quote: "Ship to all users at once." },
      { kind: "delete", quote: "Watch the error rate." },
      { kind: "comment", quote: "Roll back by flipping the flag." },
    ]);
  });

  it("returns nothing for an approval", () => {
    expect(parseFeedback("# Review feedback: x\n\nVerdict: **approved** — no changes requested.\n")).toEqual([]);
  });
});

describe("requestOutcomes", () => {
  const before = "Ship to all users at once. Watch the error rate.\nRoll back by flipping the flag.";
  const after = "Ship to ten percent first. Watch the error rate.\nRoll back by flipping the flag, and say who owns it.";

  it("reports whether each quoted passage still appears unchanged", () => {
    const out = requestOutcomes(parseFeedback(FEEDBACK), after);
    expect(out.map((o) => [o.kind, o.changed])).toEqual([
      ["replace", true],
      ["delete", false],
      // The sentence was extended, but the quoted words are still there.
      ["comment", false],
    ]);
    expect(before).not.toBe(after);
  });

  it("is tolerant of whitespace and inline syntax in the after text", () => {
    const out = requestOutcomes([{ kind: "delete", quote: "Watch the error rate." }], "Watch   the\nerror *rate.*");
    expect(out[0].changed).toBe(false);
  });
});

describe("revisionLabel", () => {
  it("names each origin for a reader", () => {
    expect(revisionLabel("external")).toBe("agent rewrite");
    expect(revisionLabel("revision")).toBe("revised after your feedback");
    expect(revisionLabel("folio")).toBe("your save");
    expect(revisionLabel("unknown")).toBe("as opened");
  });
});
