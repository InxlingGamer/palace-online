import { expect, test, type Page } from "@playwright/test";

async function controlled(page: Page) {
  await page.goto("/");
  await expect(page.getByLabel("Display name")).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
}

test("registers, controls and never caches Render's loading page", async ({
  page,
  context,
  request,
}) => {
  await controlled(page);
  expect((await request.get("/sw.js")).headers()["cache-control"]).toBe("no-cache");
  await context.route("**/healthz", (route) => route.abort());
  await context.route("http://127.0.0.1:4180/", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Render loading</h1>" }),
  );
  await page.reload();
  await expect(page.getByRole("heading", { name: "Waking the table…" })).toBeVisible();
  await expect(page.getByText("Render loading")).toHaveCount(0);
  const cached = await page.evaluate(async () => (await caches.match("/"))?.text());
  expect(cached).toContain('<div id="root">');
  expect(cached).not.toContain("Render loading");
  await context.unrouteAll();
  await expect(page.getByLabel("Display name")).toBeVisible();
});

test("launches offline from the cached shell and recovers online", async ({ page, context }) => {
  await controlled(page);
  await context.setOffline(true);
  await page.reload();
  // Chromium's offline emulation doesn't reach a document the worker served (navigator.onLine
  // reads true there), so the cached shell first shows the waking copy; a real device reports offline.
  await expect(page.getByRole("heading", { name: "Waking the table…" })).toBeVisible();
  await context.route("**/healthz", (route) => route.abort());
  await context.setOffline(false);
  await context.setOffline(true);
  await expect(
    page.getByRole("heading", { name: "You're offline. Waiting for a connection…" }),
  ).toBeVisible();
  await context.unrouteAll();
  await context.setOffline(false);
  await expect(page.getByLabel("Display name")).toBeVisible();
});

test("auto-rejoins the last seat in production", async ({ page }) => {
  await controlled(page);
  await page.getByLabel("Display name").fill("Ada");
  await page.getByRole("button", { name: "Create room" }).click();
  await expect(page.getByRole("button", { name: /Copy invitation/ })).toBeVisible();
  const roomURL = page.url();
  await page.goto("/");
  await expect(page).toHaveURL(roomURL);
  await expect(page.getByRole("button", { name: /Copy invitation/ })).toBeVisible();
});
