import { describe, expect, it } from "vitest";
import { Rank, Suit, type Card } from "@palace/shared";
import {
  addPlayer,
  applyCommand,
  compareStartingHands,
  createDeck,
  createLobby,
  hasLegalMove,
  isRankLegal,
  projectState,
  shuffleDeck,
  setConnected,
  finishByForfeit,
  expireGame,
  type GameState,
  type PlayerState,
} from "../src/index";

const card = (rank: Rank, suit: Suit = Suit.Clubs, suffix = ""): Card => ({
  id: `${rank}-${suit}-${suffix || Math.random()}`,
  rank,
  suit,
});

const player = (
  id: string,
  hand: Card[],
  selected: Card[] = [],
  hidden: Card[] = [],
): PlayerState => ({
  id,
  name: id,
  connected: true,
  ready: false,
  setupComplete: true,
  hand,
  selectedField: [0, 1, 2].map((index) => ({
    slotId: `${id}-selected-${index}`,
    card: selected[index] ?? null,
  })),
  hiddenField: [0, 1, 2].map((index) => ({
    slotId: `${id}-hidden-${index}`,
    card: hidden[index] ?? null,
  })),
});

const playing = (
  handA: Card[],
  handB: Card[] = [card(Rank.Three)],
  pile: Card[] = [],
): GameState => ({
  roomCode: "ABC234",
  gameId: "game-1",
  revision: 10,
  turnSeq: 0,
  phase: "playing",
  players: [player("A", handA), player("B", handB)],
  drawPile: [],
  playPile: pile,
  burned: [],
  currentTurnPlayerId: "A",
  pendingSevenChoiceFor: null,
  restriction: null,
  winnerId: null,
  resultReason: null,
  stats: { turnCount: 0, pickups: { A: 0, B: 0 } },
  message: "Test game",
});

const accepted = (result: ReturnType<typeof applyCommand>): GameState => {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.message);
  return result.state;
};

describe("deck and dealing", () => {
  it("creates 52 unique standard cards", () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map(({ id }) => id))).toHaveLength(52);
    expect(new Set(deck.map(({ rank }) => rank))).toHaveLength(13);
    expect(new Set(deck.map(({ suit }) => suit))).toHaveLength(4);
  });

  it("supports deterministic test shuffles without mutating the deck", () => {
    const deck = createDeck();
    const shuffled = shuffleDeck(deck, (maximum) => maximum - 1);
    expect(shuffled).toEqual(deck);
    expect(shuffled).not.toBe(deck);
  });

  it("deals six hand cards and three hidden cards after both players ready", () => {
    let state = createLobby("ABC234");
    const first = addPlayer(state, { id: "A", name: "Ada" });
    if (!first.ok) throw new Error(first.message);
    state = first.state;
    const second = addPlayer(state, { id: "B", name: "Ben" });
    if (!second.ok) throw new Error(second.message);
    state = second.state;
    state = accepted(applyCommand(state, "A", { type: "READY" }, () => 0));
    state = accepted(applyCommand(state, "B", { type: "READY" }, () => 0));
    expect(state.phase).toBe("setup");
    expect(state.drawPile).toHaveLength(34);
    expect(state.players[0]?.hand).toHaveLength(6);
    expect(state.players[0]?.hiddenField.filter(({ card }) => card)).toHaveLength(3);
  });
});

describe("starting player", () => {
  it("compares successive low cards and ignores twos", () => {
    const left = [card(Rank.Two), card(Rank.Three), card(Rank.King)];
    const right = [card(Rank.Four), card(Rank.Five), card(Rank.Six)];
    expect(compareStartingHands(left, right, () => 1)).toBe(0);
  });

  it("sorts an all-two hand after a hand with a normal rank", () => {
    expect(compareStartingHands([card(Rank.Two)], [card(Rank.Ace)], () => 0)).toBe(1);
  });

  it("does not begin play until both setup selections are confirmed", () => {
    let state = createLobby("ABC234");
    const first = addPlayer(state, { id: "A", name: "Ada" });
    if (!first.ok) throw new Error(first.message);
    const second = addPlayer(first.state, { id: "B", name: "Ben" });
    if (!second.ok) throw new Error(second.message);
    state = accepted(applyCommand(second.state, "A", { type: "READY" }, () => 0));
    state = accepted(applyCommand(state, "B", { type: "READY" }, () => 0));
    const firstChoice = state.players[0]!.hand.slice(0, 3).map(({ id }) => id);
    state = accepted(
      applyCommand(state, "A", { type: "SELECT_SETUP_CARDS", cardIds: firstChoice }, () => 0),
    );
    expect(state.phase).toBe("setup");
    const secondChoice = state.players[1]!.hand.slice(0, 3).map(({ id }) => id);
    state = accepted(
      applyCommand(state, "B", { type: "SELECT_SETUP_CARDS", cardIds: secondChoice }, () => 0),
    );
    expect(state.phase).toBe("playing");
    expect(state.currentTurnPlayerId).not.toBeNull();
  });
});

