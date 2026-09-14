import { describe, expect, it } from "vitest";
import { PANEL_DEFAULT_WIDTH, clampPanelWidth, storedPanelWidth } from "../src/panelwidth";

describe("panel width", () => {
  it("clamps into the allowed range and rounds", () => {
    expect(clampPanelWidth(100)).toBe(240);
    expect(clampPanelWidth(9999)).toBe(520);
    expect(clampPanelWidth(300.6)).toBe(301);
    expect(clampPanelWidth(Number.NaN)).toBe(PANEL_DEFAULT_WIDTH);
  });

  it("starts from the stored width, or the default", () => {
    expect(storedPanelWidth(null)).toBe(300);
    expect(storedPanelWidth("410")).toBe(410);
    expect(storedPanelWidth("nope")).toBe(300);
    expect(storedPanelWidth("50")).toBe(240);
  });
});
