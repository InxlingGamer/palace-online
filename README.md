# Palace Online

Palace Online is a polished, server-authoritative, two-player implementation of the Palace card game. Create a private six-character room, invite one rival, arrange your face-down field, and race through your hand, remembered cards, and blind cards. The interface pairs an original neon retro-casino aesthetic—chunky type, CRT texture, tactile cards, and saturated color—with mouse, keyboard, and touch layouts for desktop and iPhone-sized screens.

> Screenshot placeholders: add final desktop and iPhone captures under `docs/screenshots/` after deploying to your chosen host.

## Technology

- React 19, Vite, strict TypeScript, and responsive CSS
- Node.js 22, Express 5, Socket.IO, Zod, and secure Node crypto
- Pure shared game engine with player-specific state projection
- Vitest, Supertest, Socket.IO integration tests, and Playwright Chromium/WebKit tests
- pnpm workspaces, ESLint, Prettier, Docker, and GitHub Actions

## Repository structure

```text
apps/client          React card table and lobby
apps/server          REST, sessions, rooms, reconnect timers, Socket.IO
packages/game-engine Pure authoritative rules and state projection
packages/shared      Shared protocol, schemas, enums, and public types
tests/e2e            Independent-browser multiplayer tests
docs                 Rules and architecture decisions
```

## Local development

Prerequisites: Node.js 22+ and pnpm 11.9+.

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Open `http://localhost:5173`. Use two private/incognito browser contexts to represent two players. The Vite development server proxies API and Socket.IO traffic to port 3001.

## Quality commands

```bash
pnpm format:check   # formatting
pnpm lint           # static analysis
pnpm typecheck      # all workspace TypeScript projects
pnpm test           # engine and server integration tests
pnpm test:e2e       # Chromium and WebKit multiplayer/responsive tests
pnpm build          # production client and server
pnpm check          # all non-browser checks and build
```

Playwright browsers are installed once with:

```bash
pnpm exec playwright install chromium webkit
```

## Production and Docker

The production build emits the browser application to `apps/client/dist` and a bundled Node server to `dist/server/index.cjs`. Express serves both from one origin so credentials and WebSockets need no cross-site exception.

```bash
pnpm build
NODE_ENV=production PUBLIC_APP_URL=https://palace.example.com \
  ALLOWED_ORIGINS=https://palace.example.com SESSION_COOKIE_SECURE=true pnpm start
```

Or run the container locally:

```bash
docker compose up --build
```

Visit `http://localhost:3001`; the health endpoint is `GET /healthz`.

For public deployment, use a persistent Node/container provider that supports long-lived WebSocket connections and sticky single-instance operation. Set the public URL and allowed origin to the HTTPS deployment URL, enable secure cookies, expose the configured `PORT`, and point the provider health check at `/healthz`. Do not deploy the multiplayer server as a short-lived serverless function.

## Environment variables

| Variable                | Purpose                                          | Default                 |
| ----------------------- | ------------------------------------------------ | ----------------------- |
| `NODE_ENV`              | `development`, `test`, or `production`           | `development`           |
| `PORT`                  | Node HTTP/WebSocket port                         | `3001`                  |
| `PUBLIC_APP_URL`        | Canonical invitation origin                      | `http://localhost:5173` |
| `ALLOWED_ORIGINS`       | Comma-separated browser origins                  | local dev/test origins  |
| `RECONNECT_GRACE_MS`    | Time reserved for a disconnected player          | `120000`                |
| `ROOM_IDLE_TTL_MS`      | Inactive room cleanup threshold                  | `1800000`               |
| `SESSION_COOKIE_SECURE` | Require HTTPS for the player cookie              | `false`                 |
| `TRUST_PROXY`           | Trust one hosting proxy hop                      | `false`                 |
| `ROOM_CREATE_LIMIT`     | Room creations per IP per minute                 | `20`                    |
| `INVALID_ACTION_LIMIT`  | Rejected socket actions per session/minute       | `30`                    |
| `TEST_SHUFFLE_SEED`     | Deterministic shuffle, honored only in test mode | unset                   |

Never commit a real `.env`; only safe placeholders belong in `.env.example`.

## Multiplayer rooms and security

Room codes are convenient invitations, not credentials. Create/join responses issue a separate random 256-bit credential in an HttpOnly, SameSite cookie. The socket must present that credential to occupy or restore a player slot. Commands include a unique action ID and expected state revision, so retries are idempotent and stale moves cannot overwrite newer state.

The server owns the deck, hands, turns, legality, drawing, burns, phase changes, reconnect window, and winner. Every connected player receives a different projection: an opponent's hand and field are counts and card backs, never card values.

## Sound and visual assets

Cards and felt are original HTML/CSS using Unicode suit symbols; no card-art package or copyrighted imagery is included. Sounds are generated at runtime with the Web Audio API from original oscillator envelopes, so there are no third-party audio files or licenses. Sound begins only after a user interaction and the mute preference is saved locally.

## Known limitations and future ideas

- Rooms are held in one process. A server restart ends active games, and horizontal scaling requires sticky routing plus a shared room adapter/store.
- There are no spectators, accounts, chat, ranked matchmaking, or saved match history.
- A future version could add Redis-backed rooms, installable PWA support, player profiles, replay exports, localization, and optional rule variants.

The exact implemented rules are in [docs/RULES.md](docs/RULES.md), and the trust boundaries and protocol are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## License

MIT © 2026 Louis Lazzarini.
