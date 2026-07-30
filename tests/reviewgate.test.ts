import { describe, expect, it } from "vitest";
import {
  barModel,
  feedbackWithEditNote,
  type ReviewRequest,
  type ReviewState,
} from "../src/reviewgate";

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

describe("review bar model", () => {
  it("stays hidden with no request", () => {
    expect(barModel(null, 0).visible).toBe(false);
  });

  it("stays hidden once a verdict has been recorded", () => {
    expect(barModel(request("approved"), 0).visible).toBe(false);
    expect(barModel(request("changes"), 3).visible).toBe(false);
  });

  it("shows while an agent is waiting", () => {
    expect(barModel(request("waiting"), 0).visible).toBe(true);
  });

  it("names the waiting agent", () => {
    expect(barModel(request("waiting", "codex"), 0).label).toContain("codex");
  });

  it("makes approve primary on a clean document", () => {
    const model = barModel(request("waiting"), 0);
    expect(model.primary).toBe("approved");
    expect(model.label).toContain("no annotations");
  });

  it("makes request-changes primary once the document is marked up", () => {
    const model = barModel(request("waiting"), 3);
    expect(model.primary).toBe("changes");
    expect(model.label).toContain("3 annotations");
  });

  it("singularizes a lone annotation", () => {
    expect(barModel(request("waiting"), 1).label).toContain("1 annotation");
    expect(barModel(request("waiting"), 1).label).not.toContain("annotations");
  });
});

describe("edit note", () => {
  it("is absent when the document was untouched", () => {
    expect(feedbackWithEditNote("# Feedback\n", false)).toBe("# Feedback\n");
  });

  it("tells the agent to re-read a document edited during review", () => {
    const out = feedbackWithEditNote("# Feedback\n", true);
    expect(out).toContain("# Feedback");
    expect(out).toMatch(/re-read/i);
  });
});
