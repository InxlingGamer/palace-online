import { Rank, Suit, rankLabel, type Card as CardType } from "@palace/shared";
const PATHS: Record<Suit, string> = {
  spades:
    "M50 4 C62 22 94 40 94 62 C94 76 84 84 72 84 C63 84 56 80 52 74 C53 84 57 92 66 96 L34 96 C43 92 47 84 48 74 C44 80 37 84 28 84 C16 84 6 76 6 62 C6 40 38 22 50 4 Z",
  hearts:
    "M50 94 C24 74 4 56 4 33 C4 17 16 6 30 6 C40 6 47 12 50 21 C53 12 60 6 70 6 C84 6 96 17 96 33 C96 56 76 74 50 94 Z",
  diamonds: "M50 2 L90 50 L50 98 L10 50 Z",
  clubs:
    "M50 6 A21 21 0 1 1 49.99 6 Z M27 38 A21 21 0 1 1 26.99 38 Z M73 38 A21 21 0 1 1 72.99 38 Z M46 50 C46 76 40 88 30 96 L70 96 C60 88 54 76 54 50 Z",
};
const L: Record<string, number[][]> = {
  "2": [
    [50, 19, 0],
    [50, 81, 1],
  ],
  "3": [
    [50, 19, 0],
    [50, 50, 0],
    [50, 81, 1],
  ],
  "4": [
    [33, 19, 0],
    [67, 19, 0],
    [33, 81, 1],
    [67, 81, 1],
  ],
  "5": [
    [33, 19, 0],
    [67, 19, 0],
    [50, 50, 0],
    [33, 81, 1],
    [67, 81, 1],
  ],
  "6": [
    [33, 19, 0],
    [67, 19, 0],
    [33, 50, 0],
    [67, 50, 0],
    [33, 81, 1],
    [67, 81, 1],
  ],
  "7": [
    [33, 19, 0],
    [67, 19, 0],
    [50, 34.5, 0],
    [33, 50, 0],
    [67, 50, 0],
    [33, 81, 1],
    [67, 81, 1],
  ],
  "8": [
    [33, 19, 0],
    [67, 19, 0],
    [50, 34.5, 0],
    [33, 50, 0],
    [67, 50, 0],
    [50, 65.5, 1],
    [33, 81, 1],
    [67, 81, 1],
  ],
  "9": [
    [33, 19, 0],
    [67, 19, 0],
    [33, 39.5, 0],
    [67, 39.5, 0],
    [50, 50, 0],
    [33, 60.5, 1],
    [67, 60.5, 1],
    [33, 81, 1],
    [67, 81, 1],
  ],
  "10": [
    [33, 19, 0],
    [67, 19, 0],
    [50, 29, 0],
    [33, 39.5, 0],
    [67, 39.5, 0],
    [33, 60.5, 1],
    [67, 60.5, 1],
    [50, 71, 1],
    [33, 81, 1],
    [67, 81, 1],
  ],
};
export function SuitIcon({ suit }: { suit: Suit }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <path d={PATHS[suit]} fill="currentColor" />
    </svg>
  );
}
export function Card({
  card,
  selected = false,
  illegal = false,
  onClick,
}: {
  card: CardType;
  selected?: boolean;
  illegal?: boolean;
  onClick?: () => void;
}) {
  const red = card.suit === Suit.Hearts || card.suit === Suit.Diamonds;
  const court = ({ J: "jack", Q: "queen", K: "king" } as Record<string, string>)[card.rank];
  const label = `${rankLabel[card.rank]} of ${card.suit}${selected ? ", selected" : ""}`;
  const content = (
    <>
      {[false, true].map((bottom) => (
        <span
          key={String(bottom)}
          className={`card__corner ${bottom ? "card__corner--bottom" : ""}`}
        >
          <b>{card.rank}</b>
          <SuitIcon suit={card.suit} />
        </span>
      ))}
      {court ? (
        <div className="card__court" aria-hidden="true">
          <img src={`/cards/court-${court}.webp`} alt="" />
          <i />
          <img src={`/cards/court-${court}.webp`} alt="" />
          <SuitIcon suit={card.suit} />
          <SuitIcon suit={card.suit} />
        </div>
      ) : (
        (card.rank === Rank.Ace ? [[50, 50, 0]] : (L[card.rank] ?? [])).map(([x, y, r], i) => (
          <span
            key={i}
            className={`card__pip ${card.rank === Rank.Ace ? "card__pip--ace" : ""}`}
            style={{
              left: `${x}%`,
              top: `${y}%`,
              transform: `translate(-50%, -50%) rotate(${r ? 180 : 0}deg)`,
            }}
          >
            <SuitIcon suit={card.suit} />
          </span>
        ))
      )}
    </>
  );
  const props = {
    className: `card ${red ? "card--red" : ""} ${selected ? "card--selected" : ""} ${illegal ? "card--illegal" : ""}`,
    "aria-label": label,
    "data-card-id": card.id,
    "data-card-rank": card.rank,
  };
  return onClick ? (
    <button {...props} type="button" onClick={onClick} aria-pressed={selected}>
      {content}
    </button>
  ) : (
    <div {...props}>{content}</div>
  );
}
export function CardBack({
  label = "Face-down card",
  onClick,
  dramatic = false,
  disabled = false,
}: {
  label?: string;
  onClick?: () => void;
  dramatic?: boolean;
  disabled?: boolean;
}) {
  const className = `card card--back ${dramatic ? "card--dramatic" : ""}`;
  const content = (
    <span className="card__back-pattern" aria-hidden="true">
      <span className="card__medallion">P</span>
    </span>
  );
  return onClick ? (
    <button
      className={className}
      onClick={onClick}
      type="button"
      aria-label={label}
      disabled={disabled}
    >
      {content}
    </button>
  ) : (
    <div className={className} aria-label={label}>
      {content}
    </div>
  );
}
