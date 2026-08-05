import type { Card, PublicGameState } from "@palace/shared";

export type VisualEvent =
  | { type: "starting-deal"; gameId: string; cards: Card[] }
  | { type: "collect-field"; cards: Card[] }
  | { type: "draw"; cards: Card[] }
  | { type: "setup-place"; cards: Card[] }
  | { type: "opponent-draw"; count: number }
  | { type: "blind-pickup"; revealedCard: Card; cards: Card[] }
  | { type: "opponent-blind-pickup"; count: number }
  | { type: "pickup"; cards: Card[] }
  | { type: "burn" }
  | { type: "play" }
  | { type: "player-joined" }
  | { type: "ready" }
  | { type: "hidden-reveal" }
  | { type: "result"; winner: boolean };

export function deriveVisualEvents(
  previous: PublicGameState,
  next: PublicGameState,
): VisualEvent[] {
  if (previous.revision === next.revision) return [];

  const events: VisualEvent[] = [];
  const previousHandIds = new Set(previous.you.hand.map(({ id }) => id));
  const addedCards = next.you.hand.filter(({ id }) => !previousHandIds.has(id));
  const previousPileIds = new Set(previous.playPile.map(({ id }) => id));
  const drawDelta = previous.drawCount - next.drawCount;
  const startingDeal = previous.phase === "lobby" && next.phase === "setup" && next.gameId !== null;
  const ownHiddenDecrease = previous.you.hiddenFieldCount > next.you.hiddenFieldCount;
  const opponentHiddenDecrease =
    (previous.opponent?.hiddenFieldCount ?? 0) > (next.opponent?.hiddenFieldCount ?? 0);
  const blindPickup =
    ownHiddenDecrease &&
    next.playPile.length === 0 &&
    addedCards.length > 0 &&
    addedCards.filter(({ id }) => !previousPileIds.has(id)).length === 1;

  if (startingDeal) {
    events.push({ type: "starting-deal", gameId: next.gameId!, cards: next.you.hand });
  } else if (blindPickup) {
    events.push({
      type: "blind-pickup",
      revealedCard: addedCards.find(({ id }) => !previousPileIds.has(id))!,
      cards: addedCards,
    });
  } else {
    const collectedField =
      previous.you.selectedFieldCount > 0 &&
      next.you.selectedFieldCount === 0 &&
      next.drawCount === 0 &&
      addedCards.length > 0;
    if (collectedField) events.push({ type: "collect-field", cards: addedCards });
    else if (drawDelta > 0 && addedCards.length > 0)
      events.push({ type: "draw", cards: addedCards });
    else if (previous.playPile.length > 0 && next.playPile.length === 0 && addedCards.length > 0)
      events.push({ type: "pickup", cards: addedCards });
  }

  if (
    !startingDeal &&
    !previous.you.setupComplete &&
    next.you.setupComplete &&
    previous.you.handCount > next.you.handCount
  ) {
    events.push({
      type: "setup-place",
      cards: previous.you.hand.filter(({ id }) => !next.you.hand.some((card) => card.id === id)),
    });
  }

  const opponentDrew =
    drawDelta > addedCards.length &&
    (next.opponent?.handCount ?? 0) > (previous.opponent?.handCount ?? 0);
  if (opponentDrew) {
    events.push({
      type: "opponent-draw",
      count: Math.min(
        drawDelta - addedCards.length,
        (next.opponent?.handCount ?? 0) - (previous.opponent?.handCount ?? 0),
      ),
    });
  }

  if (
    opponentHiddenDecrease &&
    next.playPile.length === 0 &&
    (next.opponent?.handCount ?? 0) > (previous.opponent?.handCount ?? 0)
  ) {
    events.push({
      type: "opponent-blind-pickup",
      count: (next.opponent?.handCount ?? 0) - (previous.opponent?.handCount ?? 0),
    });
  }

  if (next.burnedCount > previous.burnedCount) events.push({ type: "burn" });
  else if (next.playPile.length > previous.playPile.length) events.push({ type: "play" });
  if (!previous.opponent && next.opponent) events.push({ type: "player-joined" });
  if (!previous.you.ready && next.you.ready) events.push({ type: "ready" });
  if (ownHiddenDecrease || opponentHiddenDecrease) events.push({ type: "hidden-reveal" });
  if (next.phase === "finished" && previous.phase !== "finished")
    events.push({ type: "result", winner: next.winnerId === next.you.id });

  return events;
}
