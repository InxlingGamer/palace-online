# Palace Online — project handoff

Living status document for the 2026 audit and overhaul. Keep it current at every checkpoint so any new chat can pick up from here. Read this first, then `README.md`, `docs/ARCHITECTURE.md`, and `docs/RULES.md`.

_Last updated: 2026-10-27 — Milestones 2–4 are live in production (M4 deployed about 06:53 UTC). The owner approved merging both pending PRs: the rule change "pick up the pile only on your own turn" ([PR #6](https://github.com/InxlingGamer/palace-online/pull/6)) merged as `0785602`, and **Milestone 5 (iPhone hand for 20+ cards, [PR #7](https://github.com/InxlingGamer/palace-online/pull/7)) is merged next**. Next up: M6 ("waking the table" cold-start screen), then M7 (iPhone Home Screen web app, plan with the owner first) and M8 (regression)._

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

- 2026-10-27, with the owner's explicit approval: [PR #6](https://github.com/InxlingGamer/palace-online/pull/6) (pickup on your own turn) merged into `main` as `0785602`; `main` was then merged into `overhaul/m5-iphone-hand` (conflicts in the scenario list, `package.json` and this file resolved to keep both the `pickup-own-turn` rename and `big-hand`), and [PR #7](https://github.com/InxlingGamer/palace-online/pull/7) (M5) merges after its CI passes. Start M6 on a new branch from the updated `main`; **never merge without the owner's approval** (merging deploys to production).
- M4 merged 2026-10-27 06:46 UTC with the owner's approval ([PR #4](https://github.com/InxlingGamer/palace-online/pull/4) → `cb1691e`). `main` CI passed (quality + browser) and Render deployed it at about 06:53 UTC: `/healthz` OK, the live bundle contains the M4 hand code, and `/cards/court-king.webp` is served.
- M4 mockup, approved by the owner 2026-10-27: [Palace felt table mockup](https://claude.ai/artifact/QKGHDTgYMXbDyFfBcMiZPM), a private design canvas (only the owner can open it unless shared). Frames: desktop on your turn and with a 22-card hand; iPhone 15 Plus (Safari 430×739) on your turn, on Ben's turn and with a 22-card hand; card sheet; card component; plus a DEFERRED row (Home Screen app, icon).
- Verification for M4: 99/99 Vitest tests (baseline 75), 4/4 typechecks, ESLint, Prettier, production build; Playwright main suite 12/12 (desktop Chromium, desktop WebKit, iPhone 15 Plus WebKit portrait and landscape) with new no-page-overflow and hidden-scrollbar checks; scenario suites 18/18. Screenshots of every screen reviewed at 1366×768, 1920×1080, iPhone portrait 430×739 and iPhone landscape (`output/audit/shots/`, local only).
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

The owner likes the design and asked for these changes:

- **No visible scrollbar anywhere, desktop or mobile.** The page itself never scrolls. The hand tightens its overlap as it grows so the whole row fits: on desktop always (a 22-card hand still fits at 1440 wide); on iPhone down to a 24 px strip per card (about 16 cards). Only a bigger iPhone hand swipes sideways, with the scrollbar hidden (`scrollbar-width: none` plus `::-webkit-scrollbar { display: none }`) and the edge fade/chevron shown only when it overflows.
- **Deferred, not part of M4 (owner, 2026-10-27): installable iPhone Home Screen web app.** The owner wants it planned and added later because of possible complications with Render; do not add a manifest, icons or Home Screen meta tags in M4. The mockup keeps its frames in a "DEFERRED" row for reference. Intended result: the app fills the whole screen, including behind the clock and Dynamic Island. Needs: a web app manifest (`display: standalone`, name/short name "Palace", felt theme colour, 192/512 icons), `apple-touch-icon` 180×180, `apple-mobile-web-app-capable` plus `mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style` = `black-translucent`, `viewport-fit=cover` (already set) and `env(safe-area-inset-*)` padding so the walnut top bar runs under the status bar and the dock clears the home indicator. iPhone 15 Plus standalone viewport is 430×932 CSS px (top inset 59, bottom 34). iOS always draws the clock and battery on top; web apps cannot hide them. Check: rejoin data must survive iOS killing the backgrounded app (move the session token from `sessionStorage` to `localStorage` if needed); invite links tapped in Messages open in Safari, not the installed app, so joining by room code must stay easy.
- **Real court-card pictures** for J, Q and K instead of the monogram: original traditional-style artwork generated by Codex `image_gen` (one half-figure per rank, mirrored for the double-headed look), in `apps/client/public/cards/court-{jack,queen,king}.png` (1024×1024, about 1.9 MB each, deliberately not committed yet; originals also in `~/.codex/generated_images/01a17bc6-0ba3-71f3-8203-06bdeb556b10/`). During implementation, crop each to the top 1.17:1 (keep the crown), export small WebP (for example 2× the largest card face), and commit only those. The mockup shows them with a hairline seam, the half mirrored below, and a small suit pip in two corners of the frame.

### M4 implementation (2026-10-27)

- Codex built it from the approved mockup (brief: felt/walnut/cream/gold tokens, SVG suits, pip layouts, mirrored court art, seat plates with turn badge, last-move tag, requirement line, dimmed unplayable cards, adaptive hand, restyled lobby/prompts/overlays). Server, engine, shared types and rules are untouched.
- New client modules: `cards.tsx` (Card, CardBack, SuitIcon), `hand.tsx` + `hand-layout.ts` (fit-to-width overlap, minimum strip 24 px on iPhone / 22 px desktop, hidden scrollbars, edge fade and chevron only when overflowing), `table-copy.ts` (last-move and requirement copy), with unit tests. Court art: `apps/client/public/cards/court-{jack,queen,king}.webp` (240×205, ~17 KB each); the 1024 px originals are not in the repo (Codex copies in `~/.codex/generated_images/01a17bc6-0ba3-71f3-8203-06bdeb556b10/`).
- Claude review amendments: switched from variable to static Fontsource weights (Playwright WebKit on Windows ignored the variable weight axis, so every iPhone screenshot rendered thin; static Latin weights 500–800 Manrope, 600/700 Source Serif 4); desktop short-height grid gives your field and hand their natural height so the field no longer covers the requirement line at 1366×768; tighter iPhone landscape rows so the pile clears the opponent's field and the "Draw pile" label is readable; removed a stray landing glow element that pushed the desktop landing into a broken grid; the requirement line now says "<name> is choosing higher or lower" while the opponent resolves a seven; Codex's multiplayer spec now runs in each project's device profile, so its reload/rejoin step is skipped on mobile (same Linux CI WebKit crash as PR #3).
- Hand behaviour now covers most of M5's acceptance: 26 cards fit on desktop at 1366 wide (46 px strips) and on iPhone portrait about 16 cards fit; beyond that the row swipes with no visible scrollbar. M5 still owns tap-vs-swipe tuning, momentum feel and performance with 26+ cards.
- Known limitations: the opponent's face-down hand on iPhone sits small under their field; desktop at 1920×1080 leaves generous empty felt (cards are capped at 96 px). Neither blocks play.

### Rule change: pick up only on your own turn (owner, 2026-10-27)

The owner revised the M3 pickup rule: "you should ONLY be able to pick up the pile when it is your turn but you can do it on ANY turn." Implemented interpretation: `PICK_UP_PILE` requires your turn (off-turn returns `NOT_YOUR_TURN`), but it is allowed on any of your turns, even when you hold a legal card. Unchanged: it ends your turn, it is blocked while a seven direction choice is pending, and it consumes a seven restriction targeting you. The client shows "Pick up pile" only on your turn. Scenario `pickup-anytime` becomes `pickup-own-turn`. Shipped as its own PR ([#6](https://github.com/InxlingGamer/palace-online/pull/6), merged `0785602`), separate from M5.

- Engine: `applyCommand` no longer exempts `PICK_UP_PILE` from the turn check; `applyPickup` always passes the turn. Client: `canPickUpPile` requires your turn. Server needs no change (the `expectedTurn` check already covers pickup).
- Verification (Claude, 2026-10-27): 101/101 Vitest tests (baseline 99), 4/4 typechecks, ESLint, Prettier on changed files; `pickup-own-turn` browser scenario 3/3 (desktop Chromium, iPhone portrait, iPhone landscape); screenshots of both docks reviewed (off-turn: only a disabled full-width "Play cards" and "Waiting for Ada."; own turn with a legal 9: "Pick up pile" next to Play). GitHub CI passed.

## Milestone 5 plan (done)

M4 already fits the hand to its row (24 px minimum strip on iPhone, about 16 cards) with hidden scrollbars, and swipes only beyond that. Baseline on `main` @ `cb1691e` (audit harness, iPhone 430×739): 26 cards → 24 px strips with 11 cards off-screen until swiped; no page overflow; the hand ends exactly at the dock top (614 px).

Owner answers (2026-10-27):

1. **Selected cards scrolled off-screen → gold edge badge** ("‹ 2 selected" / "2 selected ›"). Tapping it scrolls back to them. Selected cards keep the lift and gold ring; the dock's "2 × 8" stays.
2. **Free glide:** native momentum, no scroll-snap.
3. **Keep the 24 px minimum strip** on iPhone (no widening when the hand overflows).

Work (Codex brief, Claude review):

- Tap-vs-swipe guard (`hand-gesture.ts`): a touch counts as a tap only if it moved ≤ 10 px, the hand scrolled ≤ 2 px, and it did not start during a glide.
- Edge badge, plus a nudge into view when you select a card that sits under an edge fade.
- `touch-action: manipulation`, and no text selection or long-press menu in the game.
- A rAF-throttled scroll handler that doesn't re-render the cards.
- A `big-hand` test scenario (26 cards) with browser tests on desktop Chromium, iPhone portrait and landscape, including a real CDP touch swipe in mobile-emulated Chromium and a rough frame-time guard.

### M5 implementation (2026-10-27, done; merge approved by the owner)

- Codex implemented it as briefed: `hand-gesture.ts` (`isTap`, `selectedVisibility`, thresholds `TAP_DISTANCE` 10, `TAP_SCROLL_DELTA` 2, `GLIDE_IDLE_MS` 80, `MIN_VISIBLE_STRIP` 12), `hand.tsx` (passive pointer listeners on the scroll box, capture-phase click guard for touch/pen only, `contextmenu` blocked, rAF-throttled edge/badge state, `.hand-selected--left/right` badge buttons, nudge on select), `.game-shell` `touch-action: manipulation` + no text selection, `-webkit-touch-callout: none` on the hand. Landscape now also uses the 24 px minimum strip (it inherited 22). Scenario `big-hand` (26 cards, 52 distinct physical cards); the scenario config runs it on iPhone portrait at 430×739.
- Codex's sandbox could not start Vitest or Playwright (`spawn EPERM`); Claude ran everything.
- Claude review fix: the big-hand test waited a fixed 120 ms after setting `scrollLeft` before tapping, but WebKit delivers that scroll event 0–90 ms late (more under load), so the tap sometimes fell inside the 80 ms glide window and was correctly ignored (flaky on cards 10–17, the ones whose positioning really scrolls). The test now waits for 120 ms of scroll silence (`settleScroll`). Product behaviour unchanged.
- Claude review fix 2 (from audit screenshots): the badge counted a selected card as hidden when its index sat anywhere under the 32 px edge fade, so it showed "1 selected" while that card's rank was plainly readable. Visibility now insets only the outer half of the fade (`HAND_FADE_COVER` = 16 px); the tap nudge still clears the full fade. New browser assertion: a selected index 20 px into the fade shows no badge; past the edge it does.
- Audit harness (`output/audit/shots.ts`, local) gained shots 22–25: 26-card hand with the 8s selected, swiped to each end, and the 2s selected and swiped away (badge). Measurements: page overflow 0 on every screen; hand bottom never below the dock top (iPhone 614/614, landscape 314/314); iPhone portrait 430×739 at 26 cards: 24 px strips, swipe range 276 px; landscape 814×380: 24 px, range 306 px; desktop 1366 and 1920: 26 cards fit (46 / 67 px strips), no scroll, no badge.
- Final verification: `pnpm check` (Prettier, ESLint, 4/4 typechecks, 104/104 Vitest — baseline 99, production build); main browser suite 12/12; all six scenario suites 25/25 (`big-hand` 7/7 three runs in a row after the fixes; the CDP touch-swipe and frame-time test runs on Chromium only, p95 frame < 50 ms).
- Unverified (no real device): how the free glide and the 80 ms glide window feel under a real finger, Safari's edge-swipe back gesture near the hand's left edge, and performance on the real A16 GPU. Playwright WebKit cannot synthesise native touch scrolling; the swipe guard is tested with dispatched pointer events there and with a real CDP touch swipe in mobile Chromium.
- Merge: PR #6 merged first; `main` was merged into this branch and the conflicts (scenario list in `config.ts` and `test-scenarios.ts`, root `package.json`, this file) resolved to keep both the `pickup-own-turn` rename and `big-hand`. Checks were rerun on the merged branch before PR #7 merged.
- Windows note: switching branches with `core.autocrlf=true` rewrites some files with CRLF and Prettier then flags them; `corepack pnpm exec prettier --write <files>` restores LF with no content diff.

## After Milestone 3

- **M4 redesign:** classic green felt. First produce a mockup of the table (desktop and iPhone portrait) for owner approval before implementation. Keep the join flow working. Cards: cream faces with proper pip layouts and original court-card treatment (no copyrighted art); one card-back design. Clear turn indicator, legal-card indication, last-move indicator, lobby with an invite/copy button, sounds on by default, reduced-motion support. Gate hover styles with `@media (hover: hover)`.
- **M5 hand layout:** single sideways-scrolling hand sorted as today (owner's choice). Acceptance: 20+ cards on iPhone 15 Plus (430×739 CSS px) are identifiable and individually selectable, nothing under the action dock, no page scroll/zoom or text selection conflicts, tap vs. swipe disambiguated, selected cards stay visible, smooth with 26+ cards. Measure with the audit harness (`output/audit/shots.ts`).
- **M6:** "waking the table" screen for Render cold starts (the first request after 15 idle minutes takes about a minute).
- **M7 (added by the owner, 2026-10-27, placed before final QA at their request): iPhone Home Screen web app** (a "bookmark app": Safari → Share → Add to Home Screen opens Palace full screen like an app). Details still to be worked out with the owner before any code. Planning questions:
  - Hosting: can it stay on Render free? Check how the manifest and icons are served and cached, what a deploy does to an installed app, whether a service worker is needed or wise, and how the ~1-minute cold start feels when launching from the Home Screen (ties into M6). If Render can't support it well, list the alternatives and costs and get the owner's approval before any switch (the budget is $0).
  - App behaviour: rejoin data surviving iOS killing the app (`sessionStorage` → `localStorage`?); invite links from Messages open in Safari, not the installed app, so joining by room code must stay easy.
  - Requirements and iOS caveats are in "M4 owner feedback" above; mockup frames are in the canvas's DEFERRED row.
- **M8:** full regression on desktop + iPhone WebKit (including the Home Screen app), a written iPhone checklist for the owner, final HANDOFF update.

## Milestones

| #   | Milestone                                                           | Status                     |
| --- | ------------------------------------------------------------------- | -------------------------- |
| 1   | Audit and prioritized findings                                      | done (approved 2026-10-26) |
| 2   | Multiplayer reliability, server crash fixes, lifecycle timers       | done; merged and deployed  |
| 3   | Requested rules: pick up anytime; show final card before result     | done; merged and deployed  |
| 4   | Visual redesign — classic green felt (owner chose a full redesign)  | done; merged and deployed  |
| 5   | Mobile hand layout for 20+ cards on iPhone 15 Plus, performance     | done; merge approved       |
| 6   | Hosting: stay on Render plus a "waking the table" cold-start screen | approved, not started      |
| 7   | iPhone Home Screen web app (plan hosting with Render first)         | not started; needs plan    |
| 8   | Regression testing and final QA                                     | not started                |

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
| M4-1 | Mockup with owner feedback (no scrollbar, court pictures; Home Screen app deferred); court art generated by Codex image_gen                                                                                                                 | —   | done   | Claude | —       | mockup, public/cards       | yes      |
| M4-2 | Felt redesign implementation: cards, table, hand layout, copy helpers, lobby/overlays, tests                                                                                                                                                | P1  | done   | Codex  | M4-1    | client                     | yes      |
| M4-3 | Claude review, e2e + screenshots (4 viewports); fixes: static fonts, desktop rows, landscape, landing grid, seven copy, mobile reload guard                                                                                                 | —   | done   | Claude | M4-2    | client, e2e                | yes      |
| R-1  | Pick up only on your own turn (any of your turns): engine, client button, tests, `pickup-own-turn` scenario, RULES; PR #6                                                                                                                   | P1  | done   | Codex  | —       | engine, client, e2e, docs  | yes      |
| M5-1 | Hand: tap-vs-swipe guard, selected-card edge badge, no zoom/selection conflicts, scroll performance, `big-hand` scenario and tests                                                                                                          | P1  | done   | Codex  | —       | client, server scenario    | yes      |
| M5-2 | Claude review, audit-harness measurements (iPhone portrait/landscape, desktop), screenshots, PR                                                                                                                                             | —   | done   | Claude | M5-1    | —                          | yes      |

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
  1. **Superseded 2026-10-27: pickup is now on your own turn only (any of your turns); see "Rule change" above.** Original M3 answer: **Pick up anytime, regardless of whose turn it is** (M3). Interpretation to implement: allowed whenever the pile is non-empty and play is active, even with a legal move. On your own turn it ends your turn as today; off-turn it leaves the turn unchanged and consumes any seven restriction targeting you. Blocked only while a seven direction choice is pending (it resolves in a moment). An off-turn pickup changes the pile, so it bumps `turnSeq`; a play racing it gets the neutral "table changed" notice.
  2. **Final-card reveal approved** (M3): show the last played card (even if it burned the pile) for ~1.5 s before WINNER/LOSER. Requires the server to expose the last play in the projection.
  3. **Large hands: a single sideways-scrolling hand, sorted as today** (M5), not rank stacks. Requirements: readable card corners at every size, momentum scroll with tap-vs-swipe disambiguation, no page scroll/zoom conflicts, selected cards stay visible, edge fade hints, nothing hidden under the action dock.
  4. **Stay on Render** and add a cold-start "waking the table" screen (M6).
  5. **Lengthen the in-play forfeit grace** to 10 minutes (`RECONNECT_GRACE_MS=600000` in config default, `.env.example`, and `render.yaml`) — part of M2.

## Open questions for the owner

- M6 (cold-start screen) is approved and next; no open questions yet.
- M7 (Home Screen web app): details and hosting (stay on Render or switch) to be decided with the owner when M7 starts.

## Verification status and unverified areas

- Not verified on a physical iPhone: Safari toolbar resizing, sticky hover, touch latency, audio unlock, and (M4) how the hand swipe feels, font rendering and court-art sharpness on the real screen. Emulation used: Playwright WebKit with the `iPhone 15 Plus` device profile (430×739).
- Audit screenshots live in `output/audit/shots/` (gitignored, local only); the harness is `output/audit/shots.ts`.
