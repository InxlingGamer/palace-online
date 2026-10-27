import { useId } from "react";
import { Rank, Suit, rankLabel, type Card as CardType } from "@palace/shared";
import { useCardStyle, type DeckId } from "./decks";

const PATHS: Record<Suit, string> = {
  spades:
    "M50 5 C42 18 5 38 5 61 C5 80 27 86 44 72 C44 86 39 98 30 107 L70 107 C61 98 56 86 56 72 C73 86 95 80 95 61 C95 38 58 18 50 5 Z",
  hearts: "M50 106 C40 94 5 69 5 39 C5 11 37 4 50 27 C63 4 95 11 95 39 C95 69 60 94 50 106 Z",
  clubs:
    "M43 68 C26 89 3 77 5 56 C6 39 24 33 36 40 C21 25 31 5 50 5 C69 5 79 25 64 40 C76 33 94 39 95 56 C97 77 74 89 57 68 C56 85 61 98 70 107 L30 107 C39 98 44 85 43 68 Z",
  diamonds: "M50 3 L91 56 L50 109 L9 56 Z",
};
export function SuitIcon({ suit }: { suit: Suit }) {
  return (
    <svg viewBox="0 0 100 112" aria-hidden="true">
      <path d={PATHS[suit]} fill="currentColor" />
    </svg>
  );
}
function Pip({
  suit,
  x,
  y,
  width,
  inverted = false,
}: {
  suit: Suit;
  x: number;
  y: number;
  width: number;
  inverted?: boolean;
}) {
  const h = width * 1.12;
  return (
    <g transform={`translate(${x} ${y})${inverted ? " rotate(180)" : ""}`}>
      <svg x={-width / 2} y={-h / 2} width={width} height={h} viewBox="0 0 100 112">
        <path fill="currentColor" d={PATHS[suit]} />
      </svg>
    </g>
  );
}
function positions(rank: Rank, deck: DeckId): [number, number][] {
  const n = Number(rank),
    top = deck === "classic" ? 25.2 : 28,
    bottom = 140 - top;
  if (n === 2)
    return [
      [50, top],
      [50, bottom],
    ];
  if (n === 3)
    return [
      [50, top],
      [50, 70],
      [50, bottom],
    ];
  const rows =
    n <= 5
      ? [top, bottom]
      : n <= 8
        ? [top, 70, bottom]
        : [top, top + (bottom - top) / 3, top + (2 * (bottom - top)) / 3, bottom];
  const left = deck === "classic" ? 33 : n === 10 ? 35 : 32;
  const result: [number, number][] = rows.flatMap((y): [number, number][] => [
    [left, y],
    [100 - left, y],
  ]);
  if (n === 5 || n === 9) result.push([50, 70]);
  if (n === 7 || n === 8) result.push([50, (top + 70) / 2]);
  if (n === 8) result.push([50, (70 + bottom) / 2]);
  if (n === 10) result.push([50, (rows[0]! + rows[1]!) / 2], [50, (rows[2]! + rows[3]!) / 2]);
  return result;
}
function Index({
  rank,
  suit,
  deck,
  inverted = false,
}: {
  rank: Rank;
  suit: Suit;
  deck: DeckId;
  inverted?: boolean;
}) {
  const classic = deck === "classic";
  // Fixed centres accommodate the widest natural Q/K and the smaller ten without glyph scaling.
  const x = classic ? 14.6 : 17.2;
  return (
    <g transform={inverted ? "translate(100 140) rotate(180)" : undefined}>
      <text
        x={x}
        y={classic ? 22 : 24}
        textAnchor="middle"
        fill="currentColor"
        fontFamily={
          classic ? "'Libre Caslon Text', Georgia, serif" : "'Source Serif 4', Georgia, serif"
        }
        fontWeight="700"
        fontSize={classic ? (rank === Rank.Ten ? 17.66 : 22.08) : rank === Rank.Ten ? 20.55 : 27.4}
        letterSpacing={rank === Rank.Ten ? "-.05em" : undefined}
      >
        {rank}
      </text>
      <Pip suit={suit} x={x} y={classic ? 35 : 39} width={classic ? 11 : 12} />
    </g>
  );
}
function Face({ card, deck }: { card: CardType; deck: DeckId }) {
  const id = useId();
  const classic = deck === "classic";
  const court = ({ J: "jack", Q: "queen", K: "king" } as Record<string, string>)[card.rank];
  const src = `/cards/${deck}/${court}.webp`;
  return (
    <svg className="card__svg" viewBox="0 0 100 140" aria-hidden="true">
      {court ? (
        classic ? (
          <>
            <svg
              x="25.652"
              y="14.652"
              width="48.696"
              height="110.696"
              viewBox="0 0 50 112"
              overflow="hidden"
            >
              <svg width="50" height="56" overflow="hidden">
                <image href={src} width="50" height="56" preserveAspectRatio="xMidYMin slice" />
              </svg>
              <g transform="translate(50 112) rotate(180)">
                <svg width="50" height="56" overflow="hidden">
                  <image href={src} width="50" height="56" preserveAspectRatio="xMidYMin slice" />
                </svg>
              </g>
              <path
                d="M0 56H50"
                stroke="#111111"
                strokeWidth=".65"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <rect
              x="25"
              y="14"
              width="50"
              height="112"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
            <rect x="27" y="16" width="13" height="15" fill="white" />
            <rect x="60" y="109" width="13" height="15" fill="white" />
            <Pip suit={card.suit} x={33.5} y={23.5} width={11} />
            <Pip suit={card.suit} x={66.5} y={116.5} width={11} inverted />
          </>
        ) : (
          <>
            <defs>
              <clipPath id={id}>
                <rect x="30.435" y="17.235" width="39.13" height="105.53" rx="2.565" />
              </clipPath>
            </defs>
            <g clipPath={`url(#${id})`}>
              <image
                href={src}
                x={50 - (105.53 * 1.22 * 2) / 3 / 2}
                y={122.765 - 105.53 * 1.22}
                width={(105.53 * 1.22 * 2) / 3}
                height={105.53 * 1.22}
              />
            </g>
            <rect
              x="30.2175"
              y="17.0175"
              width="39.565"
              height="105.965"
              rx="2.7825"
              fill="none"
              stroke="#E3B54A"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <Pip suit={card.suit} x={50} y={131} width={7.5} />
          </>
        )
      ) : card.rank === Rank.Ace ? (
        classic ? (
          card.suit === Suit.Spades ? (
            <image
              href="/cards/classic/ace-spades.webp"
              x="22"
              y="20"
              width="56"
              height="100"
              preserveAspectRatio="xMidYMid meet"
            />
          ) : (
            <Pip suit={card.suit} x={50} y={70} width={34} />
          )
        ) : (
          <>
            <circle cx="50" cy="70" r="31" fill="none" stroke="#E3B54A" strokeWidth="1.2" />
            <Pip suit={card.suit} x={50} y={70} width={40} />
          </>
        )
      ) : (
        positions(card.rank, deck).map(([x, y], i) => (
          <Pip
            key={i}
            suit={card.suit}
            x={x}
            y={y}
            width={
              classic ? (card.rank === Rank.Ten ? 14.5 : 16) : card.rank === Rank.Ten ? 12.5 : 14
            }
            inverted={y > 70}
          />
        ))
      )}
      <Index rank={card.rank} suit={card.suit} deck={deck} />
      <Index rank={card.rank} suit={card.suit} deck={deck} inverted />
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
  const { deck } = useCardStyle();
  const red = card.suit === Suit.Hearts || card.suit === Suit.Diamonds;
  const props = {
    className: `card ${red ? "card--red" : ""} ${selected ? "card--selected" : ""} ${illegal ? "card--illegal" : ""}`,
    "aria-label": `${rankLabel[card.rank]} of ${card.suit}${selected ? ", selected" : ""}`,
    "data-card-id": card.id,
    "data-card-rank": card.rank,
    "data-deck": deck,
  };
  const content = <Face card={card} deck={deck} />;
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
  const { deck, back } = useCardStyle();
  const id = useId();
  const panel = back === "walnut" ? "#2A1910" : "#1B6141";
  const content = (
    <svg className="card__svg" viewBox="0 0 100 140" aria-hidden="true">
      {deck === "classic" ? (
        <svg x="6" y="6" width="88" height="128" viewBox="0 0 88 128">
          <defs>
            <clipPath id={id}>
              <rect width="88" height="128" rx="3" />
            </clipPath>
          </defs>
          <image
            href={`/cards/classic/back-${back}.webp`}
            width="88"
            height="128"
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#${id})`}
          />
        </svg>
      ) : (
        <>
          <defs>
            <pattern id={id} width="20" height="20" patternUnits="userSpaceOnUse">
              <path
                d="M0 10L10 0L20 10L10 20Z"
                fill="none"
                stroke="#E3B54A"
                strokeOpacity=".35"
                strokeWidth=".45"
              />
            </pattern>
          </defs>
          <rect x="6" y="6" width="88" height="128" rx="3" fill={panel} />
          <rect
            x="9"
            y="9"
            width="82"
            height="122"
            rx="2"
            fill={`url(#${id})`}
            stroke="#E3B54A"
            strokeOpacity=".35"
            strokeWidth=".5"
          />
          <circle cx="50" cy="70" r="22" fill={panel} />
          <circle cx="50" cy="70" r="19.5" fill="none" stroke="#E3B54A" strokeWidth=".8" />
          <text
            className="card__monogram"
            x="50"
            y="80.5"
            textAnchor="middle"
            fontFamily="'Source Serif 4', Georgia, serif"
            fontWeight="600"
            fontSize="32"
            fill="#E3B54A"
          >
            P
          </text>
        </>
      )}
    </svg>
  );
  const props = {
    className: `card card--back ${dramatic ? "card--dramatic" : ""}`,
    "aria-label": label,
    "data-deck": deck,
    "data-back": back,
  };
  return onClick ? (
    <button {...props} onClick={onClick} type="button" disabled={disabled}>
      {content}
    </button>
  ) : (
    <div {...props}>{content}</div>
  );
}
