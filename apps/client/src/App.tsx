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
  type ActionResult,
  type Card as CardType,
  type GameCommand,
  type FieldSlotView,
  type PublicGameState,
} from "@palace/shared";
import { createActionSender, shouldAcceptSnapshot } from "./action-sender";
import { canPickUpPile } from "./pickup";
import { useSound } from "./audio";
import { ResultOverlay, SevenRestrictionAlert } from "./feedback";
import { restrictionForViewer } from "./restriction";
import { deriveVisualEvents } from "./visual-events";

const rankValue = new Map<Rank, number>(NORMAL_RANKS.map((rank, index) => [rank, index]));
const handRanks = [Rank.Two, ...NORMAL_RANKS] as const;
const handRankValue = new Map<Rank, number>(handRanks.map((rank, index) => [rank, index]));

type FlightKind =
  | "draw"
  | "opponent-draw"
  | "hidden-deal"
  | "hand-deal"
  | "setup"
  | "collect"
  | "blind-reveal"
  | "pickup"
  | "opponent-pickup";

interface CardFlight {
  key: string;
  kind: FlightKind;
  card?: CardType;
  index: number;
  delay: number;
}

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
  if (!response.ok) throw new Error(body.error?.message ?? "Request failed.");
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
      data-card-rank={card.rank}
    >
      {content}
    </button>
  ) : (
    <div
      className={className}
      style={style}
      aria-label={label}
      data-card-id={card.id}
      data-card-rank={card.rank}
    >
      {content}
    </div>
  );
}

