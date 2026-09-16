import { describe, expect, it } from "vitest";
import { orderSlots, stackSlots } from "../src/annotlayout";

describe("orderSlots", () => {
  it("orders by passage, unresolved last in their given order", () => {
    expect(
      orderSlots([
        { id: "c", anchorTop: 300 },
        { id: "gone2", anchorTop: null },
        { id: "a", anchorTop: 40 },
        { id: "gone1", anchorTop: null },
        { id: "b", anchorTop: 100 },
      ]).map((s) => s.id),
    ).toEqual(["a", "b", "c", "gone2", "gone1"]);
  });
});

describe("stackSlots", () => {
  it("places each card level with its passage when there is room", () => {
    const { placed, listHeight } = stackSlots(
      [
        { id: "a", anchorTop: 100 },
        { id: "b", anchorTop: 700 },
      ],
      { a: 60, b: 60 },
    );
    expect(placed).toEqual([
      { id: "a", top: 100 },
      { id: "b", top: 700 },
    ]);
    expect(listHeight).toBe(700 + 60 + 8);
  });

  it("pushes a card down under the one above rather than overlap", () => {
    const { placed } = stackSlots(
      [
        { id: "a", anchorTop: 100 },
        { id: "b", anchorTop: 120 },
      ],
      { a: 90, b: 40 },
    );
    expect(placed[0]).toEqual({ id: "a", top: 100 });
    expect(placed[1].top).toBeGreaterThanOrEqual(100 + 90 + 8);
  });

  it("stacks unresolved slots after everything, and never overlaps", () => {
    const { placed } = stackSlots(
      [
        { id: "gone", anchorTop: null },
        { id: "a", anchorTop: 0 },
        { id: "b", anchorTop: 50 },
      ],
      { a: 80, b: 80, gone: 80 },
    );
    const order = placed.map((p) => p.id);
    expect(order.indexOf("gone")).toBe(2);
    for (let i = 1; i < placed.length; i++) {
      expect(placed[i].top).toBeGreaterThanOrEqual(placed[i - 1].top + 80);
    }
  });

  it("treats a missing height as one line, not zero", () => {
    const { placed } = stackSlots(
      [
        { id: "a", anchorTop: 0 },
        { id: "b", anchorTop: 0 },
      ],
      {},
    );
    expect(placed[1].top).toBeGreaterThanOrEqual(24 + 8);
  });
});
