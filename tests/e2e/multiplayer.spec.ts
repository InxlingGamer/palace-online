import { expect, test, type BrowserContext, type Page } from "@playwright/test";

async function createPlayer(context: BrowserContext, name: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto("/");
  await page.getByLabel("Display name").fill(name);
  await page.getByRole("button", { name: "Create room" }).click();
  await expect(page.getByRole("button", { name: /Copy invitation/ })).toBeVisible();
  return page;
}

test("two isolated players can join, ready, set up, synchronize, and reconnect", async ({
  browser,
}) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const playerA = await createPlayer(contextA, "Ada");
  const roomCode = await playerA
    .getByRole("button", { name: /Copy invitation/ })
    .getAttribute("aria-label");
  const code = roomCode?.match(/[A-HJ-NP-Z2-9]{6}/)?.[0];
  expect(code).toBeTruthy();

  const playerB = await contextB.newPage();
  await playerB.goto(`/room/${code}`);
  await playerB.getByLabel("Display name").fill("Ben");
  await playerB.getByRole("button", { name: "Join room" }).click();

  await expect(playerA.getByText("Ben", { exact: true })).toBeVisible();
  await expect(playerB.getByText("Ada", { exact: true })).toBeVisible();
  await playerA.getByRole("button", { name: "I'm ready" }).click();
  await expect(playerB.locator(".presence--ready")).toBeVisible();
  await playerB.getByRole("button", { name: "I'm ready" }).click();

  await Promise.all(
    [playerA, playerB].flatMap((page) => [
      expect(page.getByText("Choose 3 cards")).toBeVisible(),
      expect(page.locator(".card-flight--hidden-deal")).toHaveCount(3),
      expect(page.locator(".card-flight--hand-deal")).toHaveCount(6),
    ]),
  );

  for (const page of [playerA, playerB]) {
    const hand = page.locator(".hand [data-card-id]");
    await expect(hand).toHaveCount(6);
    const ranks = await hand.evaluateAll((cards) =>
      cards.map((card) => card.getAttribute("data-card-rank")),
    );
    const order = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
    expect(ranks.map((rank) => order.indexOf(rank ?? ""))).toEqual(
      ranks.map((rank) => order.indexOf(rank ?? "")).sort((left, right) => left - right),
    );
    await hand.nth(0).click();
    await hand.nth(1).click();
    await hand.nth(2).click();
    await page.getByRole("button", { name: "Lock in cards" }).click();
    await expect(
      page.locator(".field-row--you .field-stack").first().locator(".card--back"),
    ).toHaveCount(2);
  }

  await expect(playerA.getByText(/turn$/i).first()).toBeVisible();
  await expect(playerB.locator(".opponent-hand .card--back")).toHaveCount(3);
  await expect(playerB.locator(".opponent-hand")).not.toContainText(/[2-9JQKA]/);
  await expect(playerA.locator(".card__back-mark")).toHaveCount(0);

  const turnBeforeDraw = await playerA.locator(".status-banner b").textContent();
  await playerA.locator(".deck-stack button").click();
  await expect(playerA.locator(".hand [data-card-id]")).toHaveCount(4);
  await expect(playerB.locator(".opponent-hand .card--back")).toHaveCount(4);
  await expect(playerA.locator(".card-flight--draw")).toBeVisible();
  expect(await playerA.locator(".status-banner b").textContent()).toBe(turnBeforeDraw);

  await playerA.locator(".deck-stack button").click();
  await expect(playerA.locator(".hand [data-card-id]")).toHaveCount(5);
  await expect(playerA.getByRole("button", { name: "Hand is full at five cards" })).toBeDisabled();

  await playerB.locator(".deck-stack button").click();
  await expect(playerB.locator(".hand [data-card-id]")).toHaveCount(4);

  await playerA.reload();
  await expect(playerA.getByRole("button", { name: /Copy invitation/ })).toBeVisible();
  await expect(playerA.getByText("Ben", { exact: true })).toBeVisible();

  await contextA.close();
  await contextB.close();
});

test("touch viewport keeps primary controls reachable", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Display name")).toBeInViewport();
  await expect(page.getByRole("button", { name: "Create room" })).toBeInViewport();
  await expect(page.getByText(/No account|fortress|private table/i)).toHaveCount(0);
  expect(
    await page.evaluate(() => ({
      horizontal: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      vertical: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    })),
  ).toEqual({ horizontal: 0, vertical: 0 });

  await page.getByLabel("Display name").fill("Kylie");
  await page.getByRole("button", { name: "Create room" }).click();
  await expect(page.getByText("Share the room code or invitation link.")).toBeVisible();
  await expect(page.getByText("Share the room code or invitation link.")).toBeInViewport();
  await expect(page.getByText("Draw pile")).toBeInViewport();
  await expect(page.getByText("Play pile")).toBeInViewport();
  expect(
    await page.evaluate(() => ({
      horizontal: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      vertical: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    })),
  ).toEqual({ horizontal: 0, vertical: 0 });
});

test("both players can draw at the same moment without a rejection", async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const playerA = await createPlayer(contextA, "Ada");
  const label = await playerA
    .getByRole("button", { name: /Copy invitation/ })
    .getAttribute("aria-label");
  const code = label?.match(/[A-HJ-NP-Z2-9]{6}/)?.[0];
  const playerB = await contextB.newPage();
  await playerB.goto(`/room/${code}`);
  await playerB.getByLabel("Display name").fill("Ben");
  await playerB.getByRole("button", { name: "Join room" }).click();
  await playerA.getByRole("button", { name: "I'm ready" }).click();
  await playerB.getByRole("button", { name: "I'm ready" }).click();

  for (const page of [playerA, playerB]) {
    const hand = page.locator(".hand [data-card-id]");
    await expect(hand).toHaveCount(6);
    for (const index of [0, 1, 2]) await hand.nth(index).click();
    await page.getByRole("button", { name: "Lock in cards" }).click();
  }
  await expect(playerA.locator(".deck-stack button")).toBeEnabled();
  await expect(playerB.locator(".deck-stack button")).toBeEnabled();

  // The original "network mismatch" bug: the second simultaneous draw was rejected as stale.
  await Promise.all([
    playerA.locator(".deck-stack button").click(),
    playerB.locator(".deck-stack button").click(),
  ]);
  for (const page of [playerA, playerB]) {
    await expect(page.locator(".hand [data-card-id]")).toHaveCount(4);
    await expect(page.locator(".opponent-hand .card--back")).toHaveCount(4);
    await expect(page.locator(".toast")).toHaveCount(0);
  }

  await contextA.close();
  await contextB.close();
});
