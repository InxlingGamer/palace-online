import { useEffect, useRef, type CSSProperties } from "react";
import type { SevenDirection } from "@palace/shared";

export function SevenRestrictionAlert({ direction }: { direction: SevenDirection | null }) {
  if (!direction) return null;
  const higher = direction === "higher";
  return (
    <aside
      className={`seven-alert seven-alert--${direction}`}
      role="status"
      aria-live="assertive"
      aria-label={`Play ${direction} than seven`}
    >
      <span aria-hidden="true">{higher ? "↑" : "↓"}</span>
      <b>PLAY {higher ? "HIGHER" : "LOWER"} THAN 7</b>
    </aside>
  );
}

interface ResultOverlayProps {
  winner: boolean;
  forfeit: boolean;
  turnCount: number;
  pickupCount: number;
  rematchRequested: boolean;
  animate: boolean;
  onLobby: () => void;
  onRematch: () => void;
}

const confetti = Array.from({ length: 100 }, (_, index) => ({
  id: index,
  x: (index * 47 + 11) % 100,
  delay: (index * 37) % 900,
  duration: 2100 + ((index * 53) % 1700),
  hue: (index * 67) % 360,
  rotation: (index * 29) % 180,
}));

export function ResultOverlay({
  winner,
  forfeit,
  turnCount,
  pickupCount,
  rematchRequested,
  animate,
  onLobby,
  onRematch,
}: ResultOverlayProps) {
  const lobbyButton = useRef<HTMLButtonElement>(null);
  useEffect(() => lobbyButton.current?.focus(), []);
  const word = winner ? "WINNER" : "LOSER";

  return (
    <section
      className={`result-overlay result-overlay--${winner ? "winner" : "loser"} ${
        animate ? "result-overlay--animate" : "result-overlay--static"
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="result-title"
    >
      {winner && (
        <div className="confetti" aria-hidden="true">
          {confetti.map((piece) => (
            <i
              key={piece.id}
              data-confetti="true"
              style={
                {
                  "--confetti-x": `${piece.x}vw`,
                  "--confetti-y": `${(piece.id * 31 + 7) % 94}vh`,
                  "--confetti-delay": `${piece.delay}ms`,
                  "--confetti-duration": `${piece.duration}ms`,
                  "--confetti-hue": piece.hue,
                  "--confetti-rotation": `${piece.rotation}deg`,
                } as CSSProperties
              }
            />
          ))}
        </div>
      )}
      <div className="result-panel">
        <h2
          id="result-title"
          className={`result-title result-title--${winner ? "winner" : "loser"}`}
          aria-label={word}
        >
          {[...word].map((letter, index) => (
            <span
              key={`${letter}-${index}`}
              aria-hidden="true"
              style={{ "--letter-index": index } as CSSProperties}
            >
              {letter}
            </span>
          ))}
        </h2>
        {forfeit && <p className="result-reason">Forfeit</p>}
        <p className="result-stats">
          {turnCount} turns <span aria-hidden="true">·</span> {pickupCount} pickups
        </p>
        <div className="result-actions">
          <button ref={lobbyButton} className="button" onClick={onLobby} type="button">
            Lobby
          </button>
          <button
            className="button button--gold"
            disabled={rematchRequested}
            onClick={onRematch}
            type="button"
          >
            {rematchRequested ? "Rematch requested" : "Rematch"}
          </button>
        </div>
      </div>
    </section>
  );
}
