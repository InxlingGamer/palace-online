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
  type ActionResult,
  type Card as CardType,
  type GameCommand,
  type FieldSlotView,
  type PublicGameState,
} from "@palace/shared";
import { createActionSender, shouldAcceptSnapshot } from "./action-sender";
import { Card, CardBack } from "./cards";
import { DeckPicker } from "./DeckPicker";
import { Hand } from "./hand";
import { lastMoveText, requirementText } from "./table-copy";
import { canPickUpPile } from "./pickup";
import { useSound } from "./audio";
import { ResultOverlay, SevenRestrictionAlert } from "./feedback";
import { restrictionForViewer } from "./restriction";
import { deriveVisualEvents } from "./visual-events";

import { api, currentBootId, rememberBootId, storedBootId, ServerWakingError } from "./api";
import { serverRestarted, wakingBanner, WAKING_DELAY_MS } from "./server-wake";

import {
  forgetRoom,
  loadSaved,
  markPresented,
  rememberRoom,
  savedName,
  savedRoom,
} from "./storage";
import { rejoinNotice } from "./rejoin";

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
  notice,
}: {
  initialCode: string;
  notice: string;
  onEnter: (state: PublicGameState) => void;
}) {
  const [name, setName] = useState(savedName);
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [waking, setWaking] = useState(false);

  const submit = async (mode: "create" | "join", event: FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    setWaking(false);
    try {
      const result = await api<{ roomCode: string; state: PublicGameState }>(
        mode === "create" ? "/api/rooms" : `/api/rooms/${code.toUpperCase()}/join`,
        { method: "POST", body: JSON.stringify({ name }) },
        () => setWaking(true),
      );
      rememberRoom(result.roomCode, name.trim());
      await rememberBootId(result.roomCode);
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
      <section className="hero">
        <div className="brand-mark" aria-hidden="true">
          <b>P</b>
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
          <DeckPicker />
          <button className="button button--gold" disabled={busy}>
            {busy
              ? waking
                ? "Waking the table…"
                : code
                  ? "Joining…"
                  : "Creating…"
              : code
                ? "Join room"
                : "Create room"}
          </button>
        </form>
        {busy && waking && (
          <p className="lobby-hint">
            The server naps after 15 quiet minutes. This can take about a minute.
          </p>
        )}
        {notice && (
          <p className="lobby-hint" role="status">
            {notice}
          </p>
        )}
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
  const pathRoom = useMemo(roomFromPath, []);
  const initialRoom = useMemo(
    () => pathRoom ?? (window.location.pathname === "/" ? savedRoom() : null),
    [pathRoom],
  );
  // Decided once at mount: a failed restore below forgets the saved room.
  const ownRoom = useMemo(
    () =>
      initialRoom !== null && (savedRoom() === initialRoom || storedBootId(initialRoom) !== null),
    [initialRoom],
  );
  const [state, setState] = useState<PublicGameState | null>(null);
  const [loadingRoom, setLoadingRoom] = useState(Boolean(initialRoom));
  const [loadingWaking, setLoadingWaking] = useState(false);
  const [restarted, setRestarted] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [unreachableSince, setUnreachableSince] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now);
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
    setRestarted(false);
    const unreachable = (retrying: boolean) => {
      setConnection(retrying ? "reconnecting" : "offline");
      setUnreachableSince((since) => since ?? Date.now());
    };
    setUnreachableSince(Date.now());
    setConnection("reconnecting");
    socket.on("connect", () => {
      setConnection("connected");
      setUnreachableSince(null);
    });
    socket.on("disconnect", (reason) => unreachable(reason !== "io server disconnect"));
    socket.on("connect_error", (error) => {
      unreachable(socket.active);
      // The server no longer knows this seat (restart, cleanup, or revoked session): stop retrying.
      if (error.message !== "Invalid room session") return;
      socket.disconnect();
      const stored = storedBootId(roomCode);
      // Decide the copy before showing the overlay so it never flips from "expired" to "closed".
      void currentBootId().then((bootId) => {
        if (socketRef.current !== socket) return;
        setRestarted(serverRestarted(stored, bootId));
        setState(
          (current) =>
            current && {
              ...current,
              phase: "expired",
              message: "This table is no longer available.",
            },
        );
      });
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
    let active = true;
    void api<{ state: PublicGameState }>(
      `/api/rooms/${initialRoom}/reconnect`,
      { method: "POST" },
      () => {
        if (active) setLoadingWaking(true);
      },
    )
      .then(async ({ state: restored }) => {
        await rememberBootId(initialRoom);
        if (!active) return;
        rememberRoom(initialRoom);
        window.history.replaceState({}, "", `/room/${initialRoom}`);
        snapshotRef.current = restored;
        setState(restored);
        connect(initialRoom);
      })
      .catch(async (reason: unknown) => {
        if (reason instanceof ServerWakingError) {
          if (active) setNotice(reason.message);
          return;
        }
        // An invite link to a table we never sat at keeps our saved table and needs no notice.
        if (savedRoom() === initialRoom) forgetRoom();
        if (!ownRoom) return;
        const stored = storedBootId(initialRoom);
        const current = await currentBootId();
        if (active) setNotice(rejoinNotice(stored, current));
      })
      .finally(() => {
        if (active) setLoadingRoom(false);
      });
    return () => {
      active = false;
    };
  }, [connect, initialRoom, ownRoom]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    if (unreachableSince === null) return;
    setNow(Date.now());
    const timer = window.setTimeout(
      () => setNow(Date.now()),
      Math.max(0, unreachableSince + WAKING_DELAY_MS + 1 - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [unreachableSince]);

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
          if (loadSaved(`palace-deal-${event.gameId}`)) continue;
          markPresented(`palace-deal-${event.gameId}`);
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
    const alreadyPresented = loadSaved(key) === "true";
    const present = () => {
      resultTimerRef.current = null;
      setAnimateResult(!alreadyPresented);
      setPresentedResult(state.gameId);
      if (!alreadyPresented) {
        markPresented(key);
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
    if (!notice || !state) return;
    const timer = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(timer);
  }, [notice, state]);

  useEffect(() => {
    if (state?.phase === "finished" || state?.phase === "expired") setNotice("");
  }, [state?.phase, notice]);

  if (loadingRoom)
    return (
      <main className="loading">
        <div className="brand-mark">
          <b>P</b>
        </div>
        <p role="status">{loadingWaking ? "Waking the table…" : "Reconnecting…"}</p>
      </main>
    );
  if (!state) return <Lobby initialCode={pathRoom ?? ""} onEnter={enter} notice={notice} />;

  const banner = wakingBanner(
    connection === "connected",
    unreachableSince,
    now,
    online,
    connection !== "offline",
  );

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
    forgetRoom();
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
          <b>Palace</b>
        </div>
        <button
          className="room-chip"
          onClick={() => void copyInvite()}
          aria-label={`Copy invitation for room ${state.roomCode}`}
        >
          <small>Room</small>
          <b>{state.roomCode}</b>
          <span className="copy-label">Copy invite link</span>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="9" y="9" width="12" height="12" rx="2" />
            <path d="M5 15H4V3h11v2" />
          </svg>
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
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M11 5 6 9H3v6h3l5 4V5Z" />
              {sound.muted ? (
                <path d="m16 9 6 6m0-6-6 6" />
              ) : (
                <>
                  <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                  <path d="M18.5 5.5a9 9 0 0 1 0 13" />
                </>
              )}
            </svg>
          </button>
        </div>
      </header>

      {banner !== "hidden" && state.phase !== "expired" && (
        <button
          className="connection-notice"
          role="status"
          onClick={() => socketRef.current?.connect()}
        >
          <span>
            {banner === "offline"
              ? "You're offline. Waiting for a connection…"
              : banner === "stopped"
                ? "Disconnected. Tap to reconnect"
                : banner === "waking"
                  ? "Waking the table…"
                  : "Reconnecting…"}
          </span>
          {banner === "waking" && (
            <small>The server naps after 15 quiet minutes. This can take about a minute.</small>
          )}
        </button>
      )}
      <section className="table" aria-label="Palace card table">
        <div className="opponent-zone">
          <div
            className={`player-label ${state.phase === "playing" && !yourTurn ? "seat--active" : ""}`}
          >
            <span className="avatar">{opponent?.name.slice(0, 1).toUpperCase() ?? "?"}</span>
            <div>
              <b>{opponent?.name ?? "Waiting…"}</b>
              {state.phase === "playing" && !yourTurn && (
                <span className="turn-badge">{opponent?.name.toUpperCase()}'S TURN</span>
              )}
              <small>{opponent ? `${opponent.handCount} in hand` : "Waiting for player"}</small>
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
          {lastMoveText(state) && <div className="last-move">{lastMoveText(state)}</div>}
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
              <div className="pile-fan">
                {state.playPile.slice(-4).map((card, index, cards) => (
                  <div
                    key={card.id}
                    style={{
                      transform: `translateX(${(index - (cards.length - 1) / 2) * 9}px) rotate(${(index - (cards.length - 1) / 2) * 6}deg)`,
                    }}
                  >
                    <Card card={card} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="pile-empty">
                <small>Play pile</small>
              </div>
            )}
            {!holdingFinalPlay && state.playPile.length > 1 && (
              <span className="count-badge">{state.playPile.length}</span>
            )}
          </div>
          <div className="burn-zone">
            <b>{state.burnedCount}</b>
            <small>BURNED</small>
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
          <span>{requirementText(state)}</span>
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
          <Hand count={sortedHand.length} setup={state.phase === "setup"} selectedIds={selected}>
            {sortedHand.map((card) => (
              <Card
                key={card.id}
                card={card}
                selected={selected.includes(card.id)}
                illegal={
                  state.phase === "playing" &&
                  yourTurn &&
                  !state.pendingSevenChoiceFor &&
                  !isLegal(state, card.rank)
                }
                onClick={() => toggleCard(card)}
              />
            ))}
          </Hand>
          <div
            className={`your-label ${state.phase === "playing" && yourTurn ? "seat--active" : ""}`}
          >
            <span className="avatar avatar--you">{state.you.name.slice(0, 1).toUpperCase()}</span>
            <div>
              <b>{state.you.name}</b>
              {state.phase === "playing" && yourTurn && (
                <span className="turn-badge">YOUR TURN</span>
              )}
              <small>{state.you.handCount} in hand</small>
            </div>
            <span className={`presence ${state.you.ready ? "presence--ready" : ""}`}>
              {state.you.ready ? "Ready" : state.you.connected ? "Online" : "Disconnected"}
            </span>
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
              <b>{restarted ? "Table closed" : "Room expired"}</b>
              <span>
                {restarted
                  ? "The server restarted while the table was quiet, so this game ended. Start a new table from home."
                  : "The table could not be restored."}
              </span>
            </div>
            <button className="button button--gold" onClick={leaveToLobby}>
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
