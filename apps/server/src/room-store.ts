import { randomBytes, randomInt, randomUUID } from "node:crypto";
import {
  addPlayer,
  applyCommand,
  createLobby,
  finishByForfeit,
  projectState,
  setConnected,
  type GameState,
  type RandomInt,
} from "@palace/game-engine";
import {
  RULES,
  type ActionEnvelope,
  type ActionResult,
  type PublicGameState,
} from "@palace/shared";
import { applyTestScenario, type TestGameScenario } from "./test-scenarios.js";

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

interface Session {
  playerId: string;
  actionResults: Map<string, ActionResult>;
  invalidActions: number[];
  actionTokens: number;
  actionRefilledAt: number;
  socketIds: Set<string>;
  disconnectTimer: NodeJS.Timeout | null;
}

interface RoomRecord {
  state: GameState;
  sessions: Map<string, Session>;
  lastActivityAt: number;
  emptyTimer: NodeJS.Timeout | null;
}

export interface Membership {
  roomCode: string;
  token: string;
  playerId: string;
  state: PublicGameState;
}

export class RoomStore {
  readonly rooms = new Map<string, RoomRecord>();
  onSessionRevoked: (roomCode: string, playerId: string) => void = () => undefined;
  onStateChange: (roomCode: string) => void = () => undefined;

  constructor(
    private readonly reconnectGraceMs: number,
    private readonly roomIdleTtlMs: number,
    private readonly invalidActionLimit: number,
    private readonly random: RandomInt = randomInt,
    private readonly testScenario?: TestGameScenario,
  ) {}

