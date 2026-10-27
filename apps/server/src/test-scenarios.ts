import type { GameState } from "@palace/game-engine";
import { Rank, Suit, type Card } from "@palace/shared";

export type TestGameScenario =
  | "seven-restriction"
  | "blind-pickup"
  | "finished-result"
  | "pickup-anytime"
  | "final-play"
  | "big-hand";

const card = (id: string, rank: Rank, suit = Suit.Spades): Card => ({ id, rank, suit });

export function applyTestScenario(state: GameState, scenario: TestGameScenario): GameState {
  if (state.phase !== "playing" || state.players.length !== 2) return state;
  const next = structuredClone(state);
  const [first, second] = next.players;
  if (!first || !second) return state;

  next.drawPile = [];
  next.playPile = [];
  next.lastPlay = null;
  next.burned = [];
  next.pendingSevenChoiceFor = null;
  next.restriction = null;
  next.winnerId = null;
  next.resultReason = null;
  next.currentTurnPlayerId = first.id;
  next.stats = { turnCount: 0, pickups: { [first.id]: 0, [second.id]: 0 } };

  if (scenario === "big-hand") {
    const deck = Object.values(Rank).flatMap((rank) =>
      Object.values(Suit).map((suit) => card(`big-${rank}-${suit}`, rank, suit)),
    );
    const inHand = (index: number) => {
      const rankIndex = Math.floor(index / 4);
      const suitIndex = index % 4;
      return rankIndex < 6
        ? suitIndex !== rankIndex % 4
        : rankIndex === 6
          ? suitIndex < 2
          : suitIndex === rankIndex % 4;
    };
    first.hand = deck.filter((_, index) => inHand(index));
    const remaining = deck.filter((_, index) => !inHand(index));
    const pile = remaining.find((card) => card.rank === Rank.Three)!;
    next.playPile = [pile];
    second.hand = remaining.filter((card) => card.id !== pile.id).slice(0, 5);
    // Keep all 52 physical cards distinct, including the existing field slots.
    const used = new Set([...first.hand, ...second.hand, pile].map((card) => card.id));
    const fields = deck.filter((card) => !used.has(card.id));
    for (const player of next.players) {
      for (const slot of [...player.selectedField, ...player.hiddenField])
        slot.card = fields.shift() ?? null;
    }
    next.burned = fields;
    next.message = `${first.name}'s turn.`;
    return next;
  }

  if (scenario === "seven-restriction") {
    first.hand = [card("scenario-seven", Rank.Seven), card("scenario-three", Rank.Three)];
    second.hand = [card("scenario-eight", Rank.Eight), card("scenario-two", Rank.Two)];
    next.message = `${first.name}'s turn.`;
    return next;
  }

  if (scenario === "pickup-anytime") {
    first.hand = [card("scenario-nine", Rank.Nine), card("scenario-four", Rank.Four)];
    second.hand = [
      card("scenario-queen", Rank.Queen, Suit.Hearts),
      card("scenario-three", Rank.Three, Suit.Hearts),
    ];
    next.playPile = [card("scenario-eight", Rank.Eight, Suit.Clubs)];
    next.message = `${first.name}'s turn.`;
    return next;
  }

  if (scenario === "final-play") {
    first.hand = [card("scenario-ten", Rank.Ten, Suit.Diamonds)];
    first.selectedField = Array.from({ length: 3 }, (_, index) => ({
      slotId: `scenario-selected-${index}`,
      card: null,
    }));
    first.hiddenField = Array.from({ length: 3 }, (_, index) => ({
      slotId: `scenario-hidden-${index}`,
      card: null,
    }));
    second.hand = [card("scenario-king", Rank.King), card("scenario-three", Rank.Three)];
    next.playPile = [card("scenario-five", Rank.Five, Suit.Clubs)];
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
