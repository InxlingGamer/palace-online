import { randomInt, randomUUID } from "node:crypto";
import {
  NORMAL_RANKS,
  POWER_RANKS,
  RULES,
  Rank,
  Suit,
  type Card,
  type ErrorCode,
  type FieldSlotView,
  type GameCommand,
  type GamePhase,
  type PlayerCardPhase,
  type PublicGameState,
  type PublicPlayer,
  type SevenDirection,
} from "@palace/shared";

export type RandomInt = (maximumExclusive: number) => number;

export interface FieldSlot {
  slotId: string;
  card: Card | null;
}

export interface PlayerState {
  id: string;
  name: string;
  connected: boolean;
  ready: boolean;
  setupComplete: boolean;
  hand: Card[];
  selectedField: FieldSlot[];
  hiddenField: FieldSlot[];
}

export interface GameState {
  roomCode: string;
  gameId: string | null;
  revision: number;
  phase: GamePhase;
  players: PlayerState[];
  drawPile: Card[];
  playPile: Card[];
  burned: Card[];
  currentTurnPlayerId: string | null;
  pendingSevenChoiceFor: string | null;
  restriction: { direction: SevenDirection; targetPlayerId: string } | null;
  winnerId: string | null;
  resultReason: "finished" | "forfeit" | "expired" | null;
  stats: { turnCount: number; pickups: Record<string, number> };
  message: string;
}

export type EngineResult =
  { ok: true; state: GameState } | { ok: false; code: ErrorCode; message: string };

const rankValue = new Map<Rank, number>(NORMAL_RANKS.map((rank, index) => [rank, index]));

const fail = (code: ErrorCode, message: string): EngineResult => ({ ok: false, code, message });

const cloneState = (state: GameState): GameState => structuredClone(state);

export function createDeck(): Card[] {
  const suits = Object.values(Suit);
  const ranks = Object.values(Rank);
  return suits.flatMap((suit) =>
    ranks.map((rank) => ({ id: `${suit}-${rank}`, suit, rank }) satisfies Card),
  );
}

export function shuffleDeck(deck: readonly Card[], random: RandomInt = randomInt): Card[] {
  const shuffled = [...deck];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = random(index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex]!, shuffled[index]!];
  }
  return shuffled;
}

export function createLobby(roomCode: string): GameState {
  return {
    roomCode,
    gameId: null,
    revision: 0,
    phase: "lobby",
    players: [],
    drawPile: [],
    playPile: [],
    burned: [],
    currentTurnPlayerId: null,
    pendingSevenChoiceFor: null,
    restriction: null,
    winnerId: null,
    resultReason: null,
    stats: { turnCount: 0, pickups: {} },
    message: "Waiting for another player.",
  };
}

export function addPlayer(
  state: GameState,
  player: Pick<PlayerState, "id" | "name">,
): EngineResult {
  if (state.phase !== "lobby") return fail("INVALID_PHASE", "This game has already started.");
  if (state.players.length >= 2) return fail("ROOM_FULL", "This room already has two players.");
  if (state.players.some(({ id }) => id === player.id))
    return fail("INVALID_INPUT", "Player exists.");
  const next = cloneState(state);
  next.players.push({
    ...player,
    connected: true,
    ready: false,
    setupComplete: false,
    hand: [],
    selectedField: [],
    hiddenField: [],
  });
  next.stats.pickups[player.id] = 0;
  next.revision += 1;
  next.message = next.players.length === 2 ? "Both players are here. Ready up!" : next.message;
  return { ok: true, state: next };
}

export function removeLobbyPlayer(state: GameState, playerId: string): EngineResult {
  if (state.phase !== "lobby")
    return fail("INVALID_PHASE", "You can only leave before play begins.");
  const next = cloneState(state);
  const previousLength = next.players.length;
  next.players = next.players.filter(({ id }) => id !== playerId);
  if (next.players.length === previousLength)
    return fail("NOT_A_MEMBER", "Player is not in this room.");
  next.revision += 1;
  next.message = "Waiting for another player.";
  return { ok: true, state: next };
}

