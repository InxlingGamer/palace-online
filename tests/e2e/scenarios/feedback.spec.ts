import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

const scenario = process.env.TEST_GAME_SCENARIO;

interface Players {
  contextA: BrowserContext;
  contextB: BrowserContext;
  playerA: Page;
  playerB: Page;
}

async function createReadyGame(browser: Browser): Promise<Players> {
  const { viewport, isMobile, hasTouch, deviceScaleFactor, userAgent } = test.info().project.use;
  const options = {
    ...(viewport !== undefined ? { viewport } : {}),
    ...(isMobile !== undefined ? { isMobile } : {}),
    ...(hasTouch !== undefined ? { hasTouch } : {}),
    ...(deviceScaleFactor !== undefined ? { deviceScaleFactor } : {}),
    ...(userAgent !== undefined ? { userAgent } : {}),
  };
  const contextA = await browser.newContext(options);
  const contextB = await browser.newContext(options);
  const playerA = await contextA.newPage();
  await playerA.goto("/");
  await playerA.getByLabel("Display name").fill("Ada");
  await playerA.getByRole("button", { name: "Create room" }).click();
  const invitationLabel = await playerA
    .getByRole("button", { name: /Copy invitation/ })
    .getAttribute("aria-label");
  const roomCode = invitationLabel?.match(/[A-HJ-NP-Z2-9]{6}/)?.[0];
  if (!roomCode) throw new Error("Room code was not available.");

  const playerB = await contextB.newPage();
  await playerB.goto(`/room/${roomCode}`);
  await playerB.getByLabel("Display name").fill("Ben");
  await playerB.getByRole("button", { name: "Join room" }).click();
  await playerA.getByRole("button", { name: "I'm ready" }).click();
  await playerB.getByRole("button", { name: "I'm ready" }).click();
  await expect(playerA.getByText("Choose 3 cards")).toBeVisible();
  await expect(playerB.getByText("Choose 3 cards")).toBeVisible();

  for (const page of [playerA, playerB]) {
    const hand = page.locator(".hand [data-card-id]");
    await expect(hand).toHaveCount(6);
    await hand.nth(0).click();
    await hand.nth(1).click();
    await hand.nth(2).click();
  }
  await playerA.getByRole("button", { name: "Lock in cards" }).click();
  await playerB.getByRole("button", { name: "Lock in cards" }).click();
  if (scenario === "seven-restriction") {
    await expect(playerA.locator('.hand [data-card-rank="7"]')).toBeVisible();
  } else if (scenario === "blind-pickup") {
    await expect(playerA.locator('.play-stack [data-card-rank="A"]')).toBeVisible();
    await expect(playerA.locator(".hand [data-card-id]")).toHaveCount(0);
    await expect(playerB.locator(".opponent-hand .card--back")).toHaveCount(0);
  } else if (scenario === "pickup-anytime") {
    await expect(playerA.locator('.hand [data-card-rank="9"]')).toBeVisible();
    await expect(playerB.locator('.hand [data-card-rank="Q"]')).toBeVisible();
    await expect(playerA.locator('.play-stack [data-card-rank="8"]')).toBeVisible();
  } else if (scenario === "final-play") {
    await expect(playerA.locator('.hand [data-card-rank="10"]')).toBeVisible();
    await expect(playerA.locator(".hand [data-card-id]")).toHaveCount(1);
    await expect(playerB.locator('.play-stack [data-card-rank="5"]')).toBeVisible();
  } else if (scenario === "finished-result") {
    await expect(playerA.getByRole("dialog")).toBeVisible();
    await expect(playerB.getByRole("dialog")).toBeVisible();
  }
  return { contextA, contextB, playerA, playerB };
}

async function expectNoViewportOverflow(page: Page) {
  expect(
    await page.evaluate(() => ({
      horizontal: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      vertical: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    })),
  ).toEqual({ horizontal: 0, vertical: 0 });
}

test("seven restriction is shown only to the affected player", async ({ browser }) => {
  test.skip(scenario !== "seven-restriction", "Different deterministic scenario");
  const players = await createReadyGame(browser);
  await players.playerA.locator('.hand [data-card-rank="7"]').click();
  await players.playerA.getByRole("button", { name: "Play 1" }).click();
  await players.playerA.getByRole("button", { name: /Higher/ }).click();

  const recipientAlert = players.playerB.getByRole("status", { name: "Play higher than seven" });
  await expect(recipientAlert).toContainText("PLAY HIGHER THAN 7");
  await expect(recipientAlert).toBeInViewport();
  await expect(players.playerA.locator(".seven-alert")).toHaveCount(0);
  await expectNoViewportOverflow(players.playerB);
  await players.contextA.close();
  await players.contextB.close();
});

