import type { CSSProperties } from "react";
import { useDialogFocus } from "./dialog-focus";
import type { SevenDirection } from "@palace/shared";
import "./result.css";

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
  opponentName: string;
  turnCount: number;
  yourPickups: number;
  opponentPickups: number;
  rematchRequested: boolean;
  opponentWantsRematch: boolean;
  pending?: boolean;
  animate: boolean;
  onLobby: () => void;
  onRematch: () => void;
}

const confetti = Array.from({ length: 100 }, (_, index) => ({
  id: index,
  x: (index * 47 + 11) % 100,
  delay: (index * 37) % 900,
  duration: 2400 + ((index * 53) % 1801),
  color: ["var(--gold)", "#f7e7ae", "var(--cream)", "var(--red)", "#4fae7c"][index % 5],
  rotation: (index * 29) % 180,
}));

export function ResultOverlay({
  winner,
  forfeit,
  opponentName,
  turnCount,
  yourPickups,
  opponentPickups,
  rematchRequested,
  opponentWantsRematch,
  pending = false,
  animate,
  onLobby,
  onRematch,
}: ResultOverlayProps) {
  const dialog = useDialogFocus();
  const word = winner ? "WINNER" : "LOSER";

  return (
    <section
      ref={dialog}
      tabIndex={-1}
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
                  "--confetti-x": `${piece.x}%`,
                  "--confetti-y": `${(piece.id * 31 + 7) % 94}%`,
                  "--confetti-delay": `${piece.delay}ms`,
                  "--confetti-duration": `${piece.duration}ms`,
                  "--confetti-color": piece.color,
                  "--confetti-sway": `${((piece.id * 17) % 81) - 40}px`,
                  "--confetti-rotation": `${piece.rotation}deg`,
                } as CSSProperties
              }
            />
          ))}
        </div>
      )}
      <div className="result-panel">
        <div className="result-emblem" aria-hidden="true">
          {winner ? (
            <svg viewBox="0 0 48 48" fill="none">
              <path d="m8 16 8 7 8-13 8 13 8-7-5 20H13L8 16Z" fill="currentColor" />
              <path d="M14 40h20" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.7">
              <rect x="10" y="9" width="22" height="30" rx="3" transform="rotate(-14 21 24)" />
              <rect
                x="19"
                y="10"
                width="22"
                height="30"
                rx="3"
                transform="rotate(12 30 25)"
                fill="var(--dock)"
              />
              <path d="m28 21 4 4-4 4-4-4 4-4Z" />
            </svg>
          )}
        </div>
        <p className="result-eyebrow">{forfeit ? "By forfeit" : "Game over"}</p>
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
        <p className="result-subtitle">
          {winner ? (
            forfeit ? (
              <>
                <span className="result-name">{opponentName}</span> left the table.
              </>
            ) : (
              "You cleared your palace first."
            )
          ) : forfeit ? (
            "The game ended by forfeit."
          ) : (
            <>
              <span className="result-name">{opponentName}</span> cleared their palace first.
            </>
          )}
        </p>
        <dl className="result-stats">
          <div>
            <dt>Turns</dt>
            <dd>{turnCount}</dd>
          </div>
          <div>
            <dt>Your pickups</dt>
            <dd>{yourPickups}</dd>
          </div>
          <div>
            <dt title={`${opponentName}'s pickups`}>{opponentName}'s pickups</dt>
            <dd>{opponentPickups}</dd>
          </div>
        </dl>
        {opponentWantsRematch && !rematchRequested && (
          <p className="result-status result-status--invitation" role="status">
            <span className="result-status-dot" aria-hidden="true" />
            <span className="result-status-copy">
              <span className="result-name">{opponentName}</span> wants a rematch
            </span>
          </p>
        )}
        {rematchRequested && !opponentWantsRematch && (
          <p className="result-status" role="status">
            <span className="result-status-copy">
              Waiting for <span className="result-name">{opponentName}</span>…
            </span>
          </p>
        )}
        <div className="result-actions">
          <button className="button result-lobby" onClick={onLobby} type="button">
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
            >
              <path d="m9 4-6 6 6 6M3 10h14" />
            </svg>
            Lobby
          </button>
          <button
            className="button button--gold result-rematch"
            disabled={pending || rematchRequested}
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