function dealGame(state: GameState, random: RandomInt): GameState {
  const next = cloneState(state);
  next.gameId = randomUUID();
  next.phase = "setup";
  next.drawPile = shuffleDeck(createDeck(), random);
  next.playPile = [];
  next.burned = [];
  next.currentTurnPlayerId = null;
  next.pendingSevenChoiceFor = null;
  next.restriction = null;
  next.winnerId = null;
  next.resultReason = null;
  next.stats = {
    turnCount: 0,
    pickups: Object.fromEntries(next.players.map(({ id }) => [id, 0])),
  };
  for (const player of next.players) {
    player.ready = false;
    player.setupComplete = false;
    player.hand = [];
    player.hiddenField = Array.from({ length: RULES.hiddenFieldSize }, (_, index) => ({
      slotId: `${player.id}-hidden-${index + 1}`,
      card: next.drawPile.pop()!,
    }));
    player.selectedField = Array.from({ length: RULES.setupSelectionSize }, (_, index) => ({
      slotId: `${player.id}-selected-${index + 1}`,
      card: null,
    }));
    for (let count = 0; count < RULES.setupHandSize; count += 1)
      player.hand.push(next.drawPile.pop()!);
  }
  next.message = "Choose exactly three cards to place face down on your field.";
  return next;
}

export function compareStartingHands(
  first: readonly Card[],
  second: readonly Card[],
  random: RandomInt = randomInt,
): 0 | 1 {
  const values = (cards: readonly Card[]) =>
    cards
      .filter(({ rank }) => rank !== Rank.Two)
      .map(({ rank }) => rankValue.get(rank)!)
      .sort((a, b) => a - b);
  const left = values(first);
  const right = values(second);
  const maximum = Math.max(left.length, right.length);
  for (let index = 0; index < maximum; index += 1) {
    const leftValue = left[index] ?? Number.POSITIVE_INFINITY;
    const rightValue = right[index] ?? Number.POSITIVE_INFINITY;
    if (leftValue < rightValue) return 0;
    if (rightValue < leftValue) return 1;
  }
  return random(2) === 0 ? 0 : 1;
}

function opponentOf(state: GameState, playerId: string): PlayerState {
  return state.players.find(({ id }) => id !== playerId)!;
}

function playerOf(state: GameState, playerId: string): PlayerState | undefined {
  return state.players.find(({ id }) => id === playerId);
}

function cardPhase(player: PlayerState): PlayerCardPhase {
  if (player.hand.length > 0) return "hand";
  if (player.selectedField.some(({ card }) => card)) return "selected-field";
  if (player.hiddenField.some(({ card }) => card)) return "hidden-field";
  return "out";
}

export function isRankLegal(state: GameState, playerId: string, rank: Rank): boolean {
  if (POWER_RANKS.includes(rank as (typeof POWER_RANKS)[number])) return true;
  if (state.restriction?.targetPlayerId === playerId) {
    const value = rankValue.get(rank)!;
    const seven = rankValue.get(Rank.Seven)!;
    return state.restriction.direction === "higher" ? value > seven : value < seven;
  }
  const top = state.playPile.at(-1);
  if (!top || top.rank === Rank.Two) return true;
  return rankValue.get(rank)! >= rankValue.get(top.rank)!;
}

export function hasLegalMove(state: GameState, playerId: string): boolean {
  const player = playerOf(state, playerId);
  return player?.hand.some(({ rank }) => isRankLegal(state, playerId, rank)) ?? false;
}

function drawToTarget(state: GameState, player: PlayerState): void {
  while (state.drawPile.length > 0 && player.hand.length < RULES.targetHandSize) {
    player.hand.push(state.drawPile.pop()!);
  }
}

function promoteFieldCards(state: GameState, player: PlayerState): void {
  if (state.drawPile.length > 0 || player.hand.length > 0) return;
  const selected = player.selectedField.flatMap(({ card }) => (card ? [card] : []));
  if (selected.length > 0) {
    player.hand.push(...selected);
    for (const slot of player.selectedField) slot.card = null;
  }
}

function isWinner(player: PlayerState): boolean {
  return (
    player.hand.length === 0 &&
    player.selectedField.every(({ card }) => !card) &&
    player.hiddenField.every(({ card }) => !card)
  );
}