describe("normal and power moves", () => {
  it("accepts equal/higher ranks and rejects lower ranks", () => {
    const state = playing([card(Rank.Five)], [card(Rank.Three)], [card(Rank.Six)]);
    expect(isRankLegal(state, "A", Rank.Six)).toBe(true);
    expect(isRankLegal(state, "A", Rank.King)).toBe(true);
    expect(isRankLegal(state, "A", Rank.Five)).toBe(false);
  });

  it("rejects mixed-rank groups and cards not owned", () => {
    const five = card(Rank.Five);
    const six = card(Rank.Six);
    const state = playing([five, six]);
    expect(
      applyCommand(state, "A", { type: "PLAY_CARDS", cardIds: [five.id, six.id] }),
    ).toMatchObject({ ok: false, code: "INVALID_CARDS" });
    expect(applyCommand(state, "A", { type: "PLAY_CARDS", cardIds: ["missing"] })).toMatchObject({
      ok: false,
      code: "INVALID_CARDS",
    });
  });

  it("plays multiple equal cards in one move", () => {
    const cards = [card(Rank.Eight, Suit.Clubs), card(Rank.Eight, Suit.Hearts)];
    const state = accepted(
      applyCommand(playing(cards, [card(Rank.Three)], [card(Rank.Seven)]), "A", {
        type: "PLAY_CARDS",
        cardIds: cards.map(({ id }) => id),
      }),
    );
    expect(state.playPile.slice(-2).map(({ rank }) => rank)).toEqual([Rank.Eight, Rank.Eight]);
  });

  it("lets a two reset the pile and grants another turn", () => {
    const two = card(Rank.Two);
    const state = accepted(
      applyCommand(playing([two, card(Rank.Three)], [card(Rank.Four)], [card(Rank.Ace)]), "A", {
        type: "PLAY_CARDS",
        cardIds: [two.id],
      }),
    );
    expect(state.currentTurnPlayerId).toBe("A");
    expect(isRankLegal(state, "A", Rank.Three)).toBe(true);
  });

  it("requires and applies a direction after seven", () => {
    const seven = card(Rank.Seven);
    let state = accepted(
      applyCommand(playing([seven, card(Rank.Nine)]), "A", {
        type: "PLAY_CARDS",
        cardIds: [seven.id],
      }),
    );
    expect(state.pendingSevenChoiceFor).toBe("A");
    state = accepted(
      applyCommand(state, "A", { type: "CHOOSE_SEVEN_DIRECTION", direction: "lower" }),
    );
    expect(state.currentTurnPlayerId).toBe("B");
    expect(state.restriction).toEqual({ direction: "lower", targetPlayerId: "B" });
    expect(isRankLegal(state, "B", Rank.Six)).toBe(true);
    expect(isRankLegal(state, "B", Rank.Eight)).toBe(false);
    expect(isRankLegal(state, "B", Rank.Ten)).toBe(true);
  });

  it("burns the entire pile after ten", () => {
    const ten = card(Rank.Ten);
    const state = accepted(
      applyCommand(playing([ten, card(Rank.Five)], [card(Rank.Three)], [card(Rank.Ace)]), "A", {
        type: "PLAY_CARDS",
        cardIds: [ten.id],
      }),
    );
    expect(state.playPile).toHaveLength(0);
    expect(state.burned).toHaveLength(2);
    expect(state.currentTurnPlayerId).toBe("A");
  });

  it("burns four consecutive matching cards across moves", () => {
    const fourth = card(Rank.Nine, Suit.Spades);
    const pile = [
      card(Rank.Nine, Suit.Clubs),
      card(Rank.Nine, Suit.Diamonds),
      card(Rank.Nine, Suit.Hearts),
    ];
    const state = accepted(
      applyCommand(playing([fourth, card(Rank.Five)], [card(Rank.Three)], pile), "A", {
        type: "PLAY_CARDS",
        cardIds: [fourth.id],
      }),
    );
    expect(state.playPile).toHaveLength(0);
    expect(state.burned).toHaveLength(4);
  });

  it("rejects out-of-turn actions", () => {
    const three = playing([], [card(Rank.Three)]).players[1]!.hand[0]!;
    expect(
      applyCommand(playing([], [three]), "B", { type: "PLAY_CARDS", cardIds: [three.id] }),
    ).toMatchObject({ ok: false, code: "NOT_YOUR_TURN" });
  });

  it("consumes a seven restriction when a power card grants an extra turn", () => {
    const two = card(Rank.Two);
    const state = playing([two, card(Rank.Three)]);
    state.restriction = { direction: "higher", targetPlayerId: "A" };
    const next = accepted(applyCommand(state, "A", { type: "PLAY_CARDS", cardIds: [two.id] }));
    expect(next.restriction).toBeNull();
    expect(next.currentTurnPlayerId).toBe("A");
    expect(isRankLegal(next, "A", Rank.Three)).toBe(true);
  });
});