  private roomCode(): string {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      let code = "";
      for (let index = 0; index < 6; index += 1)
        code += ROOM_ALPHABET[randomInt(ROOM_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
    throw new Error("Unable to allocate a room code.");
  }

  private token(): string {
    return randomBytes(32).toString("base64url");
  }

  create(name: string): Membership {
    const roomCode = this.roomCode();
    const token = this.token();
    const playerId = randomUUID();
    const added = addPlayer(createLobby(roomCode), { id: playerId, name });
    if (!added.ok) throw new Error(added.message);
    const record: RoomRecord = {
      state: added.state,
      sessions: new Map([
        [
          token,
          {
            playerId,
            actionResults: new Map(),
            invalidActions: [],
            actionTokens: RULES.actionBurstCapacity,
            actionRefilledAt: Date.now(),
            socketIds: new Set(),
            disconnectTimer: null,
          },
        ],
      ]),
      lastActivityAt: Date.now(),
      emptyTimer: null,
    };
    this.rooms.set(roomCode, record);
    this.scheduleEmptyDeletion(roomCode, record);
    return { roomCode, token, playerId, state: projectState(record.state, playerId) };
  }

  join(roomCode: string, name: string): Membership | { error: "ROOM_NOT_FOUND" | "ROOM_FULL" } {
    const record = this.rooms.get(roomCode);
    if (!record || record.state.phase === "expired") return { error: "ROOM_NOT_FOUND" };
    if (record.state.players.length >= 2 || record.state.phase !== "lobby")
      return { error: "ROOM_FULL" };
    const token = this.token();
    const playerId = randomUUID();
    const added = addPlayer(record.state, { id: playerId, name });
    if (!added.ok) return { error: added.code === "ROOM_FULL" ? "ROOM_FULL" : "ROOM_NOT_FOUND" };
    record.state = added.state;
    record.sessions.set(token, {
      playerId,
      actionResults: new Map(),
      invalidActions: [],
      actionTokens: RULES.actionBurstCapacity,
      actionRefilledAt: Date.now(),
      socketIds: new Set(),
      disconnectTimer: null,
    });
    record.lastActivityAt = Date.now();
    if (record.emptyTimer) clearTimeout(record.emptyTimer);
    record.emptyTimer = null;
    this.scheduleEmptyDeletion(roomCode, record);
    this.onStateChange(roomCode);
    return { roomCode, token, playerId, state: projectState(record.state, playerId) };
  }

  authenticate(roomCode: string, token: string | undefined): Membership | null {
    if (!token) return null;
    const record = this.rooms.get(roomCode);
    const session = record?.sessions.get(token);
    if (!record || !session || !record.state.players.some(({ id }) => id === session.playerId))
      return null;
    return {
      roomCode,
      token,
      playerId: session.playerId,
      state: projectState(record.state, session.playerId),
    };
  }

  connect(roomCode: string, token: string, socketId: string): Membership | null {
    const membership = this.authenticate(roomCode, token);
    if (!membership || !this.canConnect(roomCode, token)) return null;
    const record = this.rooms.get(roomCode)!;
    if (record.emptyTimer) clearTimeout(record.emptyTimer);
    record.emptyTimer = null;
    const session = record.sessions.get(token)!;
    if (session.disconnectTimer) clearTimeout(session.disconnectTimer);
    session.disconnectTimer = null;
    session.socketIds.add(socketId);
    const player = record.state.players.find(({ id }) => id === session.playerId);
    if (player && !player.connected)
      record.state = setConnected(record.state, session.playerId, true);
    if (record.state.phase === "playing") {
      for (const [otherToken, other] of record.sessions) {
        if (otherToken !== token && other.socketIds.size === 0 && !other.disconnectTimer)
          this.scheduleForfeit(roomCode, otherToken, other);
      }
    }
    record.lastActivityAt = Date.now();
    this.onStateChange(roomCode);
    return { ...membership, state: projectState(record.state, session.playerId) };
  }

  disconnect(roomCode: string, token: string, socketId: string): void {
    const record = this.rooms.get(roomCode);
    const session = record?.sessions.get(token);
    if (!record || !session) return;
    session.socketIds.delete(socketId);
    if (session.socketIds.size > 0) return;
    record.state = setConnected(record.state, session.playerId, false);
    record.lastActivityAt = Date.now();
    this.onStateChange(roomCode);
    if (!session.disconnectTimer) this.scheduleForfeit(roomCode, token, session);
    this.scheduleEmptyDeletion(roomCode, record);
  }

  canConnect(roomCode: string, token: string): boolean {
    const session = this.rooms.get(roomCode)?.sessions.get(token);
    return Boolean(session && session.socketIds.size < RULES.maxSocketsPerSession);
  }

  consumeAction(roomCode: string, token: string): boolean {
    const session = this.rooms.get(roomCode)?.sessions.get(token);
    if (!session) return false;
    const now = Date.now();
    session.actionTokens = Math.min(
      RULES.actionBurstCapacity,
      session.actionTokens +
        ((now - session.actionRefilledAt) / 1000) * RULES.actionRefillPerSecond,
    );
    session.actionRefilledAt = now;
    if (session.actionTokens < 1) return false;
    session.actionTokens -= 1;
    return true;
  }

  private scheduleForfeit(roomCode: string, token: string, session: Session): void {
    session.disconnectTimer = setTimeout(() => {
      session.disconnectTimer = null;
      const latest = this.rooms.get(roomCode);
      if (!latest || latest.sessions.get(token) !== session || session.socketIds.size > 0) return;
      if (latest.state.phase !== "playing" || this.connectedSocketCount(latest) === 0) return;
      latest.state = finishByForfeit(latest.state, session.playerId);
      this.onStateChange(roomCode);
    }, this.reconnectGraceMs);
  }

  private connectedSocketCount(record: RoomRecord): number {
    let count = 0;
    for (const session of record.sessions.values()) count += session.socketIds.size;
    return count;
  }

  private scheduleEmptyDeletion(roomCode: string, record: RoomRecord): void {
    if (record.emptyTimer || this.connectedSocketCount(record) > 0) return;
    record.emptyTimer = setTimeout(() => {
      const latest = this.rooms.get(roomCode);
      if (!latest || this.connectedSocketCount(latest) > 0) return;
      this.clearTimers(latest);
      this.rooms.delete(roomCode);
    }, this.roomIdleTtlMs);
  }

  private clearTimers(record: RoomRecord): void {
    if (record.emptyTimer) clearTimeout(record.emptyTimer);
    record.emptyTimer = null;
    for (const session of record.sessions.values()) {
      if (session.disconnectTimer) clearTimeout(session.disconnectTimer);
      session.disconnectTimer = null;
    }
  }

  apply(roomCode: string, token: string, envelope: ActionEnvelope): ActionResult {
    const record = this.rooms.get(roomCode);
    const session = record?.sessions.get(token);
    if (!record || !session)
      return {
        actionId: envelope.actionId,
        accepted: false,
        revision: 0,
        error: { code: "NOT_A_MEMBER", message: "Your room session is no longer valid." },
      };
    const previous = session.actionResults.get(envelope.actionId);
    if (previous) return previous;

    const now = Date.now();
    session.invalidActions = session.invalidActions.filter((time) => now - time < 60_000);
    if (session.invalidActions.length >= this.invalidActionLimit) {
      return {
        actionId: envelope.actionId,
        accepted: false,
        revision: record.state.revision,
        error: { code: "RATE_LIMITED", message: "Too many rejected actions. Please slow down." },
      };
    }
    const turnCommand = [
      "PLAY_CARDS",
      "PICK_UP_PILE",
      "CHOOSE_SEVEN_DIRECTION",
      "SELECT_HIDDEN_CARD",
    ].includes(envelope.command.type);
    if (
      turnCommand &&
      (envelope.expectedTurn === undefined
        ? envelope.expectedRevision !== record.state.revision
        : envelope.expectedTurn !== record.state.turnSeq)
    ) {
      const result: ActionResult = {
        actionId: envelope.actionId,
        accepted: false,
        revision: record.state.revision,
        error: {
          code: "STALE_STATE",
          message: "The table changed before your move arrived. Please try again.",
        },
      };
      this.remember(session, result);
      return result;
    }
    const applied = applyCommand(record.state, session.playerId, envelope.command, this.random);
    if (!applied.ok) {
      session.invalidActions.push(now);
      const result: ActionResult = {
        actionId: envelope.actionId,
        accepted: false,
        revision: record.state.revision,
        error: { code: applied.code, message: applied.message },
      };
      this.remember(session, result);
      return result;
    }
    const enteredPlaying = record.state.phase === "setup" && applied.state.phase === "playing";
    record.state =
      enteredPlaying && this.testScenario
        ? applyTestScenario(applied.state, this.testScenario)
        : applied.state;
    record.lastActivityAt = now;
    const result: ActionResult = {
      actionId: envelope.actionId,
      accepted: true,
      revision: record.state.revision,
    };
    this.remember(session, result);
    if (envelope.command.type === "LEAVE_ROOM") {
      if (session.disconnectTimer) clearTimeout(session.disconnectTimer);
      session.disconnectTimer = null;
      record.sessions.delete(token);
      this.scheduleEmptyDeletion(roomCode, record);
      // Flush the acknowledgement before closing the leaving player's transport.
      queueMicrotask(() => {
        this.onSessionRevoked(roomCode, session.playerId);
        this.onStateChange(roomCode);
      });
    } else if (applied.changed !== false) {
      this.onStateChange(roomCode);
    }
    return result;
  }

  private remember(session: Session, result: ActionResult): void {
    session.actionResults.set(result.actionId, result);
    while (session.actionResults.size > RULES.actionCacheSize) {
      const oldest = session.actionResults.keys().next().value;
      if (oldest) session.actionResults.delete(oldest);
      else break;
    }
  }

  projections(roomCode: string): Array<{ playerId: string; state: PublicGameState }> {
    const record = this.rooms.get(roomCode);
    if (!record) return [];
    return record.state.players.map(({ id }) => ({
      playerId: id,
      state: projectState(record.state, id),
    }));
  }

  cleanup(now = Date.now()): void {
    for (const [code, record] of this.rooms) {
      if (
        now - record.lastActivityAt <= this.roomIdleTtlMs ||
        this.connectedSocketCount(record) > 0
      )
        continue;
      this.clearTimers(record);
      this.rooms.delete(code);
    }
  }

  close(): void {
    for (const record of this.rooms.values()) {
      this.clearTimers(record);
    }
  }
}

export function seededRandom(seedText: string): RandomInt {
  let seed = [...seedText].reduce(
    (value, character) => (value * 31 + character.charCodeAt(0)) >>> 0,
    1,
  );
  return (maximumExclusive) => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed % maximumExclusive;
  };
}
