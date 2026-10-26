import { describe, expect, it } from "vitest";
import { Rank, Suit, type Card, type PublicGameState } from "@palace/shared";
import { deriveVisualEvents } from "./visual-events";

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

describe("deriveVisualEvents", () => {
  it("identifies the exact illegal blind reveal before the forced pickup", () => {
    const previous = state();
    const revealed = card("hidden-four", Rank.Four);
    const next = state({
      revision: 11,
      playPile: [],
      currentTurnPlayerId: "B",
      you: {
        ...previous.you,
        handCount: 3,
        hiddenFieldCount: 0,
        cardPhase: "hand",
        hand: [...previous.playPile, revealed],
        hiddenField: [{ slotId: "hidden-1", occupied: false, kind: "hidden" }],
      },
    });

    const events = deriveVisualEvents(previous, next);
    expect(events[0]).toMatchObject({
      type: "blind-pickup",
      revealedCard: { id: "hidden-four", rank: Rank.Four },
    });
    expect(events.filter(({ type }) => type === "pickup")).toHaveLength(0);
  });

  it("does not expose the opponent's blind card value", () => {
    const previous = state({
      opponent: { ...state().opponent!, hiddenFieldCount: 1, cardPhase: "hidden-field" },
    });
    const next = state({
      revision: 11,
      playPile: [],
      opponent: {
        ...previous.opponent!,
        handCount: 4,
        hiddenFieldCount: 0,
        cardPhase: "hand",
      },
    });

    expect(deriveVisualEvents(previous, next)).toContainEqual({
      type: "opponent-blind-pickup",
      count: 3,
    });
  });
});
