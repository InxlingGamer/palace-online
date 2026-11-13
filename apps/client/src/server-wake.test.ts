import { describe, expect, it } from "vitest";
import { serverRestarted, wakingBanner } from "./server-wake";

describe("waking banner", () => {
  it("hides on connection and resets after recovery", () => {
    expect(wakingBanner(true, null, 10000, true)).toBe("hidden");
    expect(wakingBanner(false, 10000, 10001, true)).toBe("reconnecting");
  });
  it("waits more than four seconds, including a zero start time", () => {
    expect(wakingBanner(false, 0, 3999, true)).toBe("reconnecting");
    expect(wakingBanner(false, 0, 4000, true)).toBe("reconnecting");
    expect(wakingBanner(false, 0, 4001, true)).toBe("waking");
    expect(wakingBanner(false, null, 10000, true)).toBe("reconnecting");
  });
  it("asks for a tap once Socket.IO has stopped retrying", () => {
    expect(wakingBanner(false, 0, 10000, true, false)).toBe("stopped");
    expect(wakingBanner(true, null, 10000, true, false)).toBe("hidden");
  });
  it("prioritizes the browser's offline state and resumes on coming online", () => {
    expect(wakingBanner(true, null, 10000, false)).toBe("offline");
    expect(wakingBanner(false, 0, 10000, false)).toBe("offline");
    expect(wakingBanner(false, 0, 10000, true)).toBe("waking");
  });
});

describe("restart detection", () => {
  it.each([
    ["old", "new", true],
    ["same", "same", false],
    [null, "new", false],
    ["old", null, false],
    [null, null, false],
    ["", "new", false],
    ["old", "", false],
  ])("compares stored %s with current %s", (stored, current, expected) => {
    expect(serverRestarted(stored, current)).toBe(expected);
  });
});
