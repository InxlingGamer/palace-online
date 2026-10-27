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
  // The in-game overflow checks must use the configured phone/desktop viewport too.
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

  for (const page of [playerA, playerB]) {
    expect(
      await page.evaluate(() => ({
        horizontal: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        vertical: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      })),
    ).toEqual({ horizontal: 0, vertical: 0 });
    expect(
      await page
        .locator(".hand")
        .evaluate(
          (el) =>
            getComputedStyle(el).getPropertyValue("scrollbar-width") === "none" ||
            getComputedStyle(el, "::-webkit-scrollbar").display === "none",
        ),
    ).toBe(true);
  }

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

  // Mobile-emulated WebKit on Linux CI intermittently crashes the page on reload (see the
  // scenario rejoin test). The reconnect path is browser-agnostic, so check it on desktop.
  if (!isMobile) {
    await playerA.reload();
    await expect(playerA.getByRole("button", { name: /Copy invitation/ })).toBeVisible();
    await expect(playerA.getByText("Ben", { exact: true })).toBeVisible();
  }

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

// Socket.IO connects over HTTP long-polling, then upgrades to a WebSocket (the client sends "5").
// Cutting the socket before the upgrade completes leaves the page on a long-poll that can stay
// open for the 25 s ping interval, so tests must wait for the upgrade first.
function socketUpgraded(page: Page) {
  return new Promise<void>((resolve) => {
    page.on("websocket", (socket) => {
      if (!socket.url().includes("/socket.io/")) return;
      socket.on("framesent", ({ payload }) => {
        if (payload === "5") resolve();
      });
    });
  });
}

test("socket retries show waking feedback and recover", async ({ page }) => {
  const upgraded = socketUpgraded(page);
  // Install before the socket exists so upgraded WebSockets are intercepted too.
  let blocked = false;
  const connections: Array<() => Promise<void>> = [];
  await page.routeWebSocket("**/socket.io/**", (socket) => {
    if (blocked) {
      void socket.close();
      return;
    }
    const server = socket.connectToServer();
    connections.push(async () => {
      await socket.close();
      await server.close();
    });
  });
  await page.route("**/socket.io/**", async (route) => {
    if (blocked) await route.abort();
    else await route.continue();
  });
  await page.goto("/");
  await page.getByLabel("Display name").fill("Ada");
  await page.getByRole("button", { name: "Create room" }).click();
  await expect(page.locator(".connection--connected")).toBeVisible();
  // Explicitly cover the short portrait viewport in addition to configured landscape/desktop.
  if (test.info().project.name === "iphone-portrait")
    await page.setViewportSize({ width: 430, height: 739 });
  await upgraded;
  blocked = true;
  for (const close of connections.splice(0)) await close();
  const banner = page.locator(".connection-notice");
  await expect(banner).toContainText("Reconnecting\u2026");
  await expect(banner).toContainText("Waking the table\u2026", { timeout: 6500 });
  await expect(banner).toContainText(
    "The server naps after 15 quiet minutes. This can take about a minute.",
  );
  await expect(banner).toBeInViewport();
  const bounds = (await banner.boundingBox())!;
  expect(bounds.height).toBeGreaterThanOrEqual(44);
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBe(0);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    window.dispatchEvent(new Event("offline"));
  });
  await expect(banner).toContainText("You're offline. Waiting for a connection\u2026");
  await page.evaluate(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    window.dispatchEvent(new Event("online"));
  });
  await expect(banner).toContainText("Waking the table\u2026");
  blocked = false;
  await banner.click();
  await expect(banner).toHaveCount(0);
});

for (const changedBoot of [true, false]) {
  test(`reload explains expired session (changed boot: ${changedBoot})`, async ({
    page,
    context,
  }) => {
    // Mobile-emulated WebKit on Linux CI intermittently crashes on reload (PR #3); desktop WebKit covers it.
    test.skip(
      Boolean(test.info().project.use.isMobile),
      "reload crashes mobile WebKit on Linux CI",
    );
    await page.goto("/");
    await page.getByLabel("Display name").fill("Ada");
    await page.getByRole("button", { name: "Create room" }).click();
    await expect(page.locator(".connection--connected")).toBeVisible();
    const code = new URL(page.url()).pathname.split("/").at(-1)!;
    await expect
      .poll(() => page.evaluate((room) => sessionStorage.getItem(`palace-boot-${room}`), code))
      .toBeTruthy();
    if (changedBoot)
      await page.evaluate(
        (room) => sessionStorage.setItem(`palace-boot-${room}`, "fake-old-process"),
        code,
      );
    await context.clearCookies();
    await page.reload();
    await expect(page.getByRole("status")).toHaveText(
      changedBoot
        ? "Your last table closed while the server was asleep. Create or join a new one."
        : "That saved room session has expired. Create or join another room.",
    );
  });
}

