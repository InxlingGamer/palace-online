import { describe, expect, it } from "vitest";
import { isTap, selectedVisibility } from "./hand-gesture";

describe("hand gestures", () => {
  const tap = { dx: 0, dy: 0, scrollDelta: 0, msSinceLastScroll: 81 };
  it("includes distance and scroll boundaries", () => {
    expect(isTap({ ...tap, dx: 6, dy: 8, scrollDelta: -2 })).toBe(true);
    expect(isTap({ ...tap, dx: 6, dy: 8.1 })).toBe(false);
    expect(isTap({ ...tap, scrollDelta: 2.01 })).toBe(false);
    expect(isTap({ ...tap, scrollDelta: -2.01 })).toBe(false);
  });
  it("rejects touches that stop a glide", () => {
    expect(isTap({ ...tap, msSinceLastScroll: 80 })).toBe(false);
    expect(isTap({ ...tap, msSinceLastScroll: 0 })).toBe(false);
    expect(isTap({ ...tap, msSinceLastScroll: Infinity })).toBe(true);
  });
});

describe("selected strip visibility", () => {
  it("counts both edges and finds the nearest hidden selection regardless of input order", () => {
    expect(
      selectedVisibility(32, 168, [
        { index: 0, left: -24, right: 0 },
        { index: 1, left: 0, right: 24 },
        { index: 4, left: 200, right: 270 },
        { index: 3, left: 168, right: 192 },
        { index: 2, left: 48, right: 72 },
      ]),
    ).toEqual({ hiddenLeft: 2, hiddenRight: 2, nearestLeft: 1, nearestRight: 3 });
  });
  it("requires twelve visible pixels, including the last card's full width", () => {
    expect(
      selectedVisibility(32, 168, [
        { index: 0, left: 20, right: 44 },
        { index: 1, left: 157, right: 227 },
      ]),
    ).toEqual({ hiddenLeft: 0, hiddenRight: 1, nearestLeft: undefined, nearestRight: 1 });
    expect(selectedVisibility(0, 200, [])).toEqual({
      hiddenLeft: 0,
      hiddenRight: 0,
      nearestLeft: undefined,
      nearestRight: undefined,
    });
  });
});
