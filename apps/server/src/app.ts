import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import path from "node:path";
import { parse as parseCookie } from "cookie";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { Server } from "socket.io";
import { actionEnvelopeSchema, displayNameSchema, roomCodeSchema } from "@palace/shared";
import type { ServerConfig } from "./config.js";
import { RoomStore, seededRandom } from "./room-store.js";

const bootId = randomUUID();

const COOKIE_NAME = "palace_session";

export function createRuntime(config: ServerConfig) {
  const app = express();
  if (config.TRUST_PROXY) app.set("trust proxy", 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || config.allowedOrigins.includes(origin)) callback(null, true);
        else callback(new Error("Origin not allowed"));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "16kb" }));
  app.use(cookieParser());

  const random =
    config.NODE_ENV === "test" && config.TEST_SHUFFLE_SEED
      ? seededRandom(config.TEST_SHUFFLE_SEED)
      : undefined;
  const store = new RoomStore(
    config.RECONNECT_GRACE_MS,
    config.ROOM_IDLE_TTL_MS,
    config.INVALID_ACTION_LIMIT,
    random,
    config.NODE_ENV === "test" ? config.TEST_GAME_SCENARIO : undefined,
  );
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: config.allowedOrigins, credentials: true },
    transports: ["websocket", "polling"],
    allowRequest(request, callback) {
      const origin = request.headers.origin;
      callback(null, !origin || config.allowedOrigins.includes(origin));
    },
  });

  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: config.SESSION_COOKIE_SECURE,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  };

  const createLimiter = rateLimit({
    windowMs: 60_000,
    limit: config.ROOM_CREATE_LIMIT,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.get("/healthz", (_request, response) => {
    response.set("Cache-Control", "no-store");
    response.json({ status: "ok", uptime: Math.round(process.uptime()), bootId });
  });

  app.post("/api/rooms", createLimiter, (request, response) => {
    const parsed = displayNameSchema.safeParse(request.body?.name);
    if (!parsed.success) {
      response
        .status(400)
        .json({ error: { code: "INVALID_INPUT", message: "Enter a display name." } });
      return;
    }
    const membership = store.create(parsed.data);
    response.cookie(COOKIE_NAME, membership.token, cookieOptions);
    response.status(201).json({ roomCode: membership.roomCode, state: membership.state });
  });

  app.post("/api/rooms/:roomCode/join", (request, response) => {
    const code = roomCodeSchema.safeParse(request.params.roomCode);
    const name = displayNameSchema.safeParse(request.body?.name);
    if (!code.success || !name.success) {
      response
        .status(400)
        .json({ error: { code: "INVALID_INPUT", message: "Check the room code and name." } });
      return;
    }
    const membership = store.join(code.data, name.data);
    if ("error" in membership) {
      const full = membership.error === "ROOM_FULL";
      response.status(full ? 409 : 404).json({
        error: { code: membership.error, message: full ? "This room is full." : "Room not found." },
      });
      return;
    }
    response.cookie(COOKIE_NAME, membership.token, cookieOptions);
    response.json({ roomCode: membership.roomCode, state: membership.state });
  });

  app.post("/api/rooms/:roomCode/reconnect", (request, response) => {
    const code = roomCodeSchema.safeParse(request.params.roomCode);
    const membership = code.success
      ? store.authenticate(code.data, request.cookies[COOKIE_NAME] as string)
      : null;
    if (!membership) {
      response.status(401).json({
        error: { code: "NOT_A_MEMBER", message: "This saved room session is no longer valid." },
      });
      return;
    }
    response.json({ roomCode: membership.roomCode, state: membership.state });
  });

  io.use((socket, next) => {
    try {
      const code = roomCodeSchema.safeParse(socket.handshake.auth.roomCode);
      const token = parseCookie(socket.handshake.headers.cookie ?? "")[COOKIE_NAME];
      if (
        !code.success ||
        !token ||
        !store.authenticate(code.data, token) ||
        !store.canConnect(code.data, token)
      )
        return next(new Error("Invalid room session"));
      socket.data.roomCode = code.data;
      socket.data.token = token;
      next();
    } catch {
      next(new Error("Invalid room session"));
    }
  });

  const emitRoom = (roomCode: string) => {
    for (const projection of store.projections(roomCode)) {
      io.to(`${roomCode}:${projection.playerId}`).emit("state:snapshot", projection.state);
    }
  };
  store.onStateChange = emitRoom;
  store.onSessionRevoked = (roomCode, playerId) => {
    io.in(`${roomCode}:${playerId}`).disconnectSockets(true);
  };

  io.on("connection", (socket) => {
    try {
      const roomCode = socket.data.roomCode as string;
      const token = socket.data.token as string;
      const membership = store.connect(roomCode, token, socket.id);
      if (!membership) return socket.disconnect(true);
      socket.on("disconnect", () => store.disconnect(roomCode, token, socket.id));
      void socket.join(`${roomCode}:${membership.playerId}`);
      emitRoom(roomCode);

      socket.on("game:action", (untrusted, acknowledge?: unknown) => {
        const ack = (result: unknown) => {
          if (typeof acknowledge === "function") acknowledge(result);
        };
        try {
          const revision = store.rooms.get(roomCode)?.state.revision ?? 0;
          const actionId = typeof untrusted?.actionId === "string" ? untrusted.actionId : "invalid";
          if (!store.consumeAction(roomCode, token)) {
            ack({
              actionId,
              accepted: false,
              revision,
              error: { code: "RATE_LIMITED", message: "Too many actions. Please slow down." },
            });
            return;
          }
          const parsed = actionEnvelopeSchema.safeParse(untrusted);
          if (!parsed.success) {
            ack({
              actionId,
              accepted: false,
              revision,
              error: { code: "INVALID_INPUT", message: "The action was malformed." },
            });
            return;
          }
          const result = store.apply(roomCode, token, parsed.data);
          ack(result);
          if (!result.accepted && result.error?.code === "STALE_STATE") emitRoom(roomCode);
        } catch (error) {
          console.error(error instanceof Error ? error.message : "Action processing failed");
          ack({
            accepted: false,
            error: { code: "INVALID_INPUT", message: "The action could not be processed." },
          });
        }
      });
    } catch {
      socket.disconnect(true);
    }
  });

  if (config.NODE_ENV === "production") {
    const clientDirectory = path.resolve(process.cwd(), "apps/client/dist");
    app.use(express.static(clientDirectory, { maxAge: "1h", index: false }));
    app.get("/{*path}", (_request, response) =>
      response.sendFile(path.join(clientDirectory, "index.html")),
    );
  }

  app.use(
    (
      error: Error,
      _request: express.Request,
      response: express.Response,
      _next: express.NextFunction,
    ) => {
      void _next;
      if (config.NODE_ENV !== "test") console.error(error.message);
      response
        .status(500)
        .json({ error: { code: "SERVER_ERROR", message: "Something went wrong." } });
    },
  );

  const cleanupInterval = setInterval(() => store.cleanup(), 60_000);
  cleanupInterval.unref();

  return {
    app,
    httpServer,
    io,
    store,
    async close() {
      clearInterval(cleanupInterval);
      store.close();
      await new Promise<void>((resolve) => io.close(() => resolve()));
      if (httpServer.listening)
        await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}
