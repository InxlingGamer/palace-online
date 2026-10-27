import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { io as createClient, type Socket } from "socket.io-client";
import request from "supertest";
import type { ActionEnvelope, ActionResult, PublicGameState, GameCommand } from "@palace/shared";
import { createRuntime } from "../src/app";
import type { ServerConfig } from "../src/config";
import { RoomStore } from "../src/room-store";

const testConfig: ServerConfig = {
  NODE_ENV: "test",
  PORT: 3001,
  PUBLIC_APP_URL: "http://127.0.0.1:4173",
  ALLOWED_ORIGINS: "http://127.0.0.1:4173",
  RECONNECT_GRACE_MS: 50,
  ROOM_IDLE_TTL_MS: 60_000,
  SESSION_COOKIE_SECURE: false,
  TRUST_PROXY: false,
  ROOM_CREATE_LIMIT: 100,
  INVALID_ACTION_LIMIT: 10,
  TEST_SHUFFLE_SEED: "integration",
  allowedOrigins: ["http://127.0.0.1:4173"],
};

const runtimes: Array<ReturnType<typeof createRuntime>> = [];
const sockets: Socket[] = [];

afterEach(async () => {
  vi.useRealTimers();
  for (const socket of sockets.splice(0)) socket.disconnect();
  for (const runtime of runtimes.splice(0)) await runtime.close();
});

