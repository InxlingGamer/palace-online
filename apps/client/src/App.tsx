import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { io, type Socket } from "socket.io-client";
import {
  NORMAL_RANKS,
  POWER_RANKS,
  Rank,
  Suit,
  rankLabel,
  suitSymbol,
  type ActionEnvelope,
  type ActionResult,
  type Card as CardType,
  type GameCommand,
  type FieldSlotView,
  type PublicGameState,
} from "@palace/shared";
import { useSound } from "./audio";

const rankValue = new Map<Rank, number>(NORMAL_RANKS.map((rank, index) => [rank, index]));

function roomFromPath(): string | null {
  return /^\/room\/([A-Z2-9]{6})$/i.exec(window.location.pathname)?.[1]?.toUpperCase() ?? null;
}

async function api<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
    credentials: "include",
  });
  const body = (await response.json()) as T & { error?: { message: string } };
  if (!response.ok) throw new Error(body.error?.message ?? "Unable to reach the Palace.");
  return body;
}

function Card({
  card,
  selected = false,
  index = 0,
  count = 1,
  onClick,
}: {
  card: CardType;
  selected?: boolean;
  index?: number;
  count?: number;
  onClick?: () => void;
}) {
  const red = card.suit === Suit.Hearts || card.suit === Suit.Diamonds;
  const middle = (count - 1) / 2;
  const offset = index - middle;
  const style = {
    "--card-index": index,
    "--card-offset": offset,
    "--card-curve": `${Math.abs(offset) * 2.3}px`,
  } as CSSProperties;
  const label = `${rankLabel[card.rank]} of ${card.suit}${selected ? ", selected" : ""}`;
  const content = (
    <>
      <span className="card__corner">
        <b>{card.rank}</b>
        <span>{suitSymbol[card.suit]}</span>
      </span>
      <span className="card__pip" aria-hidden="true">
        {suitSymbol[card.suit]}
      </span>
      <span className="sr-only">{label}</span>
    </>
  );
  const className = `card ${red ? "card--red" : ""} ${selected ? "card--selected" : ""}`;
  return onClick ? (
    <button
      className={className}
      style={style}
      onClick={onClick}
      aria-label={label}
      aria-pressed={selected}
      type="button"
      data-card-id={card.id}
    >
      {content}
    </button>
  ) : (
    <div className={className} style={style} aria-label={label} data-card-id={card.id}>
      {content}
    </div>
  );
}

function CardBack({
  label = "Face-down card",
  onClick,
  dramatic = false,
}: {
  label?: string;
  onClick?: () => void;
  dramatic?: boolean;
}) {
  const className = `card card--back ${dramatic ? "card--dramatic" : ""}`;
  const mark = (
    <span className="card__back-mark" aria-hidden="true">
      P
    </span>
  );
  return onClick ? (
    <button className={className} onClick={onClick} type="button" aria-label={label}>
      {mark}
    </button>
  ) : (
    <div className={className} aria-label={label}>
      {mark}
    </div>
  );
}

