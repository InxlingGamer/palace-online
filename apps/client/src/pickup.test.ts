import { describe, expect, it } from "vitest";
import { Rank, Suit, type Card, type PublicGameState } from "@palace/shared";
import { canPickUpPile } from "./pickup";

const card = (id: string, rank: Rank): Card => ({ id, rank, suit: Suit.Clubs });

function state(overrides: Partial<PublicGameState> = {}): PublicGameState {
  return {
    roomCode: "ABC234",
    gameId: "game-1",
    revision: 10,
    turnSeq: 0,
    phase: "playing",
    you: {
      id: "A",
      name: "Ada",
      connected: true,
      ready: false,
      setupComplete: true,
      handCount: 0,
      selectedFieldCount: 0,
      hiddenFieldCount: 1,
      cardPhase: "hidden-field",
      hand: [],
      selectedField: [],
      hiddenField: [{ slotId: "hidden-1", occupied: true, kind: "hidden" }],
    },
    opponent: {
      id: "B",
      name: "Ben",
      connected: true,
      ready: false,
      setupComplete: true,
      handCount: 1,
      selectedFieldCount: 0,
      hiddenFieldCount: 0,
      cardPhase: "hand",
    },
    opponentSelectedField: [],
    opponentHiddenField: [],
    drawCount: 0,
    playPile: [card("pile-a", Rank.Ace), card("pile-k", Rank.King)],
    lastPlay: null,
    burnedCount: 0,
    currentTurnPlayerId: "A",
    pendingSevenChoiceFor: null,
    restriction: null,
    winnerId: null,
    resultReason: null,
    stats: { turnCount: 1, pickups: { A: 0, B: 0 } },
    message: "Test",
    ...overrides,
  };
}

describe("canPickUpPile", () => {
  it("rejects pickup off-turn", () => {
    expect(canPickUpPile(state({ currentTurnPlayerId: "B" }))).toBe(false);
  });

  it("allows pickup on your turn with a legal hand card", () => {
    const view = state();
    view.you.hand = [card("ten", Rank.Ten)];
    expect(canPickUpPile(view)).toBe(true);
  });

  it("rejects an empty pile", () => {
    expect(canPickUpPile(state({ playPile: [] }))).toBe(false);
  });

  it("rejects a pending seven choice for either player", () => {
    for (const pendingSevenChoiceFor of ["A", "B"])
      expect(canPickUpPile(state({ pendingSevenChoiceFor }))).toBe(false);
  });

  it("rejects every non-playing phase", () => {
    for (const phase of ["lobby", "setup", "finished", "expired"] as const)
      expect(canPickUpPile(state({ phase }))).toBe(false);
  });
});
