import { expect, it } from "vitest";
import type { PublicGameState } from "@palace/shared";
import { reconcileSelection } from "./selection";

const state = {
  roomCode: "ABC234",
  gameId: "game-1",
  you: { hand: [{ id: "same-card" }] },
} as PublicGameState;

it("clears selections on a rematch even when the new hand reuses card IDs", () => {
  expect(reconcileSelection(["same-card"], state, { ...state, gameId: "game-2" })).toEqual([]);
});

it("clears selections on a room change even when game and card IDs match", () => {
  expect(reconcileSelection(["same-card"], state, { ...state, roomCode: "DEF567" })).toEqual([]);
});

it("keeps only selected cards still in the same game's hand", () => {
  expect(reconcileSelection(["same-card", "gone"], state, { ...state, revision: 2 })).toEqual([
    "same-card",
  ]);
});
