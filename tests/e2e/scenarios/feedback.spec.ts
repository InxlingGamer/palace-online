import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
} from "@playwright/test";

const scenario = process.env.TEST_GAME_SCENARIO;

interface Players {
  contextA: BrowserContext;
  contextB: BrowserContext;
  playerA: Page;
  playerB: Page;
}

async function createReadyGame(
  browser: Browser,
  overrides: BrowserContextOptions = {},
): Promise<Players> {
  const { viewport, isMobile, hasTouch, deviceScaleFactor, userAgent } = test.info().project.use;
  const options = {
    ...(viewport !== undefined ? { viewport } : {}),
    ...(isMobile !== undefined ? { isMobile } : {}),
    ...(hasTouch !== undefined ? { hasTouch } : {}),
    ...(deviceScaleFactor !== undefined ? { deviceScaleFactor } : {}),
    ...(userAgent !== undefined ? { userAgent } : {}),
    ...overrides,
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
  if (scenario === "big-hand") {
    await expect(playerA.locator(".hand [data-card-id]")).toHaveCount(26);
    await expect(playerB.locator(".hand [data-card-id]")).toHaveCount(5);
  } else if (scenario === "seven-restriction") {
    await expect(playerA.locator('.hand [data-card-rank="7"]')).toBeVisible();
  } else if (scenario === "blind-pickup") {
    await expect(playerA.locator('.play-stack [data-card-rank="A"]')).toBeVisible();
    await expect(playerA.locator(".hand [data-card-id]")).toHaveCount(0);
    await expect(playerB.locator(".opponent-hand .card--back")).toHaveCount(0);
  } else if (scenario === "pickup-anytime") {
    await expect(playerA.locator('.play-stack [data-card-rank="8"]')).toBeVisible();
    for (const page of [playerA, playerB])
      await expect(page.locator(".hand [data-card-id]")).toHaveCount(2);
    await expect(playerA.locator('.hand [data-card-rank="9"]')).toBeVisible();
    await expect(playerB.locator('.hand [data-card-rank="Q"]')).toBeVisible();
  } else if (scenario === "final-play") {
    await expect(playerA.locator(".hand [data-card-id]")).toHaveCount(1);
    await expect(playerA.locator('.hand [data-card-rank="10"]')).toBeVisible();
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
      x: window.scrollX,
      y: window.scrollY,
    })),
  ).toEqual({ horizontal: 0, vertical: 0, x: 0, y: 0 });
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
      // Mobile-emulated WebKit on Linux CI intermittently crashes the page on reload, even with
      // reduced motion. The rejoin check depends only on sessionStorage, so run it on desktop.
      if (test.info().project.use.isMobile) return;
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

