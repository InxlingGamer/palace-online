import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Rank, Suit } from "@palace/shared";
import { Card, CardBack } from "./cards";
import {
  CardStyleContext,
  DEFAULT_CARD_STYLE,
  DECKS,
  parseCardPreference,
  readCardPreference,
  saveCardPreference,
} from "./decks";

afterEach(() => vi.unstubAllGlobals());
describe("card preferences", () => {
  it.each([null, "", "broken json", "null", "[]", "42", "{}", '{"deck":"unknown","back":"red"}'])(
    "defaults for %s",
    (raw) => {
      expect(parseCardPreference(raw)).toEqual(DEFAULT_CARD_STYLE);
    },
  );
  it("uses the deck's first back for missing, invalid or incompatible backs", () => {
    expect(parseCardPreference('{"deck":"simple","back":"red"}')).toEqual({
      deck: "simple",
      back: "walnut",
    });
    expect(parseCardPreference('{"deck":"classic","back":"felt"}')).toEqual(DEFAULT_CARD_STYLE);
    expect(parseCardPreference('{"deck":"simple"}')).toEqual({ deck: "simple", back: "walnut" });
    expect(parseCardPreference('{"deck":"simple","back":42}')).toEqual({
      deck: "simple",
      back: "walnut",
    });
  });
  it("round-trips every supported preference through storage", () => {
    let stored: string | null = null;
    const getItem = vi.fn(() => stored);
    const setItem = vi.fn((_key: string, value: string) => {
      stored = value;
    });
    vi.stubGlobal("localStorage", { getItem, setItem });
    for (const deck of DECKS)
      for (const back of deck.backs) {
        const preference = { deck: deck.id, back: back.id };
        saveCardPreference(preference);
        expect(readCardPreference()).toEqual(preference);
        expect(setItem).toHaveBeenLastCalledWith("palace-cards", JSON.stringify(preference));
        expect(getItem).toHaveBeenLastCalledWith("palace-cards");
      }
  });
  it("handles unavailable storage on both reads and writes", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    });
    expect(readCardPreference()).toEqual(DEFAULT_CARD_STYLE);
    expect(() => saveCardPreference(DEFAULT_CARD_STYLE)).not.toThrow();
  });
});
describe("card deck rendering", () => {
  it("defaults standalone cards and backs to Classic / Red", () => {
    expect(
      renderToStaticMarkup(
        createElement(Card, { card: { id: "ace", rank: Rank.Ace, suit: Suit.Hearts } }),
      ),
    ).toContain('data-deck="classic"');
    expect(renderToStaticMarkup(createElement(CardBack))).toContain('data-back="red"');
  });
  it("renders all ranks and suits in both decks with their selected back", () => {
    for (const deck of DECKS)
      for (const back of deck.backs) {
        const markup = renderToStaticMarkup(
          createElement(
            CardStyleContext.Provider,
            { value: { deck: deck.id, back: back.id, setCardStyle: () => {} } },
            [
              ...Object.values(Rank).flatMap((rank) =>
                Object.values(Suit).map((suit) =>
                  createElement(Card, {
                    key: `${rank}-${suit}`,
                    card: { id: `${rank}-${suit}`, rank, suit },
                  }),
                ),
              ),
              createElement(CardBack, { key: "back" }),
            ],
          ),
        );
        expect(markup.match(new RegExp(`data-deck="${deck.id}"`, "g"))).toHaveLength(53);
        expect(markup).toContain(`data-back="${back.id}"`);
        expect(markup.match(/data-card-id=/g)).toHaveLength(52);
        expect(markup).not.toMatch(/textLength|scaleX|undefined|NaN/);
      }
  });
  it("retains interactive card semantics and state classes", () => {
    const markup = renderToStaticMarkup(
      createElement(Card, {
        card: { id: "queen", rank: Rank.Queen, suit: Suit.Diamonds },
        selected: true,
        illegal: true,
        onClick: () => {},
      }),
    );
    for (const expected of [
      "<button",
      'aria-pressed="true"',
      'aria-label="Queen of diamonds, selected"',
      'data-card-rank="Q"',
      "card--selected",
      "card--illegal",
      "card--red",
    ])
      expect(markup).toContain(expected);
    expect(
      renderToStaticMarkup(
        createElement(CardBack, { onClick: () => {}, dramatic: true, disabled: true }),
      ),
    ).toMatch(/disabled=""/);
  });
  it("gives repeated Simple backs unique pattern references", () => {
    const markup = renderToStaticMarkup(
      createElement(
        CardStyleContext.Provider,
        { value: { deck: "simple", back: "felt", setCardStyle: () => {} } },
        [createElement(CardBack, { key: 1 }), createElement(CardBack, { key: 2 })],
      ),
    );
    const ids = [...markup.matchAll(/<pattern id="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(markup).toContain(`url(#${id})`);
  });
});
