# Palace Online architecture

## Runtime topology

The production artifact is one persistent Node.js process. Express serves the compiled React application, REST room/session endpoints, and `/healthz`; Socket.IO shares the same HTTP server. Same-origin deployment keeps the HttpOnly player cookie and WebSocket policy simple. Development runs Vite separately and proxies `/api` and `/socket.io` to Node.

```text
React intention → validated socket envelope → RoomStore → pure engine
       ↑                                                  ↓
player-specific snapshot ← Socket.IO room ← privacy projector
```

## Responsibilities and state

The client owns presentation-only state: selected hand IDs, audio preference, animation, connection feedback, and the latest public snapshot. It may request a draw, but it never chooses the drawn card, shuffles, advances a turn, or decides the result.

The server's room record contains the complete `GameState`, opaque session mappings, action-result caches, active socket IDs, invalid-action timestamps, reconnect timers, and an empty-room timer. `packages/game-engine` owns deck creation, setup, legality, effects, phases, statistics, and projection. Engine transitions clone their input and return either a new state or a stable public error code.

Each player projection includes that player's visible hand, public pile cards, counts, field slot occupancy, connection state, and game metadata. Opponent hand values and all face-down field values are excluded structurally rather than hidden only in the interface.

## API and socket protocol

- `POST /api/rooms { name }` creates a room and player session.
- `POST /api/rooms/:code/join { name }` claims the second seat.
- `POST /api/rooms/:code/reconnect` validates the current cookie and returns a fresh snapshot.
- `GET /healthz` reports process availability.

Socket authentication carries the room code while the session credential remains in the HttpOnly cookie. The client emits `game:action` with:

```ts
{
  actionId: string;       // UUID, unique per intention
  expectedRevision: number;
  expectedTurn?: number;  // turnSeq from the latest snapshot
  command:
    | { type: "READY" }
    | { type: "SELECT_SETUP_CARDS"; cardIds: string[] }
    | { type: "DRAW_CARD" }
    | { type: "PLAY_CARDS"; cardIds: string[] }
    | { type: "PICK_UP_PILE" }
    | { type: "CHOOSE_SEVEN_DIRECTION"; direction: "higher" | "lower" }
    | { type: "SELECT_HIDDEN_CARD"; slotId: string }
    | { type: "REQUEST_REMATCH" }
    | { type: "LEAVE_ROOM" };
}
```

The acknowledgement contains `actionId`, `accepted`, the authoritative revision, and a sanitized error when rejected. Accepted mutations broadcast `state:snapshot` separately to each player's private Socket.IO target. A repeated action ID returns its cached acknowledgement without applying twice. Play, pickup, seven-direction, and hidden-card commands compare `expectedTurn` with `turnSeq`; legacy envelopes without it compare `expectedRevision` strictly. Other commands rely on authoritative engine validation without a version precondition. A conflict returns `STALE_STATE` and triggers a fresh snapshot, without counting as an invalid action. The turn sequence advances once per accepted table move or phase transition, including deals, victory, forfeit, and expiry; draws, presence changes, and partial ready/setup/rematch votes do not advance it. Repeated ready/rematch votes are accepted without changing state or broadcasting.

The client allows one pending action and uses an eight-second acknowledgement timeout. After a transport failure it waits up to 30 seconds for reconnection, then retries the same envelope once so the action cache prevents double application. Connection and stale-table notices are neutral; notices dismiss after four seconds and clear on results. Older revisions for the current room are ignored.

## Reconnection and lifecycle

The random 256-bit session token, not the room code, identifies a seat. A REST-created seat remains disconnected until its first socket connects. Up to five sockets for one credential are counted so closing one tab does not falsely disconnect another. A disconnected player gets a 10-minute grace (`RECONNECT_GRACE_MS`); timeout forfeits only during play and only when another socket remains connected. Lobby, setup, finished, and expired games are unchanged by that timeout. If both players disconnect and a deadline elapses while nobody is present, the next connection gives any absent player without a pending timer a fresh full grace.

When every socket has left, the complete room record is retained for the configured room idle TTL, rather than the reconnect grace. A connection cancels empty-room deletion. Idle records are also cleaned periodically. Leaving a lobby revokes the session, clears its timers, disconnects its sockets, and then broadcasts the remaining seats; the old cookie cannot reconnect.

## Security boundaries

REST bodies, room codes, names, and every command are schema-validated. Room creation is IP-limited; rejected socket actions are session-throttled. Every socket action, including malformed messages and duplicate IDs, also consumes a session token bucket with capacity 20 and refill 10 per second, before validation. Excess messages return `RATE_LIMITED`. Socket handshakes reject an unlisted Origin; clients without an Origin still require a valid session. Origin allowlists protect browser entry points, production cookies require HTTPS when configured, Helmet sets baseline headers, and error responses never include stack traces or internal state. Secrets belong only in runtime environment variables.

Rooms are intentionally process-local for version one. Safe horizontal scaling requires sticky WebSocket routing and a shared atomic room store/Socket.IO adapter; simply adding replicas would split authoritative state.
