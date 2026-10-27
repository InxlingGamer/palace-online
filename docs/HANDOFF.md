# Palace Online — project handoff

Living status document for the 2026 audit and overhaul. Keep it current at every checkpoint so any new chat can pick up from here. Read this first, then `README.md`, `docs/ARCHITECTURE.md`, and `docs/RULES.md`.

_Last updated: 2026-10-27 — Milestones 2 and 3 are live in production (`main` @ `54bdd98`). Milestone 4 mockup revised with the owner's feedback (no scrollbar, iPhone Home Screen app, court-card pictures) and **awaiting final approval**; no M4 code yet._

## How to resume

1. Check out the active branch listed under **Current state** and run `git -c safe.directory=* status`.
2. Read **Decisions** and **Open questions** before changing anything; never change Palace rules without the owner's approval.
3. Pick up the first task in the tracker that is not `done`.
4. Update this file (status, tracker, findings) before ending a session.

## Working agreements

- Roles: Claude is project manager, architect, design lead, and QA; Codex implements scoped tasks. Claude reviews every Codex diff, runs the tests, and checks rendered screenshots before anything is committed.
- **`main` deploys to production.** `render.yaml` uses `autoDeployTrigger: checksPass` on `main`. All work happens on `overhaul/*` branches with one PR per milestone; merging requires the owner's explicit approval.
- Budget is $0. No paid services, dependencies, or hosting changes without approval. Do not migrate off Render without approval.
- Players: two people (the owner and one partner). Priority devices: desktop and **iPhone 15 Plus Safari, portrait**. No real-device testing service; use Playwright WebKit emulation and list what remains unverified.

## Local tooling quirks (Windows)

- The `.git` directory is owned by the Codex sandbox account. Run git as `git -c safe.directory=* <command>`; do not edit global git config without asking.
- `pnpm` is not on `PATH`. Use `corepack pnpm …`. Workspace scripts that call `pnpm` internally (`typecheck`, `dev`, e2e web servers) need a `pnpm` shim on `PATH` (a `pnpm.cmd` containing `@corepack pnpm %*`).
- If `node_modules` looks broken, reinstall with `CI=true corepack pnpm install --frozen-lockfile`.
- Playwright Chromium and WebKit are installed (`./node_modules/.bin/playwright install webkit chromium`).
- Codex runs via the Claude Code `codex` plugin (`codex-companion.mjs task --write --fresh --cwd <repo> --prompt-file <file>`). Tell Codex to use `corepack pnpm exec <bin>` and not to run git or `pnpm install`.

## Current state

