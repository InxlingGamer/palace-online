import type { PublicGameState } from "@palace/shared";

export function reconcileSelection(
  selected: string[],
  previous: PublicGameState | null,
  next: PublicGameState,
): string[] {
  if (previous?.roomCode !== next.roomCode || previous.gameId !== next.gameId) return [];
  return selected.filter((id) => next.you.hand.some((card) => card.id === id));
}