function finishIfWinner(state: GameState, player: PlayerState): boolean {
  if (!isWinner(player) || state.pendingSevenChoiceFor) return false;
  state.phase = "finished";
  state.winnerId = player.id;
  state.resultReason = "finished";
  state.currentTurnPlayerId = null;
  state.restriction = null;
  state.message = `${player.name} rules the Palace!`;
  for (const participant of state.players) participant.ready = false;
  return true;
}

function burnPile(state: GameState): void {
  state.burned.push(...state.playPile);
  state.playPile = [];
}

function topFourMatch(pile: readonly Card[]): boolean {
  if (pile.length < 4) return false;
  const four = pile.slice(-4);
  return four.every(({ rank }) => rank === four[0]!.rank);
}

function playCommittedCards(state: GameState, player: PlayerState, cards: Card[]): void {
  const playedRank = cards[0]!.rank;
  if (state.restriction?.targetPlayerId === player.id) state.restriction = null;
  state.playPile.push(...cards);
  state.stats.turnCount += 1;

  const directTen = playedRank === Rank.Ten;
  const fourBurn = !directTen && topFourMatch(state.playPile);
  if (directTen || fourBurn) {
    burnPile(state);
    state.pendingSevenChoiceFor = null;
    state.message = directTen ? "Ten! The pile burns." : "Four of a kind! The pile burns.";
  }

  drawToTarget(state, player);
  promoteFieldCards(state, player);

  if (!directTen && !fourBurn && playedRank === Rank.Seven) {
    state.pendingSevenChoiceFor = player.id;
    state.currentTurnPlayerId = player.id;
    state.message = "Choose whether your opponent must play higher or lower than seven.";
    return;
  }

  if (finishIfWinner(state, player)) return;
  if (directTen || fourBurn || playedRank === Rank.Two) {
    state.currentTurnPlayerId = player.id;
    state.message = directTen || fourBurn ? state.message : "Two resets the pile. Play again!";
  } else {
    state.currentTurnPlayerId = opponentOf(state, player.id).id;
    state.message = `It is ${opponentOf(state, player.id).name}'s turn.`;
  }
}

function playFromHand(
  state: GameState,
  player: PlayerState,
  cardIds: string[],
): EngineResult | null {
  if (cardIds.length === 0 || new Set(cardIds).size !== cardIds.length)
    return fail("INVALID_CARDS", "Choose one or more unique cards.");
  const cards = cardIds.map((id) => player.hand.find((card) => card.id === id));
  if (cards.some((card) => !card)) return fail("INVALID_CARDS", "You do not own those cards.");
  const owned = cards as Card[];
  if (!owned.every(({ rank }) => rank === owned[0]!.rank))
    return fail("INVALID_CARDS", "Cards played together must share a rank.");
  if (!isRankLegal(state, player.id, owned[0]!.rank))
    return fail("ILLEGAL_RANK", "That rank is not legal on the current pile.");
  const selected = new Set(cardIds);
  player.hand = player.hand.filter(({ id }) => !selected.has(id));
  playCommittedCards(state, player, owned);
  return null;
}

function applyReady(state: GameState, player: PlayerState, random: RandomInt): EngineResult | null {
  if (state.phase !== "lobby")
    return fail("INVALID_PHASE", "Ready is only available in the lobby.");
  if (state.players.length !== 2) return fail("INVALID_PHASE", "Two players are required.");
  player.ready = true;
  state.message = `${player.name} is ready.`;
  if (state.players.every(({ ready }) => ready)) Object.assign(state, dealGame(state, random));
  return null;
}

function applySetup(
  state: GameState,
  player: PlayerState,
  cardIds: string[],
  random: RandomInt,
): EngineResult | null {
  if (state.phase !== "setup") return fail("INVALID_PHASE", "Setup is already complete.");
  if (player.setupComplete) return fail("INVALID_PHASE", "Your setup is already locked.");
  if (cardIds.length !== RULES.setupSelectionSize || new Set(cardIds).size !== cardIds.length)
    return fail("INVALID_CARDS", "Choose exactly three unique cards.");
  const chosen = cardIds.map((id) => player.hand.find((card) => card.id === id));
  if (chosen.some((card) => !card)) return fail("INVALID_CARDS", "Choose cards from your hand.");
  const selected = new Set(cardIds);
  player.hand = player.hand.filter(({ id }) => !selected.has(id));
  player.selectedField.forEach((slot, index) => {
    slot.card = chosen[index]!;
  });
  player.setupComplete = true;
  state.message = `${player.name} locked in their field cards.`;
  if (state.players.every(({ setupComplete }) => setupComplete)) {
    state.phase = "playing";
    const starterIndex = compareStartingHands(
      state.players[0]!.hand,
      state.players[1]!.hand,
      random,
    );
    state.currentTurnPlayerId = state.players[starterIndex]!.id;
    state.message = `${state.players[starterIndex]!.name} has the lowest starting hand and goes first.`;
  }
  return null;
}

