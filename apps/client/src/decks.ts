import { createContext, createElement, useContext, useState, type ReactNode } from "react";

export type DeckId = "classic" | "simple";
export type BackId = "red" | "blue" | "walnut" | "felt";
export interface CardPreference {
  deck: DeckId;
  back: BackId;
}
export const DEFAULT_CARD_STYLE: CardPreference = { deck: "classic", back: "red" };
export const DECKS: {
  id: DeckId;
  name: string;
  backs: [{ id: BackId; name: string }, ...{ id: BackId; name: string }[]];
}[] = [
  {
    id: "classic",
    name: "Classic",
    backs: [
      { id: "red", name: "Red" },
      { id: "blue", name: "Blue" },
    ],
  },
  {
    id: "simple",
    name: "Simple",
    backs: [
      { id: "walnut", name: "Walnut" },
      { id: "felt", name: "Felt" },
    ],
  },
];
export function parseCardPreference(raw: string | null): CardPreference {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (
      !value ||
      typeof value !== "object" ||
      !("deck" in value) ||
      (value.deck !== "classic" && value.deck !== "simple")
    )
      return { ...DEFAULT_CARD_STYLE };
    const deck = DECKS.find((deck) => deck.id === value.deck)!;
    const back = "back" in value ? deck.backs.find((back) => back.id === value.back) : undefined;
    return { deck: deck.id, back: (back ?? deck.backs[0]).id };
  } catch {
    return { ...DEFAULT_CARD_STYLE };
  }
}
export function readCardPreference(): CardPreference {
  try {
    return parseCardPreference(localStorage.getItem("palace-cards"));
  } catch {
    return { ...DEFAULT_CARD_STYLE };
  }
}
export function saveCardPreference(preference: CardPreference): void {
  try {
    localStorage.setItem("palace-cards", JSON.stringify(preference));
  } catch {
    /* The preference still works for this visit if storage is unavailable. */
  }
}
interface CardStyle extends CardPreference {
  setCardStyle: (preference: CardPreference) => void;
}
export const CardStyleContext = createContext<CardStyle>({
  ...DEFAULT_CARD_STYLE,
  setCardStyle: () => {},
});
export function CardStyleProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState(readCardPreference);
  const setCardStyle = (next: CardPreference) => {
    const validated = parseCardPreference(JSON.stringify(next));
    setPreference(validated);
    saveCardPreference(validated);
  };
  return createElement(
    CardStyleContext.Provider,
    { value: { ...preference, setCardStyle } },
    children,
  );
}
export function useCardStyle() {
  return useContext(CardStyleContext);
}
