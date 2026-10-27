import { Rank, Suit } from "@palace/shared";
import { Card, CardBack } from "./cards";
import { CardStyleContext, DECKS, useCardStyle, type CardPreference } from "./decks";

const ace = { id: "preview-ace", rank: Rank.Ace, suit: Suit.Hearts };
function Preview({ preference, face = false }: { preference: CardPreference; face?: boolean }) {
  return (
    <CardStyleContext value={{ ...preference, setCardStyle: () => {} }}>
      <span className={face ? "deck-preview deck-preview--fan" : "deck-preview"} aria-hidden="true">
        <CardBack />
        {face && <Card card={ace} />}
      </span>
    </CardStyleContext>
  );
}
export function DeckPicker() {
  const { deck, back, setCardStyle } = useCardStyle();
  const selectedDeck = DECKS.find((option) => option.id === deck)!;
  return (
    <fieldset className="deck-picker">
      <legend>
        Your cards <span>(only you see this)</span>
      </legend>
      <div className="deck-tiles" role="radiogroup" aria-label="Card deck">
        {DECKS.map((option) => {
          const preference = {
            deck: option.id,
            back: option.id === deck ? back : option.backs[0].id,
          };
          return (
            <label className="deck-option" key={option.id}>
              <input
                type="radio"
                name="card-deck"
                value={option.id}
                checked={deck === option.id}
                onChange={() => setCardStyle(preference)}
              />
              <span className="deck-tile">
                <Preview preference={preference} face />
                <b>{option.name}</b>
                <span className="deck-check" aria-hidden="true">
                  {"\u2713"}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      <div className="back-swatches" role="radiogroup" aria-label="Card back">
        {selectedDeck.backs.map((option) => (
          <label className="deck-option" key={option.id}>
            <input
              type="radio"
              name="card-back"
              value={option.id}
              checked={back === option.id}
              onChange={() => setCardStyle({ deck, back: option.id })}
            />
            <span className="back-swatch">
              <Preview preference={{ deck, back: option.id }} />
              <b>{option.name}</b>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
