import { describe, expect, it } from "vitest";
import { barModel, type ReviewRequest, type ReviewState } from "../src/reviewgate";
import { makeAnnotation } from "../src/annotations";

function request(state: ReviewState, agent = "claude"): ReviewRequest {
  return {
    path: "/docs/plan.md",
    agent,
    pid: 1,
    requestedAt: "1000",
    state,
    decidedAt: null,
    feedback: null,
    documentEdited: false,
  };
}

const comment = () => makeAnnotation("comment", "q", "note");
const keep = () => makeAnnotation("approve", "q", "");

describe("review bar model", () => {
  it("stays hidden with no request", () => {
    expect(barModel(null, []).visible).toBe(false);
  });

  it("stays hidden once a verdict has been recorded", () => {
    expect(barModel(request("approved"), []).visible).toBe(false);
    expect(barModel(request("changes"), [comment(), comment(), comment()]).visible).toBe(false);
  });

  it("shows while an agent is waiting", () => {
    expect(barModel(request("waiting"), []).visible).toBe(true);
  });

  it("names the waiting agent", () => {
    expect(barModel(request("waiting", "codex"), []).label).toContain("codex");
    expect(barModel({ ...request("waiting"), agentAlive: true }, []).label).toContain(
      "claude waiting",
    );
  });

  it("says when the agent's process is gone but the verdict will keep", () => {
    const model = barModel({ ...request("waiting", "pi"), agentAlive: false }, [
      comment(),
      comment(),
    ]);
    expect(model.visible).toBe(true);
    expect(model.label).toContain("pi left");
    expect(model.label).toContain("kept");
    expect(model.label).toContain("2 notes");
    expect(model.primary).toBe("changes");
  });

  it("states the approval consequence on a clean document", () => {
    const model = barModel(request("waiting"), []);
    expect(model.primary).toBe("approved");
    expect(model.label).toContain("no notes yet");
    expect(model.label).toContain("as-is");
  });

  it("makes request-changes primary once the document is marked up", () => {
    const model = barModel(request("waiting"), [comment(), comment(), comment()]);
    expect(model.primary).toBe("changes");
    expect(model.label).toContain("3 notes");
    expect(model.label).toContain("go back on send");
  });

  it("singularizes a lone note", () => {
    const model = barModel(request("waiting"), [comment()]);
    expect(model.label).toContain("1 note goes back on send");
    expect(model.label).not.toContain("notes");
  });

  it("counts keeps alongside change requests", () => {
    const model = barModel(request("waiting"), [comment(), comment(), keep()]);
    expect(model.primary).toBe("changes");
    expect(model.label).toContain("2 notes");
    expect(model.label).toContain("1 marked good");
  });

  it("names keeps when only passages are marked good", () => {
    const model = barModel(request("waiting"), [keep()]);
    expect(model.primary).toBe("approved");
    expect(model.label).toContain("1 marked good");
    expect(model.label).toContain("as-is");
  });

  it("returns a fresh hidden object each call, not a shared reference", () => {
    const a = barModel(null, []);
    const b = barModel(null, []);
    expect(a).not.toBe(b);
    (a as { visible: boolean }).visible = true;
    expect(b.visible).toBe(false);
  });
});
