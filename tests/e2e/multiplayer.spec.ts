import { expect, test, type BrowserContext, type Page } from "@playwright/test";

async function createPlayer(context: BrowserContext, name: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto("/");
  await page.getByLabel("Display name").fill(name);
  await page.getByRole("button", { name: "Create a room" }).click();
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

  for (const page of [playerA, playerB]) {
    await expect(page.getByText("Choose your fortress")).toBeVisible();
    const hand = page.locator(".hand [data-card-id]");
    await expect(hand).toHaveCount(6);
    await hand.nth(0).click();
    await hand.nth(1).click();
    await hand.nth(2).click();
    await page.getByRole("button", { name: "Lock in cards" }).click();
  }

  await expect(playerA.getByText(/turn$/i).first()).toBeVisible();
  await expect(playerB.locator(".opponent-hand .card--back")).toHaveCount(3);
  await expect(playerB.locator(".opponent-hand")).not.toContainText(/[2-9JQKA]/);

  await playerA.reload();
  await expect(playerA.getByRole("button", { name: /Copy invitation/ })).toBeVisible();
  await expect(playerA.getByText("Ben", { exact: true })).toBeVisible();

  await contextA.close();
  await contextB.close();
});

test("touch viewport keeps primary controls reachable", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Display name")).toBeInViewport();
  await expect(page.getByRole("button", { name: "Create a room" })).toBeInViewport();
});
