import type { PublicGameState } from "@palace/shared";

export function canPickUpPile(state: PublicGameState): boolean {
  return (
    state.phase === "playing" &&
    state.currentTurnPlayerId === state.you.id &&
    state.playPile.length > 0 &&
    state.pendingSevenChoiceFor === null
  );
}
