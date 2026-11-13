import { afterEach, describe, expect, it, vi } from "vitest";
import { bootDecision, checkHealth, rememberReload, wasReloaded } from "./boot";

const base = {
  online: true,
  healthy: false,
  elapsed: 0,
  buildId: null,
  bundleId: "old",
  reloaded: false,
};
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("boot decisions", () => {
  it("waits silently, then shows waking, with offline taking priority", () => {
    expect(bootDecision(base)).toBe("loading");
    expect(bootDecision({ ...base, elapsed: 1500 })).toBe("waking");
    expect(bootDecision({ ...base, online: false })).toBe("offline");
    expect(bootDecision({ ...base, healthy: true })).toBe("continue");
  });
  it("reloads a changed build once, excluding dev and missing identities", () => {
    const healthy = { ...base, healthy: true, buildId: "new" };
    expect(bootDecision(healthy)).toBe("reload");
    expect(bootDecision({ ...healthy, reloaded: true })).toBe("continue");
    expect(bootDecision({ ...healthy, bundleId: "dev" })).toBe("continue");
    expect(bootDecision({ ...healthy, bundleId: "new" })).toBe("continue");
    expect(bootDecision({ ...healthy, buildId: null })).toBe("continue");
  });
  it("persists a reload guard and avoids reload without session storage", () => {
    const entries = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => entries.get(key),
      setItem: (key: string, value: string) => entries.set(key, value),
    });
    expect(wasReloaded("test-build")).toBe(false);
    expect(rememberReload("test-build")).toBe(true);
    expect(entries.get("palace-build-test-build")).toBe("true");
    expect(wasReloaded("test-build")).toBe(true);
    vi.stubGlobal("sessionStorage", {
      setItem: () => {
        throw new Error();
      },
    });
    expect(rememberReload("blocked-storage")).toBe(false);
  });
  it("rejects foreign HTML, failed health and times out a stalled request", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response("Render loading"))
        .mockResolvedValueOnce(new Response("{}", { status: 503 }))
        .mockResolvedValueOnce(Response.json({ buildId: "new" })),
    );
    const signal = new AbortController().signal;
    expect(await checkHealth(signal)).toBeNull();
    expect(await checkHealth(signal)).toBeNull();
    expect(await checkHealth(signal)).toEqual({ buildId: "new" });
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) =>
            init.signal!.addEventListener("abort", () => reject(new Error("timeout"))),
          ),
      ),
    );
    let settled = false;
    const pending = checkHealth(signal).finally(() => (settled = true));
    // A slow but awake server still has time to answer after the 1.5 s waking reveal.
    await vi.advanceTimersByTimeAsync(1500);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(3500);
    expect(await pending).toBeNull();
  });
});