function applyPickup(state: GameState, player: PlayerState): EngineResult | null {
  if (state.playPile.length === 0) return fail("INVALID_PHASE", "There is no pile to pick up.");
  if (hasLegalMove(state, player.id))
    return fail("LEGAL_MOVE_AVAILABLE", "You still have a legal card to play.");
  if (state.restriction?.targetPlayerId === player.id) state.restriction = null;
  player.hand.push(...state.playPile);
  state.playPile = [];
  state.stats.turnCount += 1;
  state.stats.pickups[player.id] = (state.stats.pickups[player.id] ?? 0) + 1;
  state.currentTurnPlayerId = opponentOf(state, player.id).id;
  state.message = `${player.name} picked up the pile.`;
  return null;
}

function applySevenChoice(
  state: GameState,
  player: PlayerState,
  direction: SevenDirection,
): EngineResult | null {
  if (state.pendingSevenChoiceFor !== player.id)
    return fail("INVALID_PHASE", "There is no seven choice for you to resolve.");
  state.pendingSevenChoiceFor = null;
  const opponent = opponentOf(state, player.id);
  state.restriction = { direction, targetPlayerId: opponent.id };
  if (finishIfWinner(state, player)) return null;
  state.currentTurnPlayerId = opponent.id;
  state.message = `${opponent.name} must play ${direction} than seven, or use a power card.`;
  return null;
}

function applyHiddenCard(
  state: GameState,
  player: PlayerState,
  slotId: string,
): EngineResult | null {
  if (cardPhase(player) !== "hidden-field")
    return fail("INVALID_PHASE", "Finish your visible cards before choosing a hidden card.");
  const slot = player.hiddenField.find((candidate) => candidate.slotId === slotId);
  if (!slot?.card) return fail("INVALID_CARDS", "That hidden slot is empty.");
  const revealed = slot.card;
  slot.card = null;
  if (!isRankLegal(state, player.id, revealed.rank)) {
    if (state.restriction?.targetPlayerId === player.id) state.restriction = null;
    state.playPile.push(revealed);
    player.hand.push(...state.playPile);
    state.playPile = [];
    state.stats.turnCount += 1;
    state.stats.pickups[player.id] = (state.stats.pickups[player.id] ?? 0) + 1;
    state.currentTurnPlayerId = opponentOf(state, player.id).id;
    state.message = `${player.name} revealed an illegal card and picked up the pile.`;
    return null;
  }
  playCommittedCards(state, player, [revealed]);
  return null;
}

function applyRematch(
  state: GameState,
  player: PlayerState,
  random: RandomInt,
): EngineResult | null {
  if (state.phase !== "finished") return fail("INVALID_PHASE", "The current game is not finished.");
  player.ready = true;
  state.message = `${player.name} wants a rematch.`;
  if (state.players.every(({ ready }) => ready)) Object.assign(state, dealGame(state, random));
  return null;
}