describe("pickup, drawing, and endgame", () => {
  it("only allows pickup when no legal hand card exists", () => {
    const pile = [card(Rank.King)];
    expect(
      applyCommand(playing([card(Rank.Ace)], [card(Rank.Three)], pile), "A", {
        type: "PICK_UP_PILE",
      }),
    ).toMatchObject({ ok: false, code: "LEGAL_MOVE_AVAILABLE" });
    const state = accepted(
      applyCommand(playing([card(Rank.Three)], [card(Rank.Four)], pile), "A", {
        type: "PICK_UP_PILE",
      }),
    );
    expect(state.players[0]?.hand).toHaveLength(2);
    expect(state.playPile).toHaveLength(0);
    expect(state.stats.pickups.A).toBe(1);
  });

  it("automatically draws only to the three-card minimum after a play", () => {
    const play = card(Rank.Five);
    const state = playing([play, card(Rank.Six)], [card(Rank.Three)]);
    state.drawPile = [
      card(Rank.Seven),
      card(Rank.Eight),
      card(Rank.Nine),
      card(Rank.Jack),
      card(Rank.Queen),
    ];
    const next = accepted(applyCommand(state, "A", { type: "PLAY_CARDS", cardIds: [play.id] }));
    expect(next.players[0]?.hand).toHaveLength(3);
    expect(next.drawPile).toHaveLength(3);
  });

  it("manually draws one card without consuming either player's turn", () => {
    const state = playing([card(Rank.Five)], [card(Rank.Six)]);
    state.drawPile = [card(Rank.Ace), card(Rank.Two)];
    const first = accepted(applyCommand(state, "A", { type: "DRAW_CARD" }));
    expect(first.players[0]?.hand).toHaveLength(2);
    expect(first.currentTurnPlayerId).toBe("A");
    const second = accepted(applyCommand(first, "B", { type: "DRAW_CARD" }));
    expect(second.players[1]?.hand).toHaveLength(2);
    expect(second.currentTurnPlayerId).toBe("A");
  });

  it("allows drawing during a pending seven choice", () => {
    const state = playing([card(Rank.Five)], [card(Rank.Six)]);
    state.drawPile = [card(Rank.Ace)];
    state.pendingSevenChoiceFor = "A";
    const next = accepted(applyCommand(state, "B", { type: "DRAW_CARD" }));
    expect(next.players[1]?.hand).toHaveLength(2);
    expect(next.pendingSevenChoiceFor).toBe("A");
  });

  it("rejects manual draws at five cards or from an empty pile", () => {
    const full = playing([
      card(Rank.Three),
      card(Rank.Four),
      card(Rank.Five),
      card(Rank.Six),
      card(Rank.Eight),
    ]);
    full.drawPile = [card(Rank.Ace)];
    expect(applyCommand(full, "A", { type: "DRAW_CARD" })).toMatchObject({
      ok: false,
      code: "HAND_FULL",
    });
    expect(applyCommand(playing([card(Rank.Three)]), "A", { type: "DRAW_CARD" })).toMatchObject({
      ok: false,
      code: "DRAW_PILE_EMPTY",
    });
  });

  it("promotes selected field cards after an empty hand and draw pile", () => {
    const finalHand = card(Rank.Five);
    const state = playing([finalHand]);
    state.players[0]!.selectedField[0]!.card = card(Rank.Six);
    const next = accepted(
      applyCommand(state, "A", { type: "PLAY_CARDS", cardIds: [finalHand.id] }),
    );
    expect(next.players[0]?.hand.map(({ rank }) => rank)).toEqual([Rank.Six]);
    expect(next.players[0]?.selectedField.every(({ card }) => !card)).toBe(true);
  });

  it("forces pickup after an illegal blind reveal", () => {
    const state = playing([], [card(Rank.Three)], [card(Rank.Ace)]);
    state.players[0]!.hiddenField[0]!.card = card(Rank.Four);
    const slotId = state.players[0]!.hiddenField[0]!.slotId;
    const next = accepted(applyCommand(state, "A", { type: "SELECT_HIDDEN_CARD", slotId }));
    expect(next.players[0]?.hand).toHaveLength(2);
    expect(next.players[0]?.hiddenField[0]?.card).toBeNull();
    expect(next.stats.pickups.A).toBe(1);
  });

  it("wins after the final legal hidden card resolves", () => {
    const state = playing([], [card(Rank.Three)]);
    state.players[0]!.hiddenField[0]!.card = card(Rank.Ten);
    const slotId = state.players[0]!.hiddenField[0]!.slotId;
    const next = accepted(applyCommand(state, "A", { type: "SELECT_HIDDEN_CARD", slotId }));
    expect(next.phase).toBe("finished");
    expect(next.winnerId).toBe("A");
  });

  it("resolves a final seven choice before declaring victory", () => {
    const state = playing([], [card(Rank.Three)]);
    state.players[0]!.hiddenField[0]!.card = card(Rank.Seven);
    const slotId = state.players[0]!.hiddenField[0]!.slotId;
    const waiting = accepted(applyCommand(state, "A", { type: "SELECT_HIDDEN_CARD", slotId }));
    expect(waiting.phase).toBe("playing");
    expect(waiting.pendingSevenChoiceFor).toBe("A");
    const finished = accepted(
      applyCommand(waiting, "A", {
        type: "CHOOSE_SEVEN_DIRECTION",
        direction: "higher",
      }),
    );
    expect(finished.phase).toBe("finished");
    expect(finished.winnerId).toBe("A");
  });

  it("starts a fresh deal only after both players request a rematch", () => {
    const state = playing([], []);
    state.phase = "finished";
    state.winnerId = "A";
    state.resultReason = "finished";
    state.currentTurnPlayerId = null;
    state.gameId = "old-game";
    const waiting = accepted(applyCommand(state, "A", { type: "REQUEST_REMATCH" }, () => 0));
    expect(waiting.phase).toBe("finished");
    const rematch = accepted(applyCommand(waiting, "B", { type: "REQUEST_REMATCH" }, () => 0));
    expect(rematch.phase).toBe("setup");
    expect(rematch.gameId).not.toBe("old-game");
    expect(rematch.drawPile).toHaveLength(34);
  });
});

