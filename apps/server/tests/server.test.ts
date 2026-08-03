import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { io as createClient, type Socket } from "socket.io-client";
import request from "supertest";
import type { ActionEnvelope, ActionResult, PublicGameState } from "@palace/shared";
import { createRuntime } from "../src/app";
import type { ServerConfig } from "../src/config";

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
  for (const socket of sockets.splice(0)) socket.disconnect();
  for (const runtime of runtimes.splice(0)) await runtime.close();
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

    const stateA = await new Promise<PublicGameState>((resolve) =>
      a.once("state:snapshot", resolve),
    );
    const stateB = await new Promise<PublicGameState>((resolve) =>
      b.once("state:snapshot", resolve),
    );
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
    expect(stale).toMatchObject({ accepted: false, error: { code: "STALE_STATE" } });
  });
});