function FieldRow({
  selectedField,
  hiddenField,
  owner,
  canSelectHidden = false,
  onHidden,
}: {
  selectedField: FieldSlotView[];
  hiddenField: FieldSlotView[];
  owner: "you" | "opponent";
  canSelectHidden?: boolean;
  onHidden?: (slotId: string) => void;
}) {
  return (
    <div className={`field-row field-row--${owner}`}>
      {hiddenField.map((hidden, index) => {
        const selected = selectedField[index];
        return (
          <div className="field-stack" key={hidden.slotId}>
            {hidden.occupied ? (
              <CardBack
                label={owner === "you" ? "Your hidden card" : "Opponent hidden card"}
                dramatic={canSelectHidden}
                {...(canSelectHidden
                  ? {
                      onClick: () => {
                        onHidden?.(hidden.slotId);
                      },
                    }
                  : {})}
              />
            ) : (
              <div className="card-slot" />
            )}
            {selected?.occupied && (
              <CardBack
                label={
                  owner === "you" ? "Your remembered field card" : "Opponent selected field card"
                }
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function isLegal(state: PublicGameState, rank: Rank): boolean {
  if (POWER_RANKS.includes(rank as (typeof POWER_RANKS)[number])) return true;
  if (state.restriction?.targetPlayerId === state.you.id) {
    const value = rankValue.get(rank)!;
    const seven = rankValue.get(Rank.Seven)!;
    return state.restriction.direction === "higher" ? value > seven : value < seven;
  }
  const top = state.playPile.at(-1);
  if (!top || top.rank === Rank.Two) return true;
  return rankValue.get(rank)! >= rankValue.get(top.rank)!;
}

function Lobby({
  initialCode,
  onEnter,
}: {
  initialCode: string;
  onEnter: (state: PublicGameState) => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (mode: "create" | "join", event: FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await api<{ roomCode: string; state: PublicGameState }>(
        mode === "create" ? "/api/rooms" : `/api/rooms/${code.toUpperCase()}/join`,
        { method: "POST", body: JSON.stringify({ name }) },
      );
      window.history.pushState({}, "", `/room/${result.roomCode}`);
      onEnter(result.state);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to enter the room.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="landing">
      <div className="landing__glow" aria-hidden="true" />
      <section className="hero">
        <div className="brand-mark" aria-hidden="true">
          <span>♠</span>
          <b>P</b>
          <span>♥</span>
        </div>
        <p className="eyebrow">A private table for two</p>
        <h1>
          Palace <em>Online</em>
        </h1>
        <p className="hero__copy">
          Build your three-card fortress, outplay the pile, and be the first to empty your Palace.
        </p>
        <div className="power-row" aria-label="Power cards">
          <span>
            <b>2</b> Play again
          </span>
          <span>
            <b>7</b> Higher or lower
          </span>
          <span>
            <b>10</b> Burn the pile
          </span>
        </div>
      </section>
      <section className="lobby-panel" aria-labelledby="lobby-title">
        <div>
          <p className="eyebrow">Enter the table</p>
          <h2 id="lobby-title">Your seat awaits</h2>
        </div>
        <form
          className="lobby-form"
          onSubmit={(event) => void submit(code ? "join" : "create", event)}
        >
          <label>
            Display name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={24}
              placeholder="The Cardsharp"
              required
              autoComplete="nickname"
            />
          </label>
          <label>
            Room code <span>(optional)</span>
            <input
              value={code}
              onChange={(event) =>
                setCode(
                  event.target.value
                    .replace(/[^a-zA-Z2-9]/g, "")
                    .slice(0, 6)
                    .toUpperCase(),
                )
              }
              placeholder="ABC234"
              minLength={6}
              maxLength={6}
              inputMode="text"
            />
          </label>
          <button className="button button--gold" disabled={busy}>
            {busy ? "Opening the doors…" : code ? "Join room" : "Create a room"}
          </button>
        </form>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <p className="fine-print">No account. No spectators. Just two players and one deck.</p>
      </section>
    </main>
  );
}

export function App() {
  const initialRoom = useMemo(roomFromPath, []);
  const [state, setState] = useState<PublicGameState | null>(null);
  const [loadingRoom, setLoadingRoom] = useState(Boolean(initialRoom));
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [connection, setConnection] = useState<"connected" | "reconnecting" | "offline">(
    "reconnecting",
  );
  const socketRef = useRef<Socket | null>(null);
  const previousRef = useRef<PublicGameState | null>(null);
  const sound = useSound();

  const connect = useCallback((roomCode: string) => {
    socketRef.current?.disconnect();
    const socket = io({ auth: { roomCode }, withCredentials: true });
    socketRef.current = socket;
    socket.on("connect", () => setConnection("connected"));
    socket.on("disconnect", () => setConnection("reconnecting"));
    socket.io.on("reconnect_failed", () => setConnection("offline"));
    socket.on("state:snapshot", (snapshot: PublicGameState) => {
      setState(snapshot);
      setSelected((current) =>
        current.filter((id) => snapshot.you.hand.some((card) => card.id === id)),
      );
    });
  }, []);

  useEffect(() => {
    if (!initialRoom) return;
    void api<{ state: PublicGameState }>(`/api/rooms/${initialRoom}/reconnect`, { method: "POST" })
      .then(({ state: restored }) => {
        setState(restored);
        connect(initialRoom);
      })
      .catch(() => setNotice("That saved room session has expired. Create or join another room."))
      .finally(() => setLoadingRoom(false));
  }, [connect, initialRoom]);

  useEffect(() => {
    if (!state) return;
    const previous = previousRef.current;
    if (previous && state.revision !== previous.revision) {
      if (state.burnedCount > previous.burnedCount) sound.play("burn");
      else if (state.playPile.length > previous.playPile.length) sound.play("play");
      else if (state.you.handCount > previous.you.handCount + 1) sound.play("pickup");
      if (state.phase === "finished" && previous.phase !== "finished")
        sound.play(state.winnerId === state.you.id ? "win" : "lose");
    }
    previousRef.current = state;
  }, [sound, state]);

  useEffect(
    () => () => {
      socketRef.current?.disconnect();
    },
    [],
  );

  const enter = (entered: PublicGameState) => {
    setNotice("");
    setState(entered);
    connect(entered.roomCode);
  };

  const act = async (command: GameCommand) => {
    if (!state || !socketRef.current) return;
    sound.unlock();
    const envelope: ActionEnvelope = {
      actionId: crypto.randomUUID(),
      expectedRevision: state.revision,
      command,
    };
    const result = (await socketRef.current.emitWithAck("game:action", envelope)) as ActionResult;
    if (!result.accepted) setNotice(result.error?.message ?? "That move was rejected.");
    else setNotice("");
  };

  if (loadingRoom)
    return (
      <main className="loading">
        <div className="brand-mark">
          <b>P</b>
        </div>
        <p>Restoring your seat…</p>
      </main>
    );
  if (!state) return <Lobby initialCode={initialRoom ?? ""} onEnter={enter} />;

  const yourTurn = state.currentTurnPlayerId === state.you.id;
  const pendingSeven = state.pendingSevenChoiceFor === state.you.id;
  const canPickup =
    yourTurn &&
    state.playPile.length > 0 &&
    !state.you.hand.some(({ rank }) => isLegal(state, rank));
  const selectedRank = state.you.hand.find(({ id }) => id === selected[0])?.rank;

  const toggleCard = (card: CardType) => {
    if (state.phase === "setup") {
      setSelected((current) =>
        current.includes(card.id)
          ? current.filter((id) => id !== card.id)
          : current.length < 3
            ? [...current, card.id]
            : current,
      );
      return;
    }
    if (!yourTurn || pendingSeven) return;
    setSelected((current) => {
      if (current.includes(card.id)) return current.filter((id) => id !== card.id);
      if (selectedRank && selectedRank !== card.rank) return [card.id];
      return [...current, card.id];
    });
  };

  const copyInvite = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}/room/${state.roomCode}`);
    setNotice("Invitation link copied.");
  };

  const opponent = state.opponent;
  return (
    <main className="game-shell" onPointerDown={sound.unlock}>
      <header className="game-header">
        <div className="mini-brand">
          <span>P</span>
          <b>Palace</b>
        </div>
        <button
          className="room-chip"
          onClick={() => void copyInvite()}
          aria-label={`Copy invitation for room ${state.roomCode}`}
        >
          <small>Room</small>
          <b>{state.roomCode}</b>
          <span>Copy</span>
        </button>
        <div className="header-actions">
          <span className={`connection connection--${connection}`}>
            <i />
            {connection}
          </span>
          <button
            className="icon-button"
            onClick={() => sound.setMuted(!sound.muted)}
            aria-label={sound.muted ? "Turn sound on" : "Mute sound"}
          >
            {sound.muted ? "🔇" : "🔊"}
          </button>
        </div>
      </header>

      <section className="table" aria-label="Palace card table">
        <div className="opponent-zone">
          <div className="player-label">
            <span className="avatar">{opponent?.name.slice(0, 1).toUpperCase() ?? "?"}</span>
            <div>
              <b>{opponent?.name ?? "Waiting…"}</b>
              <small>
                {opponent
                  ? `${opponent.handCount} card${opponent.handCount === 1 ? "" : "s"}`
                  : "Second seat open"}
              </small>
            </div>
            {opponent && (
              <span
                className={`presence ${opponent.ready ? "presence--ready" : opponent.connected ? "" : "presence--away"}`}
              >
                {opponent.ready ? "Ready" : opponent.connected ? "Online" : "Disconnected"}
              </span>
            )}
          </div>
          <div className="opponent-hand" aria-label={`${opponent?.handCount ?? 0} opponent cards`}>
            {Array.from({ length: Math.min(opponent?.handCount ?? 0, 12) }, (_, index) => (
              <CardBack key={index} />
            ))}
          </div>
          <FieldRow
            selectedField={state.opponentSelectedField}
            hiddenField={state.opponentHiddenField}
            owner="opponent"
          />
        </div>

        <div className="table-center">
          <div className="deck-stack">
            <CardBack label="Draw pile" />
            <span className="count-badge">{state.drawCount}</span>
            <small>Draw pile</small>
          </div>
          <div className={`play-stack ${state.burnedCount ? "play-stack--active" : ""}`}>
            {state.playPile.length ? (
              <Card card={state.playPile.at(-1)!} />
            ) : (
              <div className="pile-empty">
                <span>♛</span>
                <small>Play pile</small>
              </div>
            )}
            {state.playPile.length > 1 && (
              <span className="count-badge">{state.playPile.length}</span>
            )}
          </div>
          <div className="burn-zone">
            <span>✦</span>
            <b>{state.burnedCount}</b>
            <small>Burned</small>
          </div>
        </div>

        <div className="status-banner" aria-live="polite">
          <span className={yourTurn ? "turn-dot turn-dot--yours" : "turn-dot"} />{" "}
          <b>{yourTurn ? "Your turn" : opponent ? `${opponent.name}'s turn` : "Waiting"}</b>
          <span>{state.message}</span>
          {state.restriction && (
            <em>
              {state.restriction.direction === "higher" ? "↑ Higher than 7" : "↓ Lower than 7"}
            </em>
          )}
        </div>

        <div className="player-zone">
          <FieldRow
            selectedField={state.you.selectedField}
            hiddenField={state.you.hiddenField}
            owner="you"
            canSelectHidden={state.you.cardPhase === "hidden-field" && yourTurn}
            onHidden={(slotId) => void act({ type: "SELECT_HIDDEN_CARD", slotId })}
          />
          <div
            className={`hand ${state.phase === "setup" ? "hand--setup" : ""}`}
            aria-label="Your hand"
          >
            {state.you.hand.map((card, index) => (
              <Card
                key={card.id}
                card={card}
                selected={selected.includes(card.id)}
                index={index}
                count={state.you.hand.length}
                onClick={() => toggleCard(card)}
              />
            ))}
          </div>
          <div className="your-label">
            <span className="avatar avatar--you">{state.you.name.slice(0, 1).toUpperCase()}</span>
            <div>
              <b>{state.you.name}</b>
              <small>You · {state.you.cardPhase.replace("-", " ")}</small>
            </div>
          </div>
        </div>
      </section>

      <div className="action-dock">
        {state.phase === "lobby" && (
          <>
            <div>
              <b>{opponent ? "Both players are seated" : "Waiting for your rival"}</b>
              <span>
                {opponent
                  ? "Both players must be ready."
                  : "Share the room code or invitation link."}
              </span>
            </div>
            <button
              className="button button--gold"
              disabled={!opponent || state.you.ready}
              onClick={() => void act({ type: "READY" })}
            >
              {state.you.ready ? "Ready ✓" : "I'm ready"}
            </button>
          </>
        )}
        {state.phase === "setup" && !state.you.setupComplete && (
          <>
            <div>
              <b>Choose your fortress</b>
              <span>
                {selected.length}/3 cards selected · they turn face down after confirmation
              </span>
            </div>
            <button
              className="button button--gold"
              disabled={selected.length !== 3}
              onClick={() => void act({ type: "SELECT_SETUP_CARDS", cardIds: selected })}
            >
              Lock in cards
            </button>
          </>
        )}
        {state.phase === "setup" && state.you.setupComplete && (
          <div>
            <b>Your cards are locked</b>
            <span>Waiting for {opponent?.name ?? "your opponent"} to finish choosing.</span>
          </div>
        )}
        {state.phase === "playing" && pendingSeven && (
          <>
            <div>
              <b>Command the next move</b>
              <span>Your opponent must follow this direction.</span>
            </div>
            <div className="button-pair">
              <button
                className="button"
                onClick={() => void act({ type: "CHOOSE_SEVEN_DIRECTION", direction: "lower" })}
              >
                ↓ Lower
              </button>
              <button
                className="button button--gold"
                onClick={() => void act({ type: "CHOOSE_SEVEN_DIRECTION", direction: "higher" })}
              >
                ↑ Higher
              </button>
            </div>
          </>
        )}
        {state.phase === "playing" && !pendingSeven && (
          <>
            <div>
              <b>
                {selected.length
                  ? `${selected.length} × ${selectedRank}`
                  : yourTurn
                    ? "Choose a card"
                    : "Watch the table"}
              </b>
              <span>
                {yourTurn
                  ? "Power cards are always legal."
                  : `Waiting for ${opponent?.name ?? "opponent"}.`}
              </span>
            </div>
            <div className="button-pair">
              {canPickup && (
                <button
                  className="button button--danger"
                  onClick={() => void act({ type: "PICK_UP_PILE" })}
                >
                  Pick up pile
                </button>
              )}
              <button
                className="button button--gold"
                disabled={!yourTurn || selected.length === 0}
                onClick={() => void act({ type: "PLAY_CARDS", cardIds: selected })}
              >
                Play {selected.length || "cards"}
              </button>
            </div>
          </>
        )}
        {state.phase === "finished" && (
          <>
            <div>
              <b>
                {state.winnerId === state.you.id
                  ? "You rule the Palace!"
                  : `${opponent?.name ?? "Your opponent"} wins`}
              </b>
              <span>
                {state.stats.turnCount} turns · You picked up{" "}
                {state.stats.pickups[state.you.id] ?? 0} times
              </span>
            </div>
            <div className="button-pair">
              <button
                className="button"
                onClick={() => {
                  socketRef.current?.disconnect();
                  window.history.pushState({}, "", "/");
                  setState(null);
                }}
              >
                Lobby
              </button>
              <button
                className="button button--gold"
                disabled={state.you.ready}
                onClick={() => void act({ type: "REQUEST_REMATCH" })}
              >
                {state.you.ready ? "Rematch requested" : "Rematch"}
              </button>
            </div>
          </>
        )}
        {state.phase === "expired" && (
          <>
            <div>
              <b>Room expired</b>
              <span>The table could not be restored.</span>
            </div>
            <button
              className="button button--gold"
              onClick={() => {
                window.history.pushState({}, "", "/");
                setState(null);
              }}
            >
              Return home
            </button>
          </>
        )}
      </div>
      {notice && (
        <button className="toast" onClick={() => setNotice("")} role="alert">
          {notice}
          <span>×</span>
        </button>
      )}
    </main>
  );
}
