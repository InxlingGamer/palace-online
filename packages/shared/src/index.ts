import { z } from "zod";

export const RULES = {
  targetHandSize: 5,
  automaticHandMinimum: 3,
  setupHandSize: 6,
  setupSelectionSize: 3,
  hiddenFieldSize: 3,
  reconnectGraceMs: 600_000,
  actionCacheSize: 256,
  actionBurstCapacity: 20,
  actionRefillPerSecond: 10,
  maxSocketsPerSession: 5,
} as const;

export enum Suit {
  Clubs = "clubs",
  Diamonds = "diamonds",
  Hearts = "hearts",
  Spades = "spades",
}

export enum Rank {
  Two = "2",
  Three = "3",
  Four = "4",
  Five = "5",
  Six = "6",
  Seven = "7",
  Eight = "8",
  Nine = "9",
  Ten = "10",
  Jack = "J",
  Queen = "Q",
  King = "K",
  Ace = "A",
}

export const NORMAL_RANKS = [
  Rank.Three,
  Rank.Four,
  Rank.Five,
  Rank.Six,
  Rank.Seven,
  Rank.Eight,
  Rank.Nine,
  Rank.Ten,
  Rank.Jack,
  Rank.Queen,
  Rank.King,
  Rank.Ace,
] as const;

export const POWER_RANKS = [Rank.Two, Rank.Seven, Rank.Ten] as const;

export interface Card {
  id: string;
  rank: Rank;
  suit: Suit;
}

export type GamePhase = "lobby" | "setup" | "playing" | "finished" | "expired";
export type PlayerCardPhase = "hand" | "selected-field" | "hidden-field" | "out";
export type SevenDirection = "higher" | "lower";

export interface PublicPlayer {
  id: string;
  name: string;
  connected: boolean;
  ready: boolean;
  setupComplete: boolean;
  handCount: number;
  selectedFieldCount: number;
  hiddenFieldCount: number;
  cardPhase: PlayerCardPhase;
}

export interface FieldSlotView {
  slotId: string;
  occupied: boolean;
  kind: "selected" | "hidden";
}

export interface PublicGameState {
  roomCode: string;
  gameId: string | null;
  revision: number;
  turnSeq: number;
  phase: GamePhase;
  you: PublicPlayer & {
    hand: Card[];
    selectedField: FieldSlotView[];
    hiddenField: FieldSlotView[];
  };
  opponent: PublicPlayer | null;
  opponentSelectedField: FieldSlotView[];
  opponentHiddenField: FieldSlotView[];
  drawCount: number;
  playPile: Card[];
  lastPlay: { playerId: string; cards: Card[] } | null;
  burnedCount: number;
  currentTurnPlayerId: string | null;
  pendingSevenChoiceFor: string | null;
  restriction: { direction: SevenDirection; targetPlayerId: string } | null;
  winnerId: string | null;
  resultReason: "finished" | "forfeit" | "expired" | null;
  stats: { turnCount: number; pickups: Record<string, number> };
  message: string;
}

export type GameCommand =
  | { type: "READY" }
  | { type: "SELECT_SETUP_CARDS"; cardIds: string[] }
  | { type: "DRAW_CARD" }
  | { type: "PLAY_CARDS"; cardIds: string[] }
  | { type: "PICK_UP_PILE" }
  | { type: "CHOOSE_SEVEN_DIRECTION"; direction: SevenDirection }
  | { type: "SELECT_HIDDEN_CARD"; slotId: string }
  | { type: "REQUEST_REMATCH" }
  | { type: "LEAVE_ROOM" };

export interface ActionEnvelope {
  actionId: string;
  expectedRevision: number;
  expectedTurn?: number | undefined;
  command: GameCommand;
}

export type ErrorCode =
  | "INVALID_INPUT"
  | "ROOM_NOT_FOUND"
  | "ROOM_FULL"
  | "ROOM_EXPIRED"
  | "NOT_A_MEMBER"
  | "NOT_YOUR_TURN"
  | "STALE_STATE"
  | "DUPLICATE_ACTION"
  | "INVALID_PHASE"
  | "INVALID_CARDS"
  | "ILLEGAL_RANK"
  | "HAND_FULL"
  | "DRAW_PILE_EMPTY"
  | "SEVEN_CHOICE_REQUIRED"
  | "RATE_LIMITED";

export interface ActionResult {
  actionId: string;
  accepted: boolean;
  revision: number;
  error?: { code: ErrorCode; message: string };
}

const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("READY") }),
  z.object({ type: z.literal("SELECT_SETUP_CARDS"), cardIds: z.array(z.string()).length(3) }),
  z.object({ type: z.literal("DRAW_CARD") }),
  z.object({ type: z.literal("PLAY_CARDS"), cardIds: z.array(z.string()).min(1).max(52) }),
  z.object({ type: z.literal("PICK_UP_PILE") }),
  z.object({
    type: z.literal("CHOOSE_SEVEN_DIRECTION"),
    direction: z.enum(["higher", "lower"]),
  }),
  z.object({ type: z.literal("SELECT_HIDDEN_CARD"), slotId: z.string().min(1).max(80) }),
  z.object({ type: z.literal("REQUEST_REMATCH") }),
  z.object({ type: z.literal("LEAVE_ROOM") }),
]);

export const actionEnvelopeSchema = z.object({
  actionId: z.uuid(),
  expectedRevision: z.number().int().nonnegative(),
  expectedTurn: z.number().int().nonnegative().optional(),
  command: commandSchema,
});

export const displayNameSchema = z.string().trim().min(1).max(24);
export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-HJ-NP-Z2-9]{6}$/);

export const rankLabel: Record<Rank, string> = {
  [Rank.Two]: "Two",
  [Rank.Three]: "Three",
  [Rank.Four]: "Four",
  [Rank.Five]: "Five",
  [Rank.Six]: "Six",
  [Rank.Seven]: "Seven",
  [Rank.Eight]: "Eight",
  [Rank.Nine]: "Nine",
  [Rank.Ten]: "Ten",
  [Rank.Jack]: "Jack",
  [Rank.Queen]: "Queen",
  [Rank.King]: "King",
  [Rank.Ace]: "Ace",
};

export const suitSymbol: Record<Suit, string> = {
  [Suit.Clubs]: "♣",
  [Suit.Diamonds]: "♦",
  [Suit.Hearts]: "♥",
  [Suit.Spades]: "♠",
};