test.describe("big-hand", () => {
  test.skip(scenario !== "big-hand", "Different deterministic scenario");

  async function positionCard(page: Page, index: number) {
    await page.locator(".hand").evaluate((el, index) => {
      const card = el.querySelectorAll<HTMLElement>("[data-card-id]")[index]!;
      const box = el.getBoundingClientRect();
      el.scrollLeft += card.getBoundingClientRect().left - box.left - el.clientWidth / 2;
    }, index);
    await settleScroll(page);
  }

  // A touch during the preceding scroll's 80 ms glide window must be rejected, and WebKit can
  // deliver the scroll event well after scrollLeft is set, so wait for 120 ms without scrolling.
  async function settleScroll(page: Page) {
    await page.locator(".hand").evaluate(
      (el) =>
        new Promise<void>((resolve) => {
          let last = performance.now();
          const onScroll = () => (last = performance.now());
          el.addEventListener("scroll", onScroll, { passive: true });
          const check = () => {
            if (performance.now() - last > 120) {
              el.removeEventListener("scroll", onScroll);
              resolve();
            } else requestAnimationFrame(check);
          };
          requestAnimationFrame(() => requestAnimationFrame(check));
        }),
    );
  }

  async function tapCard(page: Page, index: number) {
    const card = page.locator(".hand [data-card-id]").nth(index);
    const box = (await card.boundingBox())!;
    await page.touchscreen.tap(box.x + 12, box.y + 15);
  }

  async function expectCardInside(page: Page, index: number) {
    await expect
      .poll(() =>
        page.locator(".hand").evaluate((el, index) => {
          const box = el.getBoundingClientRect();
          const card = el.querySelectorAll("[data-card-id]")[index]!.getBoundingClientRect();
          return card.left >= box.left - 1 && card.right <= box.right + 1;
        }, index),
      )
      .toBe(true);
  }

  test("readable strips, dock clearance, selection badges and keyboard", async ({ browser }) => {
    const players = await createReadyGame(browser);
    const page = players.playerA;
    try {
      const mobile = !!test.info().project.use.isMobile;
      const geometry = await page.locator(".hand").evaluate((el) => {
        const cards = [...el.querySelectorAll("[data-card-id]")].map((card) =>
          card.getBoundingClientRect(),
        );
        return {
          strips: cards.slice(1).map((card, index) => card.left - cards[index]!.left),
          overflow: el.scrollWidth - el.clientWidth,
          bottom: Math.max(...cards.map((card) => card.bottom)),
          dockTop: document.querySelector(".action-dock")!.getBoundingClientRect().top,
        };
      });
      expect(Math.min(...geometry.strips)).toBeGreaterThanOrEqual(mobile ? 23.99 : 21.99);
      expect(geometry.bottom).toBeLessThanOrEqual(geometry.dockTop);
      if (!mobile) expect(geometry.overflow).toBeLessThanOrEqual(1);
      await expectNoViewportOverflow(page);
      const cards = page.locator(".hand [data-card-id]");

      if (mobile) {
        expect(geometry.overflow).toBeGreaterThan(1);
        await page.locator(".hand").evaluate((el) => {
          el.scrollLeft = el.scrollWidth;
        });
        await expectCardInside(page, 25);
        for (let index = 0; index < 26; index++) {
          await positionCard(page, index);
          await tapCard(page, index);
          await expect(cards.nth(index)).toHaveAttribute("aria-pressed", "true");
          await tapCard(page, index);
          await expect(cards.nth(index)).toHaveAttribute("aria-pressed", "false");
        }
        const eightIndices = await cards.evaluateAll((els) =>
          els.flatMap((el, index) => (el.getAttribute("data-card-rank") === "8" ? [index] : [])),
        );
        for (const side of ["right", "left"] as const) {
          const indices = side === "right" ? eightIndices : [0, 1];
          for (const index of indices) {
            await positionCard(page, index);
            await tapCard(page, index);
            await expect(cards.nth(index)).toHaveAttribute("aria-pressed", "true");
          }
          await page.locator(".hand").evaluate((el, side) => {
            el.scrollLeft = side === "right" ? 0 : el.scrollWidth;
          }, side);
          const badge = page.locator(`.hand-selected--${side}`);
          // On wider rows the first 8 can stay readable at the right edge with the hand at the start.
          await expect(badge).toHaveAccessibleName(
            side === "left" ? "Scroll to 2 selected cards" : /^Scroll to [12] selected cards?$/,
          );
          const hit = (await badge.boundingBox())!;
          expect(hit.width).toBeGreaterThanOrEqual(44);
          expect(hit.height).toBeGreaterThanOrEqual(44);
          await badge.tap();
          await expect(badge).toHaveCount(0);
          await expectCardInside(page, side === "right" ? indices[0]! : indices[1]!);
          for (const index of indices) {
            await positionCard(page, index);
            await tapCard(page, index);
          }
        }
        // A selected index in the inner (readable) half of the fade needs no badge; past the edge
        // it does.
        await positionCard(page, 5);
        await tapCard(page, 5);
        await expect(cards.nth(5)).toHaveAttribute("aria-pressed", "true");
        for (const [offset, badges] of [
          [20, 0],
          [-14, 1],
        ] as const) {
          await page.locator(".hand").evaluate((el, offset) => {
            const card = el.querySelectorAll("[data-card-id]")[5]!;
            el.scrollLeft +=
              card.getBoundingClientRect().left - el.getBoundingClientRect().left - offset;
          }, offset);
          await settleScroll(page);
          await expect(page.locator(".hand-selected--left")).toHaveCount(badges);
        }
        await positionCard(page, 5);
        await tapCard(page, 5);
        await expect(cards.nth(5)).toHaveAttribute("aria-pressed", "false");
        // Tap a strip partly covered by the left fade: it must be nudged clear.
        await page.locator(".hand").evaluate((el) => {
          const card = el.querySelectorAll("[data-card-id]")[3]!;
          el.scrollLeft += card.getBoundingClientRect().left - el.getBoundingClientRect().left - 26;
        });
        await settleScroll(page);
        const partial = (await cards.nth(3).boundingBox())!;
        await page.touchscreen.tap(partial.x + 2, partial.y + 15);
        await expect(cards.nth(3)).toHaveAttribute("aria-pressed", "true");
        await expect
          .poll(() =>
            page.locator(".hand").evaluate((el) => {
              const card = el.querySelectorAll("[data-card-id]")[3]!.getBoundingClientRect();
              return card.left - el.getBoundingClientRect().left;
            }),
          )
          .toBeGreaterThanOrEqual(31.5);
        await settleScroll(page);
        await tapCard(page, 3);
        // Singularity and reduced-motion navigation use the same badges.
        await page.emulateMedia({ reducedMotion: "reduce" });
        await positionCard(page, 0);
        await tapCard(page, 0);
        await page.locator(".hand").evaluate((el) => {
          el.scrollLeft = el.scrollWidth;
        });
        await page.getByRole("button", { name: "Scroll to 1 selected card", exact: true }).tap();
        await expectCardInside(page, 0);
        await expect(page.locator(".hand-selected")).toHaveCount(0);
        await expectNoViewportOverflow(page);
      }
      const first = cards.first();
      await first.focus();
      const before = await first.getAttribute("aria-pressed");
      await first.press("Space");
      await expect(first).toHaveAttribute("aria-pressed", before === "true" ? "false" : "true");
      await first.press("Enter");
      await expect(first).toHaveAttribute("aria-pressed", before!);
    } finally {
      await players.contextA.close();
      await players.contextB.close();
    }
  });

  test("touch/pen swipe, glide, cancellation and tap guard", async ({ browser }) => {
    const players = await createReadyGame(browser, {
      viewport: { width: 430, height: 739 },
      hasTouch: true,
      isMobile: true,
    });
    const page = players.playerA;
    try {
      const card = page.locator(".hand [data-card-id]").first();
      for (const pointerType of ["touch", "pen"]) {
        await page.locator(".hand").evaluate((el) => {
          el.scrollLeft = 0;
        });
        await settleScroll(page);
        await card.dispatchEvent("pointerdown", {
          pointerType,
          pointerId: 1,
          clientX: 100,
          clientY: 100,
        });
        await page.locator(".hand").evaluate((el) => {
          el.scrollLeft = 80;
        });
        await card.dispatchEvent("pointerup", {
          pointerType,
          pointerId: 1,
          clientX: 100,
          clientY: 100,
        });
        await card.evaluate((el) =>
          el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 })),
        );
        await expect(card).toHaveAttribute("aria-pressed", "false");

        await page.locator(".hand").evaluate((el) => el.dispatchEvent(new Event("scroll")));
        await card.dispatchEvent("pointerdown", { pointerType, pointerId: 2 });
        await card.dispatchEvent("pointerup", { pointerType, pointerId: 2 });
        await card.dispatchEvent("click", { detail: 1 });
        await expect(card).toHaveAttribute("aria-pressed", "false");
        await card.dispatchEvent("pointerdown", { pointerType, pointerId: 3 });
        await card.dispatchEvent("pointercancel", { pointerType, pointerId: 3 });
        await card.dispatchEvent("click", { detail: 1 });
        await expect(card).toHaveAttribute("aria-pressed", "false");
        await card.dispatchEvent("pointerdown", { pointerType: "mouse", pointerId: 5 });
        await card.dispatchEvent("click", { detail: 1 });
        await expect(card).toHaveAttribute("aria-pressed", "true");
        await card.press("Enter");
        // Keyboard activation must work even with a rejected gesture still recorded.
        await card.dispatchEvent("pointerdown", { pointerType, pointerId: 6 });
        await card.dispatchEvent("pointercancel", { pointerType, pointerId: 6 });
        await card.press("Space");
        await expect(card).toHaveAttribute("aria-pressed", "true");
        await card.press("Enter");
        await expect(card).toHaveAttribute("aria-pressed", "false");
        await positionCard(page, 0);
        await card.dispatchEvent("pointerdown", { pointerType, pointerId: 4 });
        await card.dispatchEvent("pointerup", { pointerType, pointerId: 4 });
        await card.dispatchEvent("click", { detail: 1 });
        await expect(card).toHaveAttribute("aria-pressed", "true");
        await card.press("Enter");
      }
      expect(
        await card.evaluate((el) =>
          el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })),
        ),
      ).toBe(false);
      await expectNoViewportOverflow(page);
    } finally {
      await players.contextA.close();
      await players.contextB.close();
    }
  });

  test("native touch glide and frame timing in mobile Chromium", async ({ browser }) => {
    test.skip(test.info().project.name !== "desktop-chromium", "CDP requires Chromium");
    const players = await createReadyGame(browser, {
      isMobile: true,
      hasTouch: true,
      viewport: { width: 430, height: 739 },
    });
    const page = players.playerA;
    try {
      const hand = page.locator(".hand");
      const box = (await hand.boundingBox())!;
      const cdp = await players.contextA.newCDPSession(page);
      const x = box.x + box.width - 35;
      const y = box.y + box.height / 2;
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      for (let step = 1; step <= 10; step++) {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: x - step * 20, y }],
        });
        await page.waitForTimeout(16);
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await expect.poll(() => hand.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
      await expect(page.locator('.hand [aria-pressed="true"]')).toHaveCount(0);
      await expectNoViewportOverflow(page);
      await page.waitForTimeout(400);
      const p95 = await hand.evaluate(
        (el) =>
          new Promise<number>((resolve) => {
            const intervals: number[] = [];
            let start = 0;
            let previous = 0;
            const frame = (now: number) => {
              if (!start) start = now;
              if (previous) intervals.push(now - previous);
              previous = now;
              el.scrollLeft = ((now - start) / 1000) * (el.scrollWidth - el.clientWidth);
              if (now - start < 1000) requestAnimationFrame(frame);
              else {
                intervals.sort((a, b) => a - b);
                resolve(intervals[Math.floor(intervals.length * 0.95)]!);
              }
            };
            requestAnimationFrame(frame);
          }),
      );
      expect(p95).toBeLessThan(50);
      await expectNoViewportOverflow(page);
      await cdp.detach();
    } finally {
      await players.contextA.close();
      await players.contextB.close();
    }
  });
});
