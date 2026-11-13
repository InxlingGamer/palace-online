import { expect, it } from "vitest";
import { rejoinNotice } from "./rejoin";

it("uses the restart copy only when both boot identities exist and differ", () => {
  expect(rejoinNotice("old", "new")).toBe(
    "Your last table closed while the server was asleep. Create or join a new one.",
  );
  for (const [stored, current] of [
    [null, null],
    ["same", "same"],
    ["old", null],
    [null, "new"],
  ] as const)
    expect(rejoinNotice(stored, current)).toBe("Your last table ended.");
});