function CardBack({
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
  const pattern = <span className="card__back-pattern" aria-hidden="true" />;
  return onClick ? (
    <button
      className={className}
      onClick={onClick}
      type="button"
      aria-label={label}
      disabled={disabled}
    >
      {pattern}
    </button>
  ) : (
    <div className={className} aria-label={label}>
      {pattern}
    </div>
  );
}

function FlightLayer({ flights }: { flights: CardFlight[] }) {
  if (flights.length === 0) return null;
  return (
    <div className="flight-layer" aria-hidden="true">
      {flights.map((flight) => (
        <div
          key={flight.key}
          className={`card-flight card-flight--${flight.kind}`}
          style={
            {
              "--flight-index": flight.index,
              "--flight-delay": `${flight.delay}ms`,
              "--flight-x": `${
                (flight.index - (flight.kind === "hand-deal" ? 2.5 : 1)) *
                (flight.kind === "hand-deal" ? 38 : 58)
              }px`,
            } as CSSProperties
          }
        >
          {flight.card ? <Card card={flight.card} /> : <CardBack />}
        </div>
      ))}
    </div>
  );
}

function FieldRow({
  selectedField,
  hiddenField,
  owner,
  canSelectHidden = false,
  pending = false,
  onHidden,
}: {
  selectedField: FieldSlotView[];
  hiddenField: FieldSlotView[];
  owner: "you" | "opponent";
  canSelectHidden?: boolean;
  pending?: boolean;
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
                disabled={pending}
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
        <h1>
          Palace <em>Online</em>
        </h1>
      </section>
      <section className="lobby-panel" aria-labelledby="lobby-title">
        <h2 id="lobby-title">Create or join a room</h2>
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
              placeholder="Player name"
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
            {busy ? (code ? "Joining…" : "Creating…") : code ? "Join room" : "Create room"}
          </button>
        </form>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
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
  const [pending, setPending] = useState(false);
  const [drawBusy, setDrawBusy] = useState(false);
  const [noticeTone, setNoticeTone] = useState<"info" | "error">("error");
  const senderRef = useRef<ReturnType<typeof createActionSender> | null>(null);
  const snapshotRef = useRef<PublicGameState | null>(null);
  const [flights, setFlights] = useState<CardFlight[]>([]);
  const [animateResult, setAnimateResult] = useState(false);
  const [presentedResult, setPresentedResult] = useState<string | null>(null);
  const [connection, setConnection] = useState<"connected" | "reconnecting" | "offline">(
    "reconnecting",
  );
  const socketRef = useRef<Socket | null>(null);
  const previousRef = useRef<PublicGameState | null>(null);
  const flightTimerRef = useRef<number | null>(null);
  const resultGameRef = useRef<string | null>(null);
  const resultTimerRef = useRef<number | null>(null);
  const sound = useSound();
  const rejectSoundRef = useRef(sound.play);

  useEffect(() => {
    rejectSoundRef.current = sound.play;
  }, [sound.play]);

  const connect = useCallback((roomCode: string) => {
    senderRef.current?.dispose();
    setPending(false);
    setDrawBusy(false);
    senderRef.current = null;
    socketRef.current?.disconnect();
    const socket = io({ auth: { roomCode }, withCredentials: true });
    socketRef.current = socket;
    setConnection("reconnecting");
    socket.on("connect", () => setConnection("connected"));
    socket.on("disconnect", (reason) =>
      setConnection(reason === "io server disconnect" ? "offline" : "reconnecting"),
    );
    socket.on("connect_error", (error) => {
      setConnection("offline");
      // The server no longer knows this seat (restart, cleanup, or revoked session): stop retrying.
      if (error.message !== "Invalid room session") return;
      socket.disconnect();
      setState(
        (current) =>
          current && {
            ...current,
            phase: "expired",
            message: "This table is no longer available.",
          },
      );
    });
    socket.io.on("reconnect_failed", () => setConnection("offline"));
    socket.on("state:snapshot", (snapshot: PublicGameState) => {
      if (!shouldAcceptSnapshot(snapshotRef.current, snapshot)) return;
      snapshotRef.current = snapshot;
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
        snapshotRef.current = restored;
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
      const nextFlights: CardFlight[] = [];
      const events = deriveVisualEvents(previous, state);
      const blindPickup = events.some(({ type }) => type === "blind-pickup");
      let animationDuration = 1900;

      for (const event of events) {
        if (event.type === "starting-deal") {
          if (sessionStorage.getItem(`palace-deal-${event.gameId}`)) continue;
          sessionStorage.setItem(`palace-deal-${event.gameId}`, "true");
          for (let index = 0; index < 3; index += 1)
            nextFlights.push({
              key: `${event.gameId}-hidden-${index}`,
              kind: "hidden-deal",
              index,
              delay: index * 90,
            });
          event.cards.forEach((card, index) =>
            nextFlights.push({
              key: `${event.gameId}-hand-${card.id}`,
              kind: "hand-deal",
              card,
              index,
              delay: 320 + index * 85,
            }),
          );
          sound.play("shuffle");
          sound.play("deal", 260);
        } else if (event.type === "collect-field" || event.type === "draw") {
          event.cards.forEach((card, index) =>
            nextFlights.push({
              key: `${event.type}-${state.revision}-${card.id}`,
              kind: event.type === "draw" ? "draw" : "collect",
              card,
              index,
              delay: index * 120,
            }),
          );
          sound.play(event.type === "draw" ? "draw" : "collect");
        } else if (event.type === "setup-place") {
          event.cards.forEach((card, index) =>
            nextFlights.push({
              key: `setup-${state.revision}-${card.id}`,
              kind: "setup",
              card,
              index,
              delay: index * 100,
            }),
          );
          sound.play("place");
        } else if (event.type === "opponent-draw") {
          for (let index = 0; index < event.count; index += 1)
            nextFlights.push({
              key: `opponent-draw-${state.revision}-${index}`,
              kind: "opponent-draw",
              index,
              delay: index * 100,
            });
          sound.play("receive");
        } else if (event.type === "blind-pickup") {
          nextFlights.push({
            key: `blind-reveal-${state.revision}-${event.revealedCard.id}`,
            kind: "blind-reveal",
            card: event.revealedCard,
            index: 0,
            delay: 0,
          });
          event.cards.forEach((card, index) =>
            nextFlights.push({
              key: `blind-pickup-${state.revision}-${card.id}`,
              kind: "pickup",
              card,
              index,
              delay: 1050 + index * 55,
            }),
          );
          sound.play("reveal");
          sound.play("pickup", 1000);
          animationDuration = Math.max(2800, 2150 + event.cards.length * 55);
        } else if (event.type === "opponent-blind-pickup") {
          for (let index = 0; index < Math.min(event.count, 18); index += 1)
            nextFlights.push({
              key: `opponent-pickup-${state.revision}-${index}`,
              kind: "opponent-pickup",
              index,
              delay: 850 + index * 45,
            });
          sound.play("pickup", 800);
        } else if (event.type === "pickup") {
          event.cards.forEach((card, index) =>
            nextFlights.push({
              key: `pickup-${state.revision}-${card.id}`,
              kind: "pickup",
              card,
              index,
              delay: index * 45,
            }),
          );
          sound.play("pickup");
        } else if (event.type === "burn") sound.play("burn");
        else if (event.type === "play") sound.play("play");
        else if (event.type === "player-joined") sound.play("join");
        else if (event.type === "ready") sound.play("ready");
        else if (event.type === "hidden-reveal" && !blindPickup) sound.play("reveal");
      }

      if (nextFlights.length > 0) {
        setFlights(nextFlights);
        if (flightTimerRef.current) window.clearTimeout(flightTimerRef.current);
        flightTimerRef.current = window.setTimeout(() => setFlights([]), animationDuration);
      }
    }
    previousRef.current = state;
  }, [sound, state]);

  useEffect(() => {
    if (!state || state.phase !== "finished" || !state.gameId) {
      if (resultTimerRef.current !== null) window.clearTimeout(resultTimerRef.current);
      resultTimerRef.current = null;
      resultGameRef.current = null;
      setPresentedResult(null);
      setAnimateResult(false);
      return;
    }
    if (resultGameRef.current === state.gameId) return;
    if (resultTimerRef.current !== null) window.clearTimeout(resultTimerRef.current);
    resultGameRef.current = state.gameId;
    setPresentedResult(null);
    const key = `palace-result-${state.gameId}-${state.you.id}`;
    const alreadyPresented = sessionStorage.getItem(key) === "true";
    const present = () => {
      resultTimerRef.current = null;
      setAnimateResult(!alreadyPresented);
      setPresentedResult(state.gameId);
      if (!alreadyPresented) {
        sessionStorage.setItem(key, "true");
        sound.play(state.winnerId === state.you.id ? "win" : "lose");
      }
    };
    if (!alreadyPresented && state.resultReason === "finished" && state.lastPlay) {
      resultTimerRef.current = window.setTimeout(
        present,
        window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 700 : 1500,
      );
    } else present();
  }, [sound, state]);

  useEffect(
    () => () => {
      if (resultTimerRef.current !== null) window.clearTimeout(resultTimerRef.current);
      senderRef.current?.dispose();
      socketRef.current?.disconnect();
      if (flightTimerRef.current) window.clearTimeout(flightTimerRef.current);
    },
    [],
  );

  const enter = (entered: PublicGameState) => {
    setNotice("");
    snapshotRef.current = entered;
    setState(entered);
    connect(entered.roomCode);
  };

  const act = async (command: GameCommand): Promise<ActionResult | undefined> => {
    if (!state || !socketRef.current || senderRef.current?.pending) return undefined;
    sound.unlock();
    if (!senderRef.current) {
      senderRef.current = createActionSender(socketRef.current, setPending, (nextNotice) => {
        setNotice(nextNotice?.message ?? "");
        setNoticeTone(nextNotice?.tone ?? "info");
        if (nextNotice?.tone === "error") rejectSoundRef.current("reject");
      });
    }
    setDrawBusy(command.type === "DRAW_CARD");
    const result = await senderRef.current.send(state, command);
    setDrawBusy(false);
    return result;
  };

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (state?.phase === "finished" || state?.phase === "expired") setNotice("");
  }, [state?.phase, notice]);

  if (loadingRoom)
    return (
      <main className="loading">
        <div className="brand-mark">
          <b>P</b>
        </div>
        <p>Reconnecting…</p>
      </main>
    );
  if (!state) return <Lobby initialCode={initialRoom ?? ""} onEnter={enter} />;

  const yourTurn = state.currentTurnPlayerId === state.you.id;
  const pendingSeven = state.pendingSevenChoiceFor === state.you.id;
  const canPickup = canPickUpPile(state);
  const noLegalCard =
    yourTurn &&
    state.you.hand.length > 0 &&
    !state.you.hand.some(({ rank }) => isLegal(state, rank));
  const holdingFinalPlay =
    state.phase === "finished" &&
    state.resultReason === "finished" &&
    state.lastPlay !== null &&
    presentedResult !== state.gameId;
  const selectedRank = state.you.hand.find(({ id }) => id === selected[0])?.rank;
  const sortedHand = [...state.you.hand].sort(
    (left, right) => handRankValue.get(left.rank)! - handRankValue.get(right.rank)!,
  );
  const canDraw = state.phase === "playing" && state.drawCount > 0 && state.you.handCount < 5;
  const sevenRestriction = restrictionForViewer(state);

  const toggleCard = (card: CardType) => {
    if (pending) return;
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
    setNoticeTone("info");
    setNotice("Invitation link copied.");
  };

  const leaveToLobby = () => {
    senderRef.current?.dispose();
    senderRef.current = null;
    setPending(false);
    setDrawBusy(false);
    socketRef.current?.disconnect();
    snapshotRef.current = null;
    window.history.pushState({}, "", "/");
    setState(null);
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

      {connection !== "connected" && state.phase !== "expired" && (
        <button
          className="connection-notice"
          role="status"
          onClick={() => socketRef.current?.connect()}
        >
          {connection === "offline" ? "Offline — tap to retry" : "Reconnecting…"}
        </button>
      )}
      <section className="table" aria-label="Palace card table">
        <div className="opponent-zone">
          <div className="player-label">
            <span className="avatar">{opponent?.name.slice(0, 1).toUpperCase() ?? "?"}</span>
            <div>
              <b>{opponent?.name ?? "Waiting…"}</b>
              <small>
                {opponent
                  ? `${opponent.handCount} card${opponent.handCount === 1 ? "" : "s"}`
                  : "Waiting for player"}
              </small>
            </div>
            {opponent && (
              <span
                className={`presence ${opponent.ready ? "presence--ready" : opponent.connected ? "" : "presence--away"}`}
              >
                {opponent.ready
                  ? "Ready"
                  : opponent.connected
                    ? "Online"
                    : state.phase === "lobby"
                      ? "Connecting…"
                      : "Disconnected"}
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
            <CardBack
              label={
                state.drawCount === 0
                  ? "Draw pile is empty"
                  : state.you.handCount >= 5
                    ? "Hand is full at five cards"
                    : `Draw one card, ${state.drawCount} remaining`
              }
              disabled={!canDraw || pending}
              onClick={() => void act({ type: "DRAW_CARD" })}
            />
            <span className="count-badge">{state.drawCount}</span>
            <small>{drawBusy ? "Drawing…" : "Draw pile"}</small>
          </div>
          <div className={`play-stack ${state.burnedCount ? "play-stack--active" : ""}`}>
            {holdingFinalPlay && state.lastPlay ? (
              <div className="final-play" data-final-play="true" aria-label="Final play">
                {state.lastPlay.cards.map((card, index, cards) => (
                  <div
                    key={card.id}
                    style={{
                      transform: `translateX(${(index - (cards.length - 1) / 2) * 10}px) rotate(${(index - (cards.length - 1) / 2) * 5}deg)`,
                    }}
                  >
                    <Card card={card} />
                  </div>
                ))}
                <small>{state.lastPlay.cards.length === 1 ? "Final card" : "Final cards"}</small>
              </div>
            ) : state.playPile.length ? (
              <Card card={state.playPile.at(-1)!} />
            ) : (
              <div className="pile-empty">
                <span>♛</span>
                <small>Play pile</small>
              </div>
            )}
            {!holdingFinalPlay && state.playPile.length > 1 && (
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
          <b>
            {state.phase === "finished"
              ? "Game over"
              : yourTurn
                ? "Your turn"
                : opponent
                  ? `${opponent.name}'s turn`
                  : "Waiting"}
          </b>
          <span>{state.message}</span>
          {sevenRestriction && (
            <em>{sevenRestriction === "higher" ? "↑ Higher than 7" : "↓ Lower than 7"}</em>
          )}
        </div>

        <div className="player-zone">
          <FieldRow
            selectedField={state.you.selectedField}
            hiddenField={state.you.hiddenField}
            owner="you"
            canSelectHidden={state.you.cardPhase === "hidden-field" && yourTurn}
            pending={pending}
            onHidden={(slotId) => void act({ type: "SELECT_HIDDEN_CARD", slotId })}
          />
          <div
            className={`hand ${state.phase === "setup" ? "hand--setup" : ""}`}
            aria-label="Your hand"
          >
            {sortedHand.map((card, index) => (
              <Card
                key={card.id}
                card={card}
                selected={selected.includes(card.id)}
                index={index}
                count={sortedHand.length}
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

      <SevenRestrictionAlert direction={sevenRestriction} />
      <FlightLayer flights={flights} />

      <div className={`action-dock ${state.phase === "finished" ? "action-dock--hidden" : ""}`}>
        {state.phase === "lobby" && (
          <>
            <div>
              <b>{opponent ? "Both seats claimed" : "Waiting for another player"}</b>
              <span>
                {opponent
                  ? "Both players must be ready."
                  : "Share the room code or invitation link."}
              </span>
            </div>
            <button
              className="button button--gold"
              disabled={pending || !opponent || state.you.ready}
              onClick={() => void act({ type: "READY" })}
            >
              {state.you.ready ? "Ready ✓" : "I'm ready"}
            </button>
          </>
        )}
        {state.phase === "setup" && !state.you.setupComplete && (
          <>
            <div>
              <b>Choose 3 cards</b>
              <span>
                {selected.length}/3 cards selected · they turn face down after confirmation
              </span>
            </div>
            <button
              className="button button--gold"
              disabled={pending || selected.length !== 3}
              onClick={() => void act({ type: "SELECT_SETUP_CARDS", cardIds: selected })}
            >
              Lock in cards
            </button>
          </>
        )}
        {state.phase === "setup" && state.you.setupComplete && (
          <div>
            <b>Selection saved</b>
            <span>Waiting for {opponent?.name ?? "the other player"}.</span>
          </div>
        )}
        {state.phase === "playing" && pendingSeven && (
          <>
            <div>
              <b>Choose a direction</b>
              <span>The other player must follow it.</span>
            </div>
            <div className="button-pair">
              <button
                className="button"
                disabled={pending}
                onClick={() => void act({ type: "CHOOSE_SEVEN_DIRECTION", direction: "lower" })}
              >
                ↓ Lower
              </button>
              <button
                className="button button--gold"
                disabled={pending}
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
                    ? noLegalCard
                      ? "No legal card"
                      : "Choose a card"
                    : "Waiting"}
              </b>
              <span>
                {yourTurn
                  ? noLegalCard
                    ? "Pick up the pile."
                    : "Power cards are always legal."
                  : `Waiting for ${opponent?.name ?? "the other player"}.`}
              </span>
            </div>
            <div className="button-pair">
              {canPickup && (
                <button
                  className="button button--danger"
                  disabled={pending}
                  onClick={() => void act({ type: "PICK_UP_PILE" })}
                >
                  Pick up pile
                </button>
              )}
              <button
                className="button button--gold"
                disabled={pending || !yourTurn || selected.length === 0}
                onClick={() => void act({ type: "PLAY_CARDS", cardIds: selected })}
              >
                Play {selected.length || "cards"}
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
      {state.phase === "finished" && presentedResult === state.gameId && (
        <ResultOverlay
          winner={state.winnerId === state.you.id}
          forfeit={state.resultReason === "forfeit"}
          turnCount={state.stats.turnCount}
          pickupCount={state.stats.pickups[state.you.id] ?? 0}
          rematchRequested={state.you.ready}
          pending={pending}
          animate={animateResult}
          onLobby={leaveToLobby}
          onRematch={() => void act({ type: "REQUEST_REMATCH" })}
        />
      )}
      {notice && (
        <button className={`toast toast--${noticeTone}`} onClick={() => setNotice("")} role="alert">
          {notice}
          <span>×</span>
        </button>
      )}
    </main>
  );
}
