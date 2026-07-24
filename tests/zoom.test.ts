import { describe, expect, it } from "vitest";
import { clampZoom, nextZoom, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from "../src/zoom";

describe("clampZoom", () => {
  it("clamps to the 0.6–2.0 range", () => {
    expect(clampZoom(0.2)).toBe(ZOOM_MIN);
    expect(clampZoom(3)).toBe(ZOOM_MAX);
    expect(clampZoom(1.3)).toBe(1.3);
  });
});

describe("nextZoom", () => {
  it("steps in and out by 0.1", () => {
    expect(nextZoom(1, "in")).toBeCloseTo(1 + ZOOM_STEP);
    expect(nextZoom(1, "out")).toBeCloseTo(1 - ZOOM_STEP);
  });

  it("does not accumulate floating point error over many steps", () => {
    let zoom = 1;
    for (let i = 0; i < 7; i++) zoom = nextZoom(zoom, "in");
    expect(zoom).toBe(1.7);
    for (let i = 0; i < 7; i++) zoom = nextZoom(zoom, "out");
    expect(zoom).toBe(1);
  });

  it("clamps at the bounds instead of overshooting", () => {
    expect(nextZoom(ZOOM_MAX, "in")).toBe(ZOOM_MAX);
    expect(nextZoom(ZOOM_MIN, "out")).toBe(ZOOM_MIN);
    expect(nextZoom(1.95, "in")).toBe(ZOOM_MAX);
  });

  it("resets to 1 from anywhere", () => {
    expect(nextZoom(1.8, "reset")).toBe(1);
    expect(nextZoom(0.7, "reset")).toBe(1);
  });
});
