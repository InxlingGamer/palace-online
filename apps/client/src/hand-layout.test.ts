import { describe, expect, it } from "vitest";
import { handLayout } from "./hand-layout";
describe("handLayout", () => {
  it("handles empty and single card hands", () => {
    expect(handLayout(402, 70, 0, 24)).toEqual({ step: 0, width: 0, overflows: false });
    expect(handLayout(402, 70, 1, 24)).toEqual({ step: 0, width: 70, overflows: false });
  });
  it("uses a natural gap when space permits", () => {
    expect(handLayout(1000, 96, 3, 22)).toEqual({ step: 104, width: 304, overflows: false });
  });
  it("fits 22 cards on a desktop without shrinking the readable strip", () => {
    for (const width of [1200, 1280, 1760]) {
      const layout = handLayout(width, 96, 22, 22);
      expect(layout.width).toBeLessThanOrEqual(width);
      expect(layout.step).toBeGreaterThanOrEqual(22);
      expect(layout.overflows).toBe(false);
    }
  });
  it("tightens a portrait hand before scrolling", () => {
    const layout = handLayout(402, 70, 14, 24);
    expect(layout.width).toBe(402);
    expect(layout.step).toBeGreaterThanOrEqual(24);
    expect(layout.overflows).toBe(false);
  });
  it("keeps 24px visible for a large portrait hand", () => {
    expect(handLayout(402, 70, 22, 24)).toEqual({ step: 24, width: 574, overflows: true });
  });
  it("responds to resizing and the exact minimum boundary", () => {
    expect(handLayout(406, 70, 15, 24).overflows).toBe(false);
    expect(handLayout(400, 70, 15, 24).overflows).toBe(true);
    expect(handLayout(850, 70, 22, 24).overflows).toBe(false);
  });
});
