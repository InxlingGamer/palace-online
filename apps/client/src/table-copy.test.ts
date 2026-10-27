import { describe, expect, it } from "vitest";
import { Rank, Suit, type Card, type PublicGameState } from "@palace/shared";
import { lastMoveText, requirementText } from "./table-copy";
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

describe("lastMoveText", () => {
  it("hides absent or empty plays", () => {
    expect(lastMoveText(state())).toBeNull();
    expect(lastMoveText(state({ lastPlay: { playerId: "A", cards: [] } }))).toBeNull();
  });
  it.each([
    [Rank.Nine, "9"],
    [Rank.Eight, "8"],
    [Rank.Ace, "Ace"],
    [Rank.Jack, "Jack"],
    [Rank.Queen, "Queen"],
    [Rank.King, "King"],
  ])("names %s and all group sizes", (rank, label) => {
    for (const [count, phrase] of [
      [1, `${rank === Rank.Ace || rank === Rank.Eight ? "an" : "a"} ${label}`],
      [2, `a pair of ${label}s`],
      [3, `three ${label}s`],
      [4, `four ${label}s`],
    ] as const) {
      expect(
        lastMoveText(
          state({
            lastPlay: {
              playerId: "A",
              cards: Array.from({ length: count }, (_, i) => card(String(i), rank)),
            },
          }),
        ),
      ).toBe(`You played ${phrase}`);
      expect(
        lastMoveText(
          state({
            lastPlay: {
              playerId: "B",
              cards: Array.from({ length: count }, (_, i) => card(String(i), rank)),
            },
          }),
        ),
      ).toBe(`Ben played ${phrase}`);
    }
  });
});
describe("requirementText", () => {
  it("accepts any card on an empty or reset pile", () => {
    expect(requirementText(state({ playPile: [] }))).toBe("Play any card");
    expect(requirementText(state({ playPile: [card("two", Rank.Two)] }))).toBe("Play any card");
  });
  it.each(["higher", "lower"] as const)("describes a %s seven restriction", (direction) => {
    expect(requirementText(state({ restriction: { direction, targetPlayerId: "A" } }))).toBe(
      `Play ${direction} than 7`,
    );
  });
  it("does not apply an opponent restriction to you", () => {
    expect(
      requirementText(state({ restriction: { direction: "lower", targetPlayerId: "B" } })),
    ).toBe("Play King or higher, or a 2, 7 or 10");
  });
  it("uses the top rank and names all powers", () => {
    expect(requirementText(state({ playPile: [card("eight", Rank.Eight)] }))).toBe(
      "Play 8 or higher, or a 2, 7 or 10",
    );
  });
  it("names the player off-turn", () => {
    expect(requirementText(state({ currentTurnPlayerId: "B" }))).toBe("Ben must play");
  });
  it("shows the direction prompt while a seven is unresolved", () => {
    expect(requirementText(state({ pendingSevenChoiceFor: "A" }))).toBe("Choose higher or lower");
    expect(requirementText(state({ pendingSevenChoiceFor: "B" }))).toBe(
      "Ben is choosing higher or lower",
    );
  });
  it.each(["lobby", "setup", "finished", "expired"] as const)(
    "preserves server copy in %s",
    (phase) => {
      expect(requirementText(state({ phase, message: "Server message" }))).toBe("Server message");
    },
  );
});
