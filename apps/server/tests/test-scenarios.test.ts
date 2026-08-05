import { describe, expect, it } from "vitest";
import { addPlayer, createLobby, type GameState } from "@palace/game-engine";
import { Rank } from "@palace/shared";
import { applyTestScenario } from "../src/test-scenarios";

function playingState(): GameState {
  const first = addPlayer(createLobby("TEST12"), { id: "one", name: "Ada" });
  if (!first.ok) throw new Error("fixture failed");
  const second = addPlayer(first.state, { id: "two", name: "Ben" });
  if (!second.ok) throw new Error("fixture failed");
  return {
    ...second.state,
    phase: "playing",
    currentTurnPlayerId: "one",
  };
}

describe("test-only game scenarios", () => {
  it("creates a deterministic seven choice", () => {
    const state = applyTestScenario(playingState(), "seven-restriction");
    expect(state.players[0]?.hand.map(({ rank }) => rank)).toContain(Rank.Seven);
    expect(state.currentTurnPlayerId).toBe("one");
  });

  it("creates an illegal blind pickup", () => {
    const state = applyTestScenario(playingState(), "blind-pickup");
    expect(state.players[0]?.hand).toEqual([]);
    expect(state.players[0]?.hiddenField[0]?.card?.rank).toBe(Rank.Four);
    expect(state.playPile.at(-1)?.rank).toBe(Rank.Ace);
  });

  it("creates opposite finished projections", () => {
    const state = applyTestScenario(playingState(), "finished-result");
    expect(state.phase).toBe("finished");
    expect(state.winnerId).toBe("one");
    expect(state.stats.turnCount).toBe(14);
  });
});