describe("privacy projection", () => {
  it("never projects opponent card values or face-down field values", () => {
    const state = playing([card(Rank.Ace)], [card(Rank.King)]);
    state.players[1]!.selectedField[0]!.card = card(Rank.Queen);
    state.players[1]!.hiddenField[0]!.card = card(Rank.Jack);
    const view = projectState(state, "A");
    expect(view.opponent?.handCount).toBe(1);
    expect(JSON.stringify(view.opponent)).not.toContain(Rank.King);
    expect(JSON.stringify(view.opponentSelectedField)).not.toContain(Rank.Queen);
    expect(JSON.stringify(view.opponentHiddenField)).not.toContain(Rank.Jack);
  });

  it("identifies legal-move availability", () => {
    const state = playing([card(Rank.Three), card(Rank.Two)], [card(Rank.Four)], [card(Rank.Ace)]);
    expect(hasLegalMove(state, "A")).toBe(true);
  });
});

describe("turn intent sequence", () => {
  it("tracks deal/start, leaves partial votes unchanged, and accepts duplicate ready/rematch votes", () => {
    let state = accepted(addPlayer(createLobby("ABC234"), { id: "A", name: "Ada" }));
    expect(state.players[0]!.connected).toBe(false);
    state = accepted(addPlayer(state, { id: "B", name: "Ben" }));
    expect(state.turnSeq).toBe(0);
    state = accepted(applyCommand(state, "A", { type: "READY" }));
    expect(state.turnSeq).toBe(0);
    expect(applyCommand(state, "A", { type: "READY" })).toEqual({
      ok: true,
      state,
      changed: false,
    });
    state = accepted(applyCommand(state, "B", { type: "READY" }));
    expect(state.turnSeq).toBe(1);
    state = accepted(
      applyCommand(state, "A", {
        type: "SELECT_SETUP_CARDS",
        cardIds: state.players[0]!.hand.slice(0, 3).map((c) => c.id),
      }),
    );
    expect(state.turnSeq).toBe(1);
    state = accepted(
      applyCommand(state, "B", {
        type: "SELECT_SETUP_CARDS",
        cardIds: state.players[1]!.hand.slice(0, 3).map((c) => c.id),
      }),
    );
    expect(state.turnSeq).toBe(2);
    state = finishByForfeit(state, "A");
    expect(state.turnSeq).toBe(3);
    state = accepted(applyCommand(state, "A", { type: "REQUEST_REMATCH" }));
    expect(state.turnSeq).toBe(3);
    expect(applyCommand(state, "A", { type: "REQUEST_REMATCH" })).toEqual({
      ok: true,
      state,
      changed: false,
    });
    state = accepted(applyCommand(state, "B", { type: "REQUEST_REMATCH" }));
    expect(state.turnSeq).toBe(4);
    expect(expireGame(state).turnSeq).toBe(5);
  });

  it("does not advance on draws or presence, and projects the sequence", () => {
    let state = playing([card(Rank.Three)]);
    state.drawPile = [card(Rank.Four)];
    state = accepted(applyCommand(state, "B", { type: "DRAW_CARD" }));
    expect(state.turnSeq).toBe(0);
    state = setConnected(state, "B", false);
    state = setConnected(state, "B", true);
    expect(state.turnSeq).toBe(0);
    expect(projectState(state, "A").turnSeq).toBe(0);
  });

  it("advances once for play, seven resolution, and a winning play", () => {
    let state = playing([card(Rank.Seven), card(Rank.Three)]);
    state = accepted(
      applyCommand(state, "A", { type: "PLAY_CARDS", cardIds: [state.players[0]!.hand[0]!.id] }),
    );
    expect(state.turnSeq).toBe(1);
    state = accepted(
      applyCommand(state, "A", { type: "CHOOSE_SEVEN_DIRECTION", direction: "lower" }),
    );
    expect(state.turnSeq).toBe(2);
    const win = playing([card(Rank.Ten)]);
    const finished = accepted(
      applyCommand(win, "A", { type: "PLAY_CARDS", cardIds: [win.players[0]!.hand[0]!.id] }),
    );
    expect(finished.phase).toBe("finished");
    expect(finished.turnSeq).toBe(1);
  });

  it("advances for pickup and for legal and illegal hidden selections", () => {
    const pickup = playing([card(Rank.Three)], undefined, [card(Rank.Ace)]);
    expect(accepted(applyCommand(pickup, "A", { type: "PICK_UP_PILE" })).turnSeq).toBe(1);
    for (const rank of [Rank.Three, Rank.Ten]) {
      const state = playing([], undefined, [card(Rank.Ace)]);
      state.players[0] = player("A", [], [], [card(rank)]);
      expect(
        accepted(applyCommand(state, "A", { type: "SELECT_HIDDEN_CARD", slotId: "A-hidden-0" }))
          .turnSeq,
      ).toBe(1);
    }
  });
});