test("illegal blind card is revealed before the forced pickup", async ({ browser }) => {
  test.skip(scenario !== "blind-pickup", "Different deterministic scenario");
  const players = await createReadyGame(browser);
  const playerVisual = players.playerA.evaluate(
    () =>
      new Promise<{ rank: string | null; pickupDelay: number }>((resolve, reject) => {
        const timeout = window.setTimeout(
          () => reject(new Error("Reveal animation not observed")),
          5_000,
        );
        const observer = new MutationObserver(() => {
          const reveal = document.querySelector('.card-flight--blind-reveal [data-card-rank="4"]');
          const pickup = document.querySelector<HTMLElement>(".card-flight--pickup");
          if (!reveal || !pickup) return;
          window.clearTimeout(timeout);
          observer.disconnect();
          resolve({
            rank: reveal.getAttribute("data-card-rank"),
            pickupDelay: Number.parseFloat(getComputedStyle(pickup).animationDelay),
          });
        });
        observer.observe(document.body, { childList: true, subtree: true });
      }),
  );
  const opponentVisual = players.playerB.evaluate(
    () =>
      new Promise<{ count: number; exposesRank: boolean }>((resolve, reject) => {
        const timeout = window.setTimeout(
          () => reject(new Error("Opponent pickup not observed")),
          5_000,
        );
        const observer = new MutationObserver(() => {
          const pickups = document.querySelectorAll(".card-flight--opponent-pickup");
          if (pickups.length === 0) return;
          window.clearTimeout(timeout);
          observer.disconnect();
          resolve({
            count: pickups.length,
            exposesRank: [...pickups].some((node) => node.querySelector("[data-card-rank]")),
          });
        });
        observer.observe(document.body, { childList: true, subtree: true });
      }),
  );
  await players.playerA.getByRole("button", { name: "Your hidden card" }).dispatchEvent("click");

  const visual = await playerVisual;
  expect(visual.rank).toBe("4");
  expect(visual.pickupDelay).toBeGreaterThanOrEqual(1);
  expect(await opponentVisual).toEqual({ count: 2, exposesRank: false });
  await expect(players.playerA.locator(".hand [data-card-id]")).toHaveCount(2);
  await players.contextA.close();
  await players.contextB.close();
});

test("winner and loser receive accessible full-screen results", async ({ browser }) => {
  test.skip(scenario !== "finished-result", "Different deterministic scenario");
  const players = await createReadyGame(browser);
  const winner = players.playerA.getByRole("dialog");
  const loser = players.playerB.getByRole("dialog");
  await expect(winner).toHaveAccessibleName("WINNER");
  await expect(loser).toHaveAccessibleName("LOSER");
  await expect(winner.locator('[data-confetti="true"]')).toHaveCount(100);
  await expect(loser.locator('[data-confetti="true"]')).toHaveCount(0);
  await expect(winner.getByRole("button", { name: "Lobby" })).toBeVisible();
  await expect(loser.getByRole("button", { name: "Rematch" })).toBeVisible();
  await expectNoViewportOverflow(players.playerA);
  await expectNoViewportOverflow(players.playerB);
  await players.playerA.emulateMedia({ reducedMotion: "reduce" });
  await players.playerB.emulateMedia({ reducedMotion: "reduce" });
  await expect(winner.locator(".result-title span").first()).toHaveCSS("animation-name", "none");
  await expect(winner.locator(".confetti i").first()).toHaveCSS("animation-name", "none");
  await expect(loser.locator(".result-title span").first()).toHaveCSS("animation-name", "none");

  await winner.getByRole("button", { name: "Rematch" }).click();
  await expect(winner.getByRole("button", { name: "Rematch requested" })).toBeDisabled();
  await loser.getByRole("button", { name: "Rematch" }).click();
  await expect(players.playerA.getByText("Choose 3 cards")).toBeVisible();
  await expect(players.playerB.getByText("Choose 3 cards")).toBeVisible();
  await players.contextA.close();
  await players.contextB.close();
});

test("either player can pick up while Ada keeps the turn", async ({ browser }) => {
  test.skip(scenario !== "pickup-anytime", "Different deterministic scenario");
  const players = await createReadyGame(browser);
  try {
    for (const page of [players.playerA, players.playerB])
      await expect(page.getByRole("button", { name: "Pick up pile" })).toBeEnabled();
    await players.playerB.getByRole("button", { name: "Pick up pile" }).click();
    await expect(players.playerB.locator(".hand [data-card-id]")).toHaveCount(3);
    await expect(players.playerB.locator('.hand [data-card-rank="8"]')).toBeVisible();
    await expect(players.playerA.locator(".status-banner")).toContainText("Your turn");
    for (const page of [players.playerA, players.playerB]) {
      await expect(page.locator(".play-stack .pile-empty")).toBeVisible();
      await expectNoViewportOverflow(page);
    }
  } finally {
    await players.contextA.close();
    await players.contextB.close();
  }
});

for (const reducedMotion of [false, true]) {
  test(`final burned card precedes results${reducedMotion ? " with reduced motion" : ""}`, async ({
    browser,
  }) => {
    test.skip(scenario !== "final-play", "Different deterministic scenario");
    const players = await createReadyGame(browser);
    const pages = [players.playerA, players.playerB];
    try {
      for (const page of pages)
        await page.emulateMedia({ reducedMotion: reducedMotion ? "reduce" : "no-preference" });
      await players.playerA.locator('.hand [data-card-rank="10"]').click();
      await players.playerA.getByRole("button", { name: "Play 1" }).click();
      await Promise.all(
        pages.map(async (page) => {
          await expect(
            page.locator('[data-final-play="true"] [data-card-rank="10"]'),
          ).toBeVisible();
          await expect(page.getByRole("dialog")).toHaveCount(0);
          await expectNoViewportOverflow(page);
        }),
      );
      if (!reducedMotion) {
        await players.playerA.waitForTimeout(800);
        for (const page of pages) await expect(page.getByRole("dialog")).toHaveCount(0);
      }
      await Promise.all(
        pages.map((page) =>
          expect(page.getByRole("dialog")).toBeVisible({ timeout: reducedMotion ? 900 : 3000 }),
        ),
      );
      for (const page of pages) {
        await page.reload();
        await expect(page.getByRole("dialog")).toBeVisible();
        await expect(page.locator('[data-final-play="true"]')).toHaveCount(0);
      }
    } finally {
      await players.contextA.close();
      await players.contextB.close();
    }
  });
}