async function pair(overrides: Partial<ServerConfig> = {}) {
  const runtime = createRuntime({ ...testConfig, ...overrides });
  runtimes.push(runtime);
  await new Promise<void>((resolve) => runtime.httpServer.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(runtime.httpServer.address() as AddressInfo).port}`;
  const first = await request(runtime.app).post("/api/rooms").send({ name: "Ada" });
  const roomCode = first.body.roomCode as string;
  const second = await request(runtime.app)
    .post(`/api/rooms/${roomCode}/join`)
    .send({ name: "Ben" });
  const cookies = [cookieOf(first), cookieOf(second)];
  const clients = cookies.map((cookie) => {
    const client = createClient(url, {
      auth: { roomCode },
      transports: ["websocket"],
      autoConnect: false,
      reconnection: false,
      extraHeaders: { Cookie: cookie, Origin: testConfig.allowedOrigins[0]! },
    });
    sockets.push(client);
    return client;
  });
  await Promise.all(
    clients.map(
      (client) =>
        new Promise<void>((resolve, reject) => {
          client.once("state:snapshot", () => resolve());
          client.once("connect_error", reject);
          client.connect();
        }),
    ),
  );
  const [a, b] = clients as [Socket, Socket];
  const record = runtime.store.rooms.get(roomCode)!;
  const envelope = (command: GameCommand): ActionEnvelope => ({
    actionId: crypto.randomUUID(),
    expectedRevision: record.state.revision,
    expectedTurn: record.state.turnSeq,
    command,
  });
  const send = (client: Socket, command: GameCommand) =>
    client.timeout(2000).emitWithAck("game:action", envelope(command)) as Promise<ActionResult>;
  const start = async () => {
    expect((await send(a, { type: "READY" })).accepted).toBe(true);
    expect((await send(b, { type: "READY" })).accepted).toBe(true);
    for (const [index, client] of clients.entries()) {
      expect(
        (
          await send(client, {
            type: "SELECT_SETUP_CARDS",
            cardIds: record.state.players[index]!.hand.slice(0, 3).map((c) => c.id),
          })
        ).accepted,
      ).toBe(true);
    }
  };
  return { runtime, url, roomCode, cookies, a, b, clients, record, envelope, send, start };
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const reconnect = (socket: Socket) =>
  new Promise<void>((resolve, reject) => {
    socket.once("state:snapshot", () => resolve());
    socket.once("connect_error", reject);
    socket.connect();
  });

describe("multiplayer turn conflict policy", () => {
  it("rejects off-turn pickup without changing state", async () => {
    const p = await pair({ TEST_GAME_SCENARIO: "pickup-own-turn" });
    await p.start();
    const before = structuredClone(p.record.state);
    expect(await p.send(p.b, { type: "PICK_UP_PILE" })).toMatchObject({
      accepted: false,
      error: { code: "NOT_YOUR_TURN" },
    });
    expect(p.record.state).toEqual(before);
  });

  it("broadcasts own-turn pickup with a legal card and rejects an old turn sequence", async () => {
    const p = await pair({ TEST_GAME_SCENARIO: "pickup-own-turn" });
    await p.start();
    const nextTurn = p.record.state.players[1]!.id;
    const pile = [...p.record.state.playPile];
    const move = p.envelope({
      type: "PLAY_CARDS",
      cardIds: [p.record.state.players[0]!.hand[0]!.id],
    });
    const snapshots = Promise.all(
      p.clients.map(
        (client) =>
          new Promise<PublicGameState>((resolve) => client.once("state:snapshot", resolve)),
      ),
    );
    expect((await p.send(p.a, { type: "PICK_UP_PILE" })).accepted).toBe(true);
    const [a, b] = await snapshots;
    for (const view of [a!, b!]) {
      expect(view.currentTurnPlayerId).toBe(nextTurn);
      expect(view.playPile).toEqual([]);
    }
    expect(b!.opponent!.handCount).toBe(3);
    expect(a!.you.handCount).toBe(3);
    expect(a!.you.hand).toEqual(expect.arrayContaining(pile));
    expect(await p.a.emitWithAck("game:action", move)).toMatchObject({
      accepted: false,
      error: { code: "STALE_STATE" },
    });
  });

  it("broadcasts lastPlay to both players after a play", async () => {
    const p = await pair({ TEST_GAME_SCENARIO: "pickup-own-turn" });
    await p.start();
    const card = p.record.state.players[0]!.hand[0]!;
    const snapshots = Promise.all(
      p.clients.map(
        (client) =>
          new Promise<PublicGameState>((resolve) => client.once("state:snapshot", resolve)),
      ),
    );
    expect((await p.send(p.a, { type: "PLAY_CARDS", cardIds: [card.id] })).accepted).toBe(true);
    for (const view of await snapshots)
      expect(view.lastPlay).toEqual({ playerId: p.record.state.players[0]!.id, cards: [card] });
  });

  it("accepts simultaneous draws and double draws without stale conflicts", async () => {
    const p = await pair();
    await p.start();
    const draws = await Promise.all(
      p.clients.map(
        (client) =>
          client.emitWithAck(
            "game:action",
            p.envelope({ type: "DRAW_CARD" }),
          ) as Promise<ActionResult>,
      ),
    );
    expect(draws.every((result) => result.accepted)).toBe(true);
    const doubles = await Promise.all(
      [0, 1].map(
        () =>
          p.a.emitWithAck(
            "game:action",
            p.envelope({ type: "DRAW_CARD" }),
          ) as Promise<ActionResult>,
      ),
    );
    expect(doubles[0]!.accepted).toBe(true);
    expect(doubles[1]!.error?.code).toBe("HAND_FULL");
  });

  it("accepts a play concurrent with an opponent draw", async () => {
    const p = await pair();
    await p.start();
    const index = p.record.state.players.findIndex(
      (player) => player.id === p.record.state.currentTurnPlayerId,
    );
    const move = p.envelope({
      type: "PLAY_CARDS",
      cardIds: [p.record.state.players[index]!.hand[0]!.id],
    });
    const draw = p.envelope({ type: "DRAW_CARD" });
    const results = (await Promise.all([
      p.clients[1 - index]!.emitWithAck("game:action", draw),
      p.clients[index]!.emitWithAck("game:action", move),
    ])) as ActionResult[];
    expect(results.map((r) => r.accepted)).toEqual([true, true]);
  });

  it("ignores presence revisions for modern moves, detects real turn changes, and preserves legacy checks", async () => {
    const p = await pair({ RECONNECT_GRACE_MS: 1000 });
    await p.start();
    const index = p.record.state.players.findIndex(
      (player) => player.id === p.record.state.currentTurnPlayerId,
    );
    const player = p.record.state.players[index]!;
    const mover = p.clients[index]!;
    const other = p.clients[1 - index]!;
    const move = p.envelope({ type: "PLAY_CARDS", cardIds: [player.hand[0]!.id] });
    other.disconnect();
    await pause(10);
    await reconnect(other);
    const legacy = {
      actionId: crypto.randomUUID(),
      expectedRevision: move.expectedRevision,
      command: move.command,
    };
    expect(await mover.emitWithAck("game:action", legacy)).toMatchObject({
      accepted: false,
      error: { code: "STALE_STATE" },
    });
    const result = (await mover.emitWithAck("game:action", move)) as ActionResult;
    expect(result.accepted).toBe(true);
    expect(await mover.emitWithAck("game:action", move)).toEqual(result);
    expect(
      await mover.emitWithAck("game:action", { ...move, actionId: crypto.randomUUID() }),
    ).toMatchObject({ accepted: false, error: { code: "STALE_STATE" } });
    expect([...p.record.sessions.values()].every((s) => s.invalidActions.length === 0)).toBe(true);
  });

  it("does not broadcast or change either version for duplicate ready and rematch votes", async () => {
    const p = await pair({ TEST_GAME_SCENARIO: "finished-result" });
    await p.send(p.a, { type: "READY" });
    const changed = vi.fn();
    const original = p.runtime.store.onStateChange;
    p.runtime.store.onStateChange = changed;
    const before = structuredClone(p.record.state);
    expect((await p.send(p.a, { type: "READY" })).accepted).toBe(true);
    expect(p.record.state).toEqual(before);
    expect(changed).not.toHaveBeenCalled();
    p.runtime.store.onStateChange = original;
    await p.start();
    await p.send(p.a, { type: "REQUEST_REMATCH" });
    p.runtime.store.onStateChange = changed;
    changed.mockClear();
    const finished = structuredClone(p.record.state);
    expect((await p.send(p.a, { type: "REQUEST_REMATCH" })).accepted).toBe(true);
    expect(p.record.state).toEqual(finished);
    expect(changed).not.toHaveBeenCalled();
  });
});

describe("socket integrity and abuse limits", () => {
  it("survives non-function acknowledgements and reports live revisions for malformed messages", async () => {
    const p = await pair();
    p.a.emit("game:action", null, "not-a-function");
    p.a.emit("game:action", p.envelope({ type: "READY" }), "not-a-function");
    const malformed = (await p.a.emitWithAck("game:action", null)) as ActionResult;
    expect(malformed.error?.code).toBe("INVALID_INPUT");
    expect(malformed.revision).toBe(p.record.state.revision);
    expect(malformed.revision).toBeGreaterThan(4);
    expect((await p.send(p.b, { type: "READY" })).accepted).toBe(true);
    await request(p.runtime.app).get("/healthz").expect(200);
  });

  it("revokes a leaving session, disconnects all its sockets, and rejects its old cookie", async () => {
    const p = await pair();
    const token = p.cookies[0]!.split("=")[1]!;
    const gone = new Promise<void>((resolve) => p.a.once("disconnect", () => resolve()));
    expect((await p.send(p.a, { type: "LEAVE_ROOM" })).accepted).toBe(true);
    await gone;
    expect(p.record.sessions.has(token)).toBe(false);
    expect(p.runtime.store.authenticate(p.roomCode, token)).toBeNull();
    await request(p.runtime.app)
      .post(`/api/rooms/${p.roomCode}/reconnect`)
      .set("Cookie", p.cookies[0]!)
      .expect(401);
    const rejected = new Promise<string>((resolve) =>
      p.a.once("connect_error", (error) => resolve(error.message)),
    );
    p.a.connect();
    expect(await rejected).toBe("Invalid room session");
    await request(p.runtime.app).get("/healthz").expect(200);
    p.record.state.players = [];
    expect(p.runtime.store.authenticate(p.roomCode, [...p.record.sessions.keys()][0])).toBeNull();
  });

  it("limits malformed input while allowing normal play", async () => {
    const p = await pair();
    for (let i = 0; i < 4; i++) expect((await p.send(p.a, { type: "READY" })).accepted).toBe(true);
    const responses = (await Promise.all(
      Array.from({ length: 200 }, () => p.a.emitWithAck("game:action", null)),
    )) as ActionResult[];
    expect(responses.some((r) => r.error?.code === "RATE_LIMITED")).toBe(true);
    expect(responses.some((r) => r.error?.code === "INVALID_INPUT")).toBe(true);
    expect((await p.send(p.b, { type: "READY" })).accepted).toBe(true);
  });

  it("rejects extra sockets and disallowed origins, allowing listed and absent origins", async () => {
    const p = await pair();
    async function extra(origin?: string) {
      const socket = createClient(p.url, {
        auth: { roomCode: p.roomCode },
        transports: ["websocket"],
        autoConnect: false,
        reconnection: false,
        extraHeaders: { Cookie: p.cookies[0]!, ...(origin ? { Origin: origin } : {}) },
      });
      sockets.push(socket);
      const result = new Promise<boolean>((resolve) => {
        socket.once("state:snapshot", () => resolve(true));
        socket.once("connect_error", () => resolve(false));
      });
      socket.connect();
      return result;
    }
    expect(await extra("https://unlisted.example")).toBe(false);
    expect(await extra(testConfig.allowedOrigins[0])).toBe(true);
    expect(await extra()).toBe(true);
    expect(await extra()).toBe(true);
    expect(await extra()).toBe(true);
    expect(await extra()).toBe(false);
    await request(p.runtime.app).get("/healthz").expect(200);
  });
});

describe("reconnect lifecycle", () => {
  it("keeps a finished winner when the loser disconnects past grace", async () => {
    const p = await pair({ TEST_GAME_SCENARIO: "finished-result" });
    await p.start();
    const winner = p.record.state.winnerId;
    p.b.disconnect();
    await pause(90);
    expect(p.record.state).toMatchObject({ phase: "finished", winnerId: winner });
  });

  it("keeps a lobby when one player disconnects past grace", async () => {
    const p = await pair();
    p.b.disconnect();
    await pause(90);
    expect(p.record.state.phase).toBe("lobby");
  });

  it("starts a fresh forfeit deadline for the absent player when somebody returns", async () => {
    const p = await pair();
    await p.start();
    p.a.disconnect();
    p.b.disconnect();
    await pause(90);
    expect(p.record.state.phase).toBe("playing");
    await reconnect(p.b);
    expect(p.record.state.phase).toBe("playing");
    await pause(90);
    expect(p.record.state).toMatchObject({
      phase: "finished",
      winnerId: p.record.state.players[1]!.id,
      resultReason: "forfeit",
    });
  });

  it("keeps setup and expired phases unchanged on a single disconnect and refills the budget", async () => {
    vi.useFakeTimers();
    const store = new RoomStore(50, 1000, 10);
    const a = store.create("Ada");
    const b = store.join(a.roomCode, "Ben");
    if ("error" in b) throw new Error(b.error);
    store.connect(a.roomCode, a.token, "a");
    store.connect(a.roomCode, b.token, "b");
    const record = store.rooms.get(a.roomCode)!;
    for (const phase of ["setup", "expired"] as const) {
      record.state.phase = phase;
      const turn = record.state.turnSeq;
      store.disconnect(a.roomCode, b.token, "b");
      await vi.advanceTimersByTimeAsync(51);
      expect(record.state.phase).toBe(phase);
      expect(record.state.turnSeq).toBe(turn);
      store.connect(a.roomCode, b.token, "b");
    }
    for (let i = 0; i < 20; i++) expect(store.consumeAction(a.roomCode, a.token)).toBe(true);
    expect(store.consumeAction(a.roomCode, a.token)).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    for (let i = 0; i < 10; i++) expect(store.consumeAction(a.roomCode, a.token)).toBe(true);
    expect(store.consumeAction(a.roomCode, a.token)).toBe(false);
    store.close();
  });
});

describe("empty room lifecycle", () => {
  it("deletes a room that never establishes a player socket", async () => {
    vi.useFakeTimers();
    const store = new RoomStore(120_000, 600_000, 10);
    const membership = store.create("Ada");
    await vi.advanceTimersByTimeAsync(120_000);
    expect(store.rooms.has(membership.roomCode)).toBe(true);
    await vi.advanceTimersByTimeAsync(480_000);
    expect(store.rooms.has(membership.roomCode)).toBe(false);
    store.close();
  });

  it("deletes a room after every player has been disconnected for the idle TTL", async () => {
    vi.useFakeTimers();
    const store = new RoomStore(120_000, 600_000, 10);
    const membership = store.create("Ada");
    store.connect(membership.roomCode, membership.token, "socket-a");
    store.disconnect(membership.roomCode, membership.token, "socket-a");
    await vi.advanceTimersByTimeAsync(599_999);
    expect(store.rooms.has(membership.roomCode)).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(store.rooms.has(membership.roomCode)).toBe(false);
    store.close();
  });

  it("cancels empty-room deletion when a player reconnects", async () => {
    vi.useFakeTimers();
    const store = new RoomStore(120_000, 600_000, 10);
    const membership = store.create("Ada");
    store.connect(membership.roomCode, membership.token, "socket-a");
    store.disconnect(membership.roomCode, membership.token, "socket-a");
    await vi.advanceTimersByTimeAsync(60_000);
    store.connect(membership.roomCode, membership.token, "socket-b");
    await vi.advanceTimersByTimeAsync(120_000);
    expect(store.rooms.has(membership.roomCode)).toBe(true);
    store.close();
  });
});

const cookieOf = (response: request.Response): string => {
  const header = response.headers["set-cookie"];
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) throw new Error("No session cookie returned");
  return value.split(";", 1)[0]!;
};

describe("room API", () => {
  it("creates, joins, reconnects, and caps a room at two players", async () => {
    const runtime = createRuntime(testConfig);
    runtimes.push(runtime);
    const first = await request(runtime.app).post("/api/rooms").send({ name: "Ada" }).expect(201);
    const roomCode = first.body.roomCode as string;
    const cookie = cookieOf(first);
    expect(roomCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);

    await request(runtime.app)
      .post(`/api/rooms/${roomCode}/join`)
      .send({ name: "Ben" })
      .expect(200);
    await request(runtime.app).post(`/api/rooms/${roomCode}/join`).send({ name: "Cy" }).expect(409);
    const reconnected = await request(runtime.app)
      .post(`/api/rooms/${roomCode}/reconnect`)
      .set("Cookie", cookie)
      .expect(200);
    expect(reconnected.body.state.you.name).toBe("Ada");
    expect(reconnected.body.state.opponent.name).toBe("Ben");
  });

  it("rejects malformed room and display-name input", async () => {
    const runtime = createRuntime(testConfig);
    runtimes.push(runtime);
    await request(runtime.app).post("/api/rooms").send({ name: "" }).expect(400);
    await request(runtime.app).post("/api/rooms/NO/join").send({ name: "Ben" }).expect(400);
  });
});

describe("Socket.IO synchronization", () => {
  it("synchronizes two private projections and makes actions idempotent", async () => {
    const runtime = createRuntime(testConfig);
    runtimes.push(runtime);
    await new Promise<void>((resolve) => runtime.httpServer.listen(0, "127.0.0.1", resolve));
    const port = (runtime.httpServer.address() as AddressInfo).port;
    const serverUrl = `http://127.0.0.1:${port}`;

    const first = await request(runtime.app).post("/api/rooms").send({ name: "Ada" }).expect(201);
    const roomCode = first.body.roomCode as string;
    const second = await request(runtime.app)
      .post(`/api/rooms/${roomCode}/join`)
      .send({ name: "Ben" })
      .expect(200);

    const a = createClient(serverUrl, {
      auth: { roomCode },
      extraHeaders: { Cookie: cookieOf(first), Origin: "http://127.0.0.1:4173" },
      transports: ["websocket"],
    });
    const b = createClient(serverUrl, {
      auth: { roomCode },
      extraHeaders: { Cookie: cookieOf(second), Origin: "http://127.0.0.1:4173" },
      transports: ["websocket"],
    });
    sockets.push(a, b);

    // Listen on both sockets before awaiting either; a snapshot can arrive before a late listener.
    const [stateA, stateB] = await Promise.all([
      new Promise<PublicGameState>((resolve) => a.once("state:snapshot", resolve)),
      new Promise<PublicGameState>((resolve) => b.once("state:snapshot", resolve)),
    ]);
    expect(stateA.you.name).toBe("Ada");
    expect(stateB.you.name).toBe("Ben");
    expect(stateA.opponent?.handCount).toBe(0);

    const envelope: ActionEnvelope = {
      actionId: crypto.randomUUID(),
      expectedRevision: stateA.revision,
      command: { type: "READY" },
    };
    const accepted = (await a.emitWithAck("game:action", envelope)) as ActionResult;
    const duplicate = (await a.emitWithAck("game:action", envelope)) as ActionResult;
    expect(accepted.accepted).toBe(true);
    expect(duplicate).toEqual(accepted);

    const stale = (await b.emitWithAck("game:action", {
      actionId: crypto.randomUUID(),
      expectedRevision: stateB.revision,
      command: { type: "READY" },
    } satisfies ActionEnvelope)) as ActionResult;
    expect(stale).toMatchObject({ accepted: true });
  });
});
