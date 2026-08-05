import type { GameState } from "@palace/game-engine";
import { Rank, Suit, type Card } from "@palace/shared";

export type TestGameScenario = "seven-restriction" | "blind-pickup" | "finished-result";

const card = (id: string, rank: Rank, suit = Suit.Spades): Card => ({ id, rank, suit });

export function applyTestScenario(state: GameState, scenario: TestGameScenario): GameState {
  if (state.phase !== "playing" || state.players.length !== 2) return state;
  const next = structuredClone(state);
  const [first, second] = next.players;
  if (!first || !second) return state;

  next.drawPile = [];
  next.playPile = [];
  next.burned = [];
  next.pendingSevenChoiceFor = null;
  next.restriction = null;
  next.winnerId = null;
  next.resultReason = null;
  next.currentTurnPlayerId = first.id;
  next.stats = { turnCount: 0, pickups: { [first.id]: 0, [second.id]: 0 } };

  if (scenario === "seven-restriction") {
    first.hand = [card("scenario-seven", Rank.Seven), card("scenario-three", Rank.Three)];
    second.hand = [card("scenario-eight", Rank.Eight), card("scenario-two", Rank.Two)];
    next.message = `${first.name}'s turn.`;
    return next;
  }

  if (scenario === "blind-pickup") {
    first.hand = [];
    if (first.selectedField.length === 0) {
      first.selectedField = Array.from({ length: 3 }, (_, index) => ({
        slotId: `scenario-selected-${index}`,
        card: null,
      }));
    }
    if (first.hiddenField.length === 0) {
      first.hiddenField = Array.from({ length: 3 }, (_, index) => ({
        slotId: `scenario-hidden-${index}`,
        card: null,
      }));
    }
    first.selectedField.forEach((slot) => (slot.card = null));
    first.hiddenField.forEach((slot, index) => {
      slot.card = index === 0 ? card("scenario-hidden-four", Rank.Four, Suit.Hearts) : null;
    });
    second.hand = [card("scenario-opponent-three", Rank.Three)];
    next.playPile = [card("scenario-pile-ace", Rank.Ace, Suit.Clubs)];
    next.message = `${first.name}'s turn.`;
    return next;
  }

  next.phase = "finished";
  next.currentTurnPlayerId = null;
  next.winnerId = first.id;
  next.resultReason = "finished";
  next.stats = { turnCount: 14, pickups: { [first.id]: 1, [second.id]: 3 } };
  next.message = `${first.name} wins.`;
  return next;
}
