# Palace Online architecture

## Runtime topology

The production artifact is one persistent Node.js process. Express serves the compiled React application, REST room/session endpoints, and `/healthz`; Socket.IO shares the same HTTP server. Same-origin deployment keeps the HttpOnly player cookie and WebSocket policy simple. Development runs Vite separately and proxies `/api` and `/socket.io` to Node.

```text
React intention → validated socket envelope → RoomStore → pure engine
       ↑                                                  ↓
player-specific snapshot ← Socket.IO room ← privacy projector
```

## Responsibilities and state

The client owns presentation-only state: selected hand IDs, audio preference, animation, connection feedback, and the latest public snapshot. It never shuffles, draws, advances a turn, or decides the result.

The server's room record contains the complete `GameState`, opaque session mappings, action-result caches, active socket IDs, invalid-action timestamps, and reconnect timers. `packages/game-engine` owns deck creation, setup, legality, effects, phases, statistics, and projection. Engine transitions clone their input and return either a new state or a stable public error code.

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
  command:
    | { type: "READY" }
    | { type: "SELECT_SETUP_CARDS"; cardIds: string[] }
    | { type: "PLAY_CARDS"; cardIds: string[] }
    | { type: "PICK_UP_PILE" }
    | { type: "CHOOSE_SEVEN_DIRECTION"; direction: "higher" | "lower" }
    | { type: "SELECT_HIDDEN_CARD"; slotId: string }
    | { type: "REQUEST_REMATCH" }
    | { type: "LEAVE_ROOM" };
}
```

The acknowledgement contains `actionId`, `accepted`, the authoritative revision, and a sanitized error when rejected. Accepted mutations broadcast `state:snapshot` separately to each player's private Socket.IO target. A repeated action ID returns its cached acknowledgement without applying twice. A mismatched revision returns `STALE_STATE` and triggers a fresh snapshot.

## Reconnection and lifecycle

The random 256-bit session token, not the room code, identifies a seat. Multiple sockets for one credential are counted so closing one tab does not falsely disconnect another. When the last socket leaves, the player's public presence changes and a 120-second timer begins. Reconnection cancels that timer and restores the same projection. A play-phase timeout becomes a forfeit; lobby/setup timeout expires the room. Idle records are cleaned periodically.

## Security boundaries

REST bodies, room codes, names, and every command are schema-validated. Room creation is IP-limited; rejected socket actions are session-throttled. Origin allowlists protect browser entry points, production cookies require HTTPS when configured, Helmet sets baseline headers, and error responses never include stack traces or internal state. Secrets belong only in runtime environment variables.

Rooms are intentionally process-local for version one. Safe horizontal scaling requires sticky WebSocket routing and a shared atomic room store/Socket.IO adapter; simply adding replicas would split authoritative state.
