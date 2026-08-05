import type { PublicGameState, SevenDirection } from "@palace/shared";

export function restrictionForViewer(state: PublicGameState): SevenDirection | null {
  return state.restriction?.targetPlayerId === state.you.id ? state.restriction.direction : null;
}