export function applyCommand(
  current: GameState,
  playerId: string,
  command: GameCommand,
  random: RandomInt = randomInt,
): EngineResult {
  const state = cloneState(current);
  const player = playerOf(state, playerId);
  if (!player) return fail("NOT_A_MEMBER", "You are not a member of this room.");

  let error: EngineResult | null = null;
  if (command.type === "LEAVE_ROOM") return removeLobbyPlayer(state, playerId);
  if (command.type === "READY") error = applyReady(state, player, random);
  else if (command.type === "SELECT_SETUP_CARDS")
    error = applySetup(state, player, command.cardIds, random);
  else if (command.type === "REQUEST_REMATCH") error = applyRematch(state, player, random);
  else {
    if (state.phase !== "playing") return fail("INVALID_PHASE", "The game is not accepting moves.");
    if (state.pendingSevenChoiceFor && command.type !== "CHOOSE_SEVEN_DIRECTION")
      return fail("SEVEN_CHOICE_REQUIRED", "Choose higher or lower before continuing.");
    if (command.type !== "CHOOSE_SEVEN_DIRECTION" && state.currentTurnPlayerId !== playerId)
      return fail("NOT_YOUR_TURN", "It is not your turn.");
    if (command.type === "PLAY_CARDS") error = playFromHand(state, player, command.cardIds);
    else if (command.type === "PICK_UP_PILE") error = applyPickup(state, player);
    else if (command.type === "CHOOSE_SEVEN_DIRECTION")
      error = applySevenChoice(state, player, command.direction);
    else if (command.type === "SELECT_HIDDEN_CARD")
      error = applyHiddenCard(state, player, command.slotId);
  }
  if (error) return error;
  state.revision += 1;
  return { ok: true, state };
}

function slotsView(slots: readonly FieldSlot[], kind: FieldSlotView["kind"]): FieldSlotView[] {
  return slots.map(({ slotId, card }) => ({ slotId, occupied: Boolean(card), kind }));
}

function playerSummary(player: PlayerState): PublicPlayer {
  return {
    id: player.id,
    name: player.name,
    connected: player.connected,
    ready: player.ready,
    setupComplete: player.setupComplete,
    handCount: player.hand.length,
    selectedFieldCount: player.selectedField.filter(({ card }) => card).length,
    hiddenFieldCount: player.hiddenField.filter(({ card }) => card).length,
    cardPhase: cardPhase(player),
  };
}

export function projectState(state: GameState, viewerId: string): PublicGameState {
  const viewer = playerOf(state, viewerId);
  if (!viewer) throw new Error("Cannot project a state for a non-member.");
  const opponent = state.players.find(({ id }) => id !== viewerId) ?? null;
  return {
    roomCode: state.roomCode,
    gameId: state.gameId,
    revision: state.revision,
    phase: state.phase,
    you: {
      ...playerSummary(viewer),
      hand: viewer.hand,
      selectedField: slotsView(viewer.selectedField, "selected"),
      hiddenField: slotsView(viewer.hiddenField, "hidden"),
    },
    opponent: opponent ? playerSummary(opponent) : null,
    opponentSelectedField: opponent ? slotsView(opponent.selectedField, "selected") : [],
    opponentHiddenField: opponent ? slotsView(opponent.hiddenField, "hidden") : [],
    drawCount: state.drawPile.length,
    playPile: state.playPile,
    burnedCount: state.burned.length,
    currentTurnPlayerId: state.currentTurnPlayerId,
    pendingSevenChoiceFor: state.pendingSevenChoiceFor,
    restriction: state.restriction,
    winnerId: state.winnerId,
    resultReason: state.resultReason,
    stats: structuredClone(state.stats),
    message: state.message,
  };
}

export function setConnected(state: GameState, playerId: string, connected: boolean): GameState {
  const next = cloneState(state);
  const player = playerOf(next, playerId);
  if (player) {
    player.connected = connected;
    next.revision += 1;
    next.message = connected ? `${player.name} reconnected.` : `${player.name} disconnected.`;
  }
  return next;
}

export function finishByForfeit(state: GameState, disconnectedPlayerId: string): GameState {
  const next = cloneState(state);
  const winner = next.players.find(({ id }) => id !== disconnectedPlayerId);
  next.phase = winner ? "finished" : "expired";
  next.winnerId = winner?.id ?? null;
  next.resultReason = winner ? "forfeit" : "expired";
  next.currentTurnPlayerId = null;
  next.pendingSevenChoiceFor = null;
  next.restriction = null;
  next.revision += 1;
  next.message = winner ? `${winner.name} wins by forfeit.` : "This room expired.";
  return next;
}

export function expireGame(state: GameState): GameState {
  const next = cloneState(state);
  next.phase = "expired";
  next.winnerId = null;
  next.resultReason = "expired";
  next.currentTurnPlayerId = null;
  next.pendingSevenChoiceFor = null;
  next.restriction = null;
  next.revision += 1;
  next.message = "This room expired before the game could resume.";
  return next;
}
