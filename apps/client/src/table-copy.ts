import { NORMAL_RANKS, POWER_RANKS, Rank, rankLabel, type PublicGameState } from "@palace/shared";
const namedRank = (rank: Rank) =>
  NORMAL_RANKS.indexOf(rank as (typeof NORMAL_RANKS)[number]) >= NORMAL_RANKS.indexOf(Rank.Jack)
    ? rankLabel[rank]
    : rank;
export function lastMoveText(
  state: Pick<PublicGameState, "lastPlay" | "you" | "opponent">,
): string | null {
  const play = state.lastPlay;
  if (!play?.cards.length) return null;
  const name = play.playerId === state.you.id ? "You" : (state.opponent?.name ?? "Opponent");
  const playedRank = play.cards[0]!.rank;
  const rank = namedRank(playedRank);
  const count = play.cards.length;
  const article = playedRank === Rank.Ace || playedRank === Rank.Eight ? "an" : "a";
  const group =
    count === 1
      ? `${article} ${rank}`
      : count === 2
        ? `a pair of ${rank}s`
        : `${count === 3 ? "three" : "four"} ${rank}s`;
  return `${name} played ${group}`;
}
/** One short, calm status line for the table: whose turn it is, never the rules. */
export function statusText(
  state: Pick<
    PublicGameState,
    "phase" | "you" | "opponent" | "currentTurnPlayerId" | "pendingSevenChoiceFor" | "winnerId"
  >,
): string {
  const other = state.opponent?.name ?? "Opponent";
  switch (state.phase) {
    case "lobby":
      return "Waiting to start";
    case "setup":
      return state.you.setupComplete ? `Waiting for ${other}` : "Setting up";
    case "finished":
      return state.winnerId === state.you.id ? "You win" : `${other} wins`;
    case "expired":
      return "Table closed";
  }
  if (state.pendingSevenChoiceFor === state.you.id) return "Choose higher or lower";
  if (state.pendingSevenChoiceFor) return `${other} is choosing`;
  return state.currentTurnPlayerId === state.you.id ? "Your turn" : `${other}’s turn`;
}
/** "Play", "Play 9", or "Play 2 × 9" for the dock button. */
export function playLabel(count: number, rank: Rank | undefined): string {
  if (!count || !rank) return "Play";
  return count === 1 ? `Play ${rank}` : `Play ${count} × ${rank}`;
}
/** The full rule for the current turn, read to screen readers only (sighted players see dimmed cards). */
export function requirementText(
  state: Pick<
    PublicGameState,
    | "phase"
    | "message"
    | "playPile"
    | "restriction"
    | "you"
    | "opponent"
    | "currentTurnPlayerId"
    | "pendingSevenChoiceFor"
  >,
): string {
  if (state.phase !== "playing") return state.message;
  if (state.pendingSevenChoiceFor === state.you.id) return "Choose higher or lower";
  if (state.pendingSevenChoiceFor)
    return `${state.opponent?.name ?? "Opponent"} is choosing higher or lower`;
  if (state.currentTurnPlayerId !== state.you.id)
    return `${state.opponent?.name ?? "Opponent"} must play`;
  if (state.restriction?.targetPlayerId === state.you.id)
    return `Play ${state.restriction.direction} than 7`;
  const top = state.playPile.at(-1);
  if (!top || top.rank === Rank.Two) return "Play any card";
  const powers = POWER_RANKS.map(String);
  return `Play ${namedRank(top.rank)} or higher, or a ${powers.slice(0, -1).join(", ")} or ${powers.at(-1)}`;
}