test("lobby retries a waking HTML response then enters the room", async ({ page }) => {
  let release = false;
  await page.route("**/api/rooms", async (route) => {
    if (release) await route.continue();
    else
      await route.fulfill({ status: 503, contentType: "text/html", body: "<html>Waking</html>" });
  });
  await page.goto("/");
  await page.getByLabel("Display name").fill("Ada");
  await page.getByRole("button", { name: "Create room" }).click();
  await expect(page.getByRole("button", { name: "Waking the table\u2026" })).toBeDisabled({
    timeout: 6500,
  });
  release = true;
  await expect(page.getByRole("button", { name: /Copy invitation/ })).toBeVisible();
});

for (const changedBoot of [true, false]) {
  test(`socket rejection explains expiry (changed boot: ${changedBoot})`, async ({ page }) => {
    const upgraded = socketUpgraded(page);
    let reject = false;
    const connections: Array<() => Promise<void>> = [];
    await page.routeWebSocket("**/socket.io/**", (socket) => {
      const server = socket.connectToServer();
      // Engine.IO stays connected, but Socket.IO rejects the room namespace auth.
      server.onMessage((message) => {
        if (reject && typeof message === "string" && message.startsWith("40"))
          socket.send('44{"message":"Invalid room session"}');
        else if (!(reject && typeof message === "string" && message.startsWith("42")))
          socket.send(message);
      });
      connections.push(async () => {
        await socket.close();
        await server.close();
      });
    });
    await page.route("**/socket.io/**", async (route) => {
      if (!reject) {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      const body = await response.text();
      await route.fulfill({
        response,
        body: body
          .split("\x1e")
          .filter((packet) => !packet.startsWith("42"))
          .map((packet) =>
            packet.startsWith("40") ? '44{"message":"Invalid room session"}' : packet,
          )
          .join("\x1e"),
      });
    });
    await page.goto("/");
    await page.getByLabel("Display name").fill("Ada");
    await page.getByRole("button", { name: "Create room" }).click();
    await expect(page.locator(".connection--connected")).toBeVisible();
    const code = new URL(page.url()).pathname.split("/").at(-1)!;
    if (changedBoot)
      await page.evaluate(
        (room) => sessionStorage.setItem(`palace-boot-${room}`, "fake-old-process"),
        code,
      );
    await upgraded;
    reject = true;
    for (const close of connections.splice(0)) await close();
    await expect(page.locator(".action-dock")).toContainText(
      changedBoot ? "Table closed" : "Room expired",
    );
    await expect(page.locator(".action-dock")).toContainText(
      changedBoot
        ? "The server restarted while the table was quiet, so this game ended. Start a new table from home."
        : "The table could not be restored.",
    );
  });
}

test("reload progress reports a waking server and recovers", async ({ page }) => {
  // Mobile-emulated WebKit on Linux CI intermittently crashes on reload (PR #3); desktop WebKit covers it.
  test.skip(Boolean(test.info().project.use.isMobile), "reload crashes mobile WebKit on Linux CI");
  await page.goto("/");
  await page.getByLabel("Display name").fill("Ada");
  await page.getByRole("button", { name: "Create room" }).click();
  await expect(page.locator(".connection--connected")).toBeVisible();
  let release = false;
  await page.route("**/api/rooms/*/reconnect", async (route) => {
    if (release) await route.continue();
    else
      await route.fulfill({ status: 200, contentType: "text/html", body: "<html>Waking</html>" });
  });
  await page.reload();
  await expect(page.getByRole("status")).toHaveText("Reconnecting\u2026");
  await expect(page.getByRole("status")).toHaveText("Waking the table\u2026", { timeout: 6500 });
  release = true;
  await expect(page.locator(".connection--connected")).toBeVisible();
});
