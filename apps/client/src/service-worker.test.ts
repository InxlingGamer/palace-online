import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

async function workerWithFullCache() {
  const put = vi.fn().mockRejectedValue(new Error("Quota exceeded"));
  const match = vi.fn().mockResolvedValue(new Response("old offline shell"));
  vi.stubGlobal("__BUILD_ID__", "test");
  vi.stubGlobal("__PRECACHE__", ["/"]);
  const listeners = new Map<string, (event: { waitUntil(work: Promise<unknown>): void }) => void>();
  vi.stubGlobal(
    "addEventListener",
    (name: string, listener: (event: { waitUntil(work: Promise<unknown>): void }) => void) =>
      listeners.set(name, listener),
  );
  const skipWaiting = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("skipWaiting", skipWaiting);
  vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue({ put, match }) });
  const response = new Response("fresh network body", { headers: { "X-Palace-App": "1" } });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
  return { worker: await import("./sw/service-worker"), put, match, listeners, skipWaiting };
}

it("keeps the previous worker when precache writes reject", async () => {
  // A failed install leaves the old worker and its complete cache in charge; activating with a
  // half-empty cache would delete the working one and break offline launches.
  const { listeners, put, skipWaiting } = await workerWithFullCache();
  const work: Promise<unknown>[] = [];
  listeners.get("install")!({
    waitUntil: (promise) => {
      work.push(promise);
    },
  });
  await expect(work[0]).rejects.toThrow();
  expect(put).toHaveBeenCalledOnce();
  expect(skipWaiting).not.toHaveBeenCalled();
});

it("returns the fresh navigation shell when cache.put rejects", async () => {
  const { worker, put, match } = await workerWithFullCache();
  const response = await worker.navigate(new Request("https://palace.test/room/ABC234"));
  expect(response.ok).toBe(true);
  expect(await response.text()).toBe("fresh network body");
  expect(put).toHaveBeenCalledOnce();
  expect(match).not.toHaveBeenCalled();
});

it.each([false, true])(
  "returns the fresh static response when cache.put rejects (cache first: %s)",
  async (cacheFirst) => {
    const { worker, put, match } = await workerWithFullCache();
    match.mockResolvedValue(undefined);
    const response = await worker.staticGet(
      new Request("https://palace.test/cards/back.svg"),
      cacheFirst,
    );
    expect(response.ok).toBe(true);
    expect(await response.text()).toBe("fresh network body");
    expect(put).toHaveBeenCalledOnce();
    expect(match).toHaveBeenCalledTimes(cacheFirst ? 1 : 0);
  },
);