- Active branch: `overhaul/m4-felt-redesign` (from `main` @ `54bdd98`; docs only so far). No open PRs.
- M4 mockup (2026-10-26): [Palace felt table mockup](https://claude.ai/artifact/QKGHDTgYMXbDyFfBcMiZPM), a private design canvas (only the owner can open it unless shared). Frames: desktop on your turn (1440×900, with a `turn` tweak); iPhone 15 Plus on your turn and on Ben's turn, drawn at the Safari viewport 430×739; a card sheet (A–10 pips, J/Q/K, back, hand states); the card component. Do not start implementation until the owner approves or requests changes.
- Merged 2026-10-26 with the owner's explicit approval (merge commits, not squash): PR #1 (M2) → `edb6dbb`; PR #2 (M3) → `1ac0278`; [PR #3](https://github.com/InxlingGamer/palace-online/pull/3) (CI test fix) → `f3fafc2`. Render deployed M2 at 20:58 UTC and M3 at 22:12 UTC; `/healthz` OK; the live client bundle contains the M3 code; the main browser suite passed 6/6 against production (desktop Chromium, iPhone portrait).
- PR #3 context: `main` CI for the M3 merge failed twice because `page.reload()` crashed the page ("Page crashed") in iPhone-emulated WebKit on GitHub's Linux runners. It's intermittent, never reproduced on Windows, and reduced motion didn't prevent it. The final-play rejoin reload check now runs only on desktop Chromium; the final-card hold is still tested on every device. That blocked the M3 deploy until PR #3 merged.
- **GitHub runner slowness, 2026-10-26:** the `browser` job's `playwright install --with-deps` step took 10–46 min several times because `azure.archive.ubuntu.com` was crawling (packages timing out and falling back to `archive.ubuntu.com`). It isn't frozen: cancelling restarts the same slow download, so prefer waiting. One run also timed out a long-standing M2 test on a slow runner. Suggested follow-up (not done): cache Playwright browsers and/or add `timeout-minutes` to the install step so a real hang fails fast.
- Milestones 1–3 are complete and deployed.
- Verification for M2: 65/65 Vitest tests (3 consecutive runs), 4/4 typechecks, ESLint, Prettier; Playwright 12/12 (desktop Chromium, desktop WebKit, iPhone 15 Plus WebKit portrait and landscape) including a new simultaneous-draw test; scenario suites 9/9. The original reproduction now accepts simultaneous draws, a play racing an opponent draw, and double draws.
- Baseline before M2: 43 unit/integration tests.
- Verification for M3: 75/75 Vitest tests (3 consecutive runs; baseline 65), 4/4 typechecks, ESLint, Prettier, production build; Playwright main suite 12/12 (desktop Chromium, desktop WebKit, iPhone 15 Plus WebKit portrait and landscape); scenario suites 18/18 across 5 scenarios (desktop Chromium, iPhone portrait, iPhone landscape), including off-turn pickup and the final-card hold with and without reduced motion. Screenshots reviewed in `output/audit/shots/m3/` (local only).

## Milestone 3 plan (done)

Both changes were approved by the owner on 2026-10-26 (see **Decisions**). Ship them together with engine tests, server integration tests, and a browser test, then update `docs/RULES.md`.

1. **Pick up the pile at any time, regardless of whose turn it is.**
   - Engine (`packages/game-engine/src/index.ts`): `PICK_UP_PILE` no longer requires your turn or the absence of a legal move. Still requires `phase === "playing"` and a non-empty pile, and is rejected while `pendingSevenChoiceFor` is set.
   - On your own turn: same as today (cards to hand, turn passes, pickup stats, any seven restriction targeting you is consumed).
   - Off-turn: cards go to your hand, the turn does **not** change, pickup stats increment, and a seven restriction targeting you is consumed.
   - It still bumps `turnSeq` (pile changed), so an opponent play racing it gets the neutral "table changed" notice. Decide whether `stats.turnCount` should count off-turn pickups (recommend: no).
   - Turn gating lives in the engine: `applyCommand` returns `NOT_YOUR_TURN` for every non-draw command when it isn't your turn, and `applyPickup` returns `LEGAL_MOVE_AVAILABLE` — both must change for pickup. The server needs no change; `PICK_UP_PILE` stays a turn command for the `expectedTurn` check in `RoomStore.apply`.
   - Client (`App.tsx`): show "Pick up pile" whenever the pile is non-empty in play and no seven choice is pending, for both players; keep it disabled while an action is pending. Update the `canPickup` logic and the dock copy. Remove the client-side "no legal move" requirement.
   - Remove the `LEGAL_MOVE_AVAILABLE` rejection path (or leave the error code unused) and update tests that assert it.
2. **Show the final card before WINNER/LOSER.**
   - Engine/shared: add a public `lastPlay: { playerId: string; cards: Card[] } | null` to state and projection, set on every accepted play and hidden-card reveal (including plays that burn the pile), cleared on deal. Only already-revealed cards go in it — never hidden values.
   - Client: when the phase becomes `finished` with `resultReason === "finished"`, render `lastPlay.cards` on the play pile area for ~1.5 s (respect `prefers-reduced-motion` with a shorter hold), then show `ResultOverlay`. The win sound plays when the overlay appears. Forfeit results skip the hold.
   - Rejoining a finished room shows the overlay immediately (the existing `sessionStorage` "already presented" key covers this).

### M3 implementation decisions (Claude, 2026-10-26)

- Off-turn pickups do not increment `stats.turnCount` (they are not turns); they do increment pickups and `turnSeq`.
- `LEGAL_MOVE_AVAILABLE` is removed from `ErrorCode`.
- `lastPlay` is set in `playCommittedCards` before any burn (covers hand plays, legal hidden reveals, burns, a winning final 7) and on an illegal hidden reveal; cleared on deal/rematch; untouched by pickup, forfeit, expiry.
- Client: `canPickUpPile(state)` helper in `apps/client/src/pickup.ts` (playing, non-empty pile, no pending seven). Dock copy on your turn with no legal card: "No legal card" / "Pick up the pile."
- Final-card hold: 1500 ms (700 ms with reduced motion), rendered in `.play-stack` as `[data-final-play="true"]`; the hold timer is kept in a ref keyed by `gameId` so unrelated snapshots don't restart it; win/lose sound plays when the overlay appears.
- New browser scenarios: `pickup-anytime` and `final-play` (added to `test:e2e:scenarios`).
- Claude review amendments: the `.final-play` wrapper fills the play stack (it was a zero-size box); the "Final card" caption sits above the pile on a dark pill (it overlapped the field row on desktop and iPhone landscape); the status banner says "Game over" when finished (it said "<opponent>'s turn", now visible during the hold).
- Codex also made the scenario spec's manual browser contexts inherit the project's device profile. Before M3 the scenario tests on the iPhone projects ran with desktop contexts.
- Known minor: on a rejoin to an already-presented finished game, the final card may render for one frame before the overlay mounts. Not perceptible in testing.

### M4 mockup design decisions (Claude, 2026-10-26; pending owner approval)

- Table: green felt (`#1B6141` with a soft centre light) inside a dark walnut rail (`#2A1910`) on desktop; on iPhone the rail becomes the top bar. Accent gold `#E3B54A` is used only for turn, selection and the primary action.
- Type: Source Serif 4 (wordmark, card indices, counts) and Manrope (UI), both from Google Fonts at no cost.
- Cards: cream face `#FBF6EA`, red `#B42318`, black `#1B1B1D`; suits drawn as SVG paths, not Unicode (iOS can render ♥/♦ as emoji); standard pip layouts; court cards were first an original framed monogram, now original generated court figures (see owner feedback below); one burgundy lattice back with a "P" medallion.
- Turn indicator: the active player's seat plate gets a gold ring, a tint and a "YOUR TURN"/"BEN'S TURN" badge. Last move: a gold-outlined tag above the pile ("Ben played a pair of 8s"), with the last play fanned on top of the pile. Requirement line under the pile ("Play 8 or higher, or a 2, 7 or 10").
- Legal cards: unplayable cards are dimmed (lightness, not hue) on your turn only; selected cards lift with a gold ring. Off-turn, the dock offers "Pick up pile" (M3 rule) and a disabled Play.
- iPhone hand: one row (M5 decision), cards 70 px wide with the corner index always visible; see the owner feedback below for the no-scrollbar overlap rule. 44 px minimum touch targets in the header and dock.
- Not in the mockup yet: the lobby/join screen with invite button, the seven-direction prompt and the result overlay. Restyle them to match during implementation unless the owner wants them mocked first.

### M4 owner feedback (2026-10-27)

The owner likes the design and asked for three changes, now in the mockup:

- **No visible scrollbar anywhere, desktop or mobile.** The page itself never scrolls. The hand tightens its overlap as it grows so the whole row fits: on desktop always (a 22-card hand still fits at 1440 wide); on iPhone down to a 24 px strip per card (about 16 cards). Only a bigger iPhone hand swipes sideways, with the scrollbar hidden (`scrollbar-width: none` plus `::-webkit-scrollbar { display: none }`) and the edge fade/chevron shown only when it overflows.
- **Installable as an iPhone Home Screen web app that fills the whole screen**, including behind the clock and Dynamic Island. Needs: a web app manifest (`display: standalone`, name/short name "Palace", felt theme colour, 192/512 icons), `apple-touch-icon` 180×180, `apple-mobile-web-app-capable` plus `mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style` = `black-translucent`, `viewport-fit=cover` (already set) and `env(safe-area-inset-*)` padding so the walnut top bar runs under the status bar and the dock clears the home indicator. iPhone 15 Plus standalone viewport is 430×932 CSS px (top inset 59, bottom 34). iOS always draws the clock and battery on top; web apps cannot hide them. Check: rejoin data must survive iOS killing the backgrounded app (move the session token from `sessionStorage` to `localStorage` if needed); invite links tapped in Messages open in Safari, not the installed app, so joining by room code must stay easy.
- **Real court-card pictures** for J, Q and K instead of the monogram: original traditional-style artwork generated by Codex `image_gen` (one half-figure per rank, mirrored for the double-headed look), in `apps/client/public/cards/court-{jack,queen,king}.png` (1024×1024, about 1.9 MB each, deliberately not committed yet; originals also in `~/.codex/generated_images/01a17bc6-0ba3-71f3-8203-06bdeb556b10/`). During implementation, crop each to the top 1.17:1 (keep the crown), export small WebP (for example 2× the largest card face), and commit only those. The mockup shows them with a hairline seam, the half mirrored below, and a small suit pip in two corners of the frame.

## After Milestone 3

- **M4 redesign:** classic green felt. First produce a mockup of the table (desktop and iPhone portrait) for owner approval before implementation. Keep the join flow working. Cards: cream faces with proper pip layouts and original court-card treatment (no copyrighted art); one card-back design. Clear turn indicator, legal-card indication, last-move indicator, lobby with an invite/copy button, sounds on by default, reduced-motion support. Gate hover styles with `@media (hover: hover)`.
- **M5 hand layout:** single sideways-scrolling hand sorted as today (owner's choice). Acceptance: 20+ cards on iPhone 15 Plus (430×739 CSS px) are identifiable and individually selectable, nothing under the action dock, no page scroll/zoom or text selection conflicts, tap vs. swipe disambiguated, selected cards stay visible, smooth with 26+ cards. Measure with the audit harness (`output/audit/shots.ts`).
- **M6:** "waking the table" screen for Render cold starts (the first request after 15 idle minutes takes about a minute).
- **M7:** full regression on desktop + iPhone WebKit, a written iPhone checklist for the owner, final HANDOFF update.

## Milestones

| #   | Milestone                                                           | Status                     |
| --- | ------------------------------------------------------------------- | -------------------------- |
| 1   | Audit and prioritized findings                                      | done (approved 2026-10-26) |
| 2   | Multiplayer reliability, server crash fixes, lifecycle timers       | done; merged and deployed  |
| 3   | Requested rules: pick up anytime; show final card before result     | done; merged and deployed  |
| 4   | Visual redesign — classic green felt (owner chose a full redesign)  | mockup awaiting approval   |
| 5   | Mobile hand layout for 20+ cards on iPhone 15 Plus, performance     | not started                |
| 6   | Hosting: stay on Render plus a "waking the table" cold-start screen | approved, not started      |
| 7   | Regression testing and final QA                                     | not started                |

## Task tracker

| ID   | Task                                                                                                                                                                                                                                        | Pri | Status | Agent  | Depends | Main files                 | Verified |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------ | ------ | ------- | -------------------------- | -------- |
| M2-1 | Turn-scoped conflict check (`turnSeq`, `expectedTurn`) replacing global revision equality                                                                                                                                                   | P1  | done   | Codex  | —       | shared, engine, room-store | yes      |
| M2-2 | No-op repeated READY/REMATCH (no broadcast)                                                                                                                                                                                                 | P2  | done   | Codex  | —       | engine, room-store         | yes      |
| M2-3 | Crash fixes: non-function ack, LEAVE_ROOM session revocation, handler try/catch                                                                                                                                                             | P0  | done   | Codex  | —       | app.ts, room-store         | yes      |
| M2-4 | Timers: no expiry outside play, forfeit-bypass fix, empty room kept for idle TTL, seats offline until socket connects                                                                                                                       | P1  | done   | Codex  | —       | room-store, engine         | yes      |
| M2-5 | Abuse limits: per-session action budget, socket cap, Origin check                                                                                                                                                                           | P2  | done   | Codex  | —       | app.ts, room-store         | yes      |
| M2-6 | Client: action sender module, single in-flight action, ack timeout + resend same actionId, neutral STALE notice, auto-dismiss toasts, visible reconnect indicator, snapshot ordering guard                                                  | P1  | done   | Codex  | M2-1    | client                     | yes      |
| M2-7 | Docs: ARCHITECTURE and RULES updates                                                                                                                                                                                                        | P2  | done   | Codex  | M2-1..6 | docs                       | yes      |
| M2-8 | Claude review, e2e (Chromium + WebKit iPhone), multi-client repro; Claude fixes: flaky sync test, idle cleanup skips connected rooms, client stops retrying a room the server no longer knows (shows Room expired), 10-minute forfeit grace | —   | done   | Claude | M2-1..7 | —                          | yes      |
| M3-1 | Pick up anytime: engine (off-turn pickup, no turn change, no turnCount), client button for both players, dock copy, tests                                                                                                                   | P1  | done   | Codex  | M2-1    | engine, shared, client     | yes      |
| M3-2 | Final-card reveal: `lastPlay` in state/projection, 1.5 s hold (0.7 s reduced motion) before results, tests                                                                                                                                  | P1  | done   | Codex  | —       | engine, shared, client     | yes      |
| M3-3 | Claude review, e2e + screenshots (desktop, iPhone portrait/landscape); fixes: final-play box, caption placement, "Game over" banner                                                                                                         | —   | done   | Claude | M3-1..2 | client                     | yes      |

## Key audit findings (summary)

- **Network mismatch (root cause, reproduced):** the red toast is `STALE_STATE`. The server rejected any action whose `expectedRevision` differed from the room revision, and the revision changes on every draw (either player may draw at any time) and on every connect/disconnect. Simultaneous draws, a play racing the opponent's draw, double taps, and opponent reconnects all caused false rejections. Game state was never corrupted (Codex simulated 200 games / ~49k actions: 52 cards conserved).
- **P0 crashes (reproduced by Codex):** a non-function acknowledgement argument and LEAVE_ROOM followed by reconnect both throw uncaught exceptions and kill the Node process (ending every game).
- **Lifecycle:** a 120-second disconnect (an iPhone screen lock) expired lobby/setup rooms and turned finished games into `expired`, erasing the winner; a both-disconnected sequence could skip a forfeit deadline and stall a game.
- **Mobile:** with 20 cards, 10 are off-screen on an iPhone 15 Plus viewport (17 of 26); the hand sits under the action dock; large hands overflow on desktop too. About 40% of the mobile table is empty space.
- **UI:** error toasts never auto-dismiss and remain behind the result screen; the lobby shows "You · Out"; the connection indicator is hidden on mobile; hover styles are not gated to hover-capable devices (suspected sticky hover on iOS).
- **Hosting:** Render free is acceptable; the mismatch was not hosting-related. Costs: ~1-minute cold start after 15 idle minutes and occasional restarts that end in-memory games. Alternatives reviewed 2026-10-26: Koyeb free (one 0.1 vCPU/512 MB instance, 1-hour idle sleep, 1–5 s wake) as fallback; Cloudflare Durable Objects (robust but a server rewrite); Oracle Always Free (reported 2026 cuts, idle reclamation); Fly.io/Vercel/Netlify unsuitable or not free.

## Decisions

- Design: full redesign to a classic green felt table; the join screen must keep working.
- Sound effects on by default.
- Conflict policy: only turn-changing actions are checked against a turn sequence; draws, ready, setup, rematch, and leave are validated by the engine without a revision precondition.
- Legacy clients (no `expectedTurn`) keep the old strict revision check for turn actions.
- Owner answers, 2026-10-26:
  1. **Pick up anytime, regardless of whose turn it is** (M3). Interpretation to implement: allowed whenever the pile is non-empty and play is active, even with a legal move. On your own turn it ends your turn as today; off-turn it leaves the turn unchanged and consumes any seven restriction targeting you. Blocked only while a seven direction choice is pending (it resolves in a moment). An off-turn pickup changes the pile, so it bumps `turnSeq`; a play racing it gets the neutral "table changed" notice.
  2. **Final-card reveal approved** (M3): show the last played card (even if it burned the pile) for ~1.5 s before WINNER/LOSER. Requires the server to expose the last play in the projection.
  3. **Large hands: a single sideways-scrolling hand, sorted as today** (M5), not rank stacks. Requirements: readable card corners at every size, momentum scroll with tap-vs-swipe disambiguation, no page scroll/zoom conflicts, selected cards stay visible, edge fade hints, nothing hidden under the action dock.
  4. **Stay on Render** and add a cold-start "waking the table" screen (M6).
  5. **Lengthen the in-play forfeit grace** to 10 minutes (`RECONNECT_GRACE_MS=600000` in config default, `.env.example`, and `render.yaml`) — part of M2.

## Open questions for the owner

- Approve the M4 felt table mockup, or list changes: https://claude.ai/artifact/QKGHDTgYMXbDyFfBcMiZPM

## Verification status and unverified areas

- Not verified on a physical iPhone: Safari toolbar resizing, sticky hover, touch latency, audio unlock. Emulation used: Playwright WebKit with the `iPhone 15 Plus` device profile (430×739).
- Audit screenshots live in `output/audit/shots/` (gitignored, local only); the harness is `output/audit/shots.ts`.
