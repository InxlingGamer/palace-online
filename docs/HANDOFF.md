# Palace Online — project handoff

Living status document for the 2026 audit and overhaul. Keep it current at every checkpoint so any new chat can pick up from here. Read this first, then `README.md`, `docs/ARCHITECTURE.md`, and `docs/RULES.md`.

_Last updated: 2026-10-26 — Milestone 2 done; [PR #1](https://github.com/InxlingGamer/palace-online/pull/1) open and awaiting the owner's merge approval. Next: Milestone 3._

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

- Active branch: `overhaul/m2-multiplayer-reliability` (from `main` @ `eb15690`), pushed to origin.
- Open PR: [InxlingGamer/palace-online#1](https://github.com/InxlingGamer/palace-online/pull/1) — "Fix false network mismatch errors and harden the multiplayer server". Not merged. **Merging deploys to production**; only merge when the owner explicitly says so, and preferably when nobody is mid-game (games are in memory).
- Milestone 1 (audit) is complete and approved. Milestone 2 is implemented (Codex), reviewed and amended (Claude), committed, and pushed.
- Verification for M2: 65/65 Vitest tests (3 consecutive runs), 4/4 typechecks, ESLint, Prettier; Playwright 12/12 (desktop Chromium, desktop WebKit, iPhone 15 Plus WebKit portrait and landscape) including a new simultaneous-draw test; scenario suites 9/9. The original reproduction now accepts simultaneous draws, a play racing an opponent draw, and double draws.
- Baseline before M2: 43 unit/integration tests.
- Next step: Milestone 3, described below. Branch `overhaul/m3-requested-rules` from `overhaul/m2-multiplayer-reliability` (M3 builds on `turnSeq`); if PR #1 has been merged by then, branch from `main` instead. Open the M3 PR against whichever base was used.

## Next up: Milestone 3 plan

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

## After Milestone 3

- **M4 redesign:** classic green felt. First produce a mockup of the table (desktop and iPhone portrait) for owner approval before implementation. Keep the join flow working. Cards: cream faces with proper pip layouts and original court-card treatment (no copyrighted art); one card-back design. Clear turn indicator, legal-card indication, last-move indicator, lobby with an invite/copy button, sounds on by default, reduced-motion support. Gate hover styles with `@media (hover: hover)`.
- **M5 hand layout:** single sideways-scrolling hand sorted as today (owner's choice). Acceptance: 20+ cards on iPhone 15 Plus (430×739 CSS px) are identifiable and individually selectable, nothing under the action dock, no page scroll/zoom or text selection conflicts, tap vs. swipe disambiguated, selected cards stay visible, smooth with 26+ cards. Measure with the audit harness (`output/audit/shots.ts`).
- **M6:** "waking the table" screen for Render cold starts (the first request after 15 idle minutes takes about a minute).
- **M7:** full regression on desktop + iPhone WebKit, a written iPhone checklist for the owner, final HANDOFF update.

## Milestones

| #   | Milestone                                                           | Status                         |
| --- | ------------------------------------------------------------------- | ------------------------------ |
| 1   | Audit and prioritized findings                                      | done (approved 2026-10-26)     |
| 2   | Multiplayer reliability, server crash fixes, lifecycle timers       | done on branch; PR awaiting OK |
| 3   | Requested rules: pick up anytime; show final card before result     | not started (answers received) |
| 4   | Visual redesign — classic green felt (owner chose a full redesign)  | not started                    |
| 5   | Mobile hand layout for 20+ cards on iPhone 15 Plus, performance     | not started                    |
| 6   | Hosting: stay on Render plus a "waking the table" cold-start screen | approved, not started          |
| 7   | Regression testing and final QA                                     | not started                    |

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

None right now.

## Verification status and unverified areas

- Not verified on a physical iPhone: Safari toolbar resizing, sticky hover, touch latency, audio unlock. Emulation used: Playwright WebKit with the `iPhone 15 Plus` device profile (430×739).
- Audit screenshots live in `output/audit/shots/` (gitignored, local only); the harness is `output/audit/shots.ts`.
