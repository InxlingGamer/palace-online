import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ServerWakingError, currentBootId } from "./api";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("waking requests", () => {
  it.each([200, 502, 503, 504])("retries HTML/status %s and recovers", async (status) => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("<html>Waking</html>", { status }))
      .mockResolvedValueOnce(json({ ok: true }));
    vi.stubGlobal("fetch", fetcher);
    const waking = vi.fn();
    const result = api("/api/rooms", { method: "POST" }, waking);
    await vi.advanceTimersByTimeAsync(500);
    expect(await result).toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(waking).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("shows waking after four seconds and caps backoff at ninety seconds", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(() => Promise.resolve(new Response("<html>Waking</html>")));
    vi.stubGlobal("fetch", fetcher);
    const waking = vi.fn();
    const result = api("/api/rooms", { method: "POST" }, waking);
    const rejected = expect(result).rejects.toThrow(
      "The server is still waking up. Try again in a moment.",
    );
    await vi.advanceTimersByTimeAsync(4000);
    expect(waking).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(waking).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(85999);
    await rejected;
    expect(fetcher.mock.calls.length).toBeLessThan(25);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("retries gateway JSON errors too", async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json({ error: { message: "Bad gateway" } }, 502))
      .mockResolvedValueOnce(json({ ok: true }));
    vi.stubGlobal("fetch", fetcher);
    const result = api("/api/rooms", { method: "POST" });
    await vi.advanceTimersByTimeAsync(500);
    expect(await result).toEqual({ ok: true });
  });
  it("aborts a stalled fetch at the deadline", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal!.addEventListener("abort", () => reject(new Error("aborted")), {
              once: true,
            });
          }),
      ),
    );
    const result = api("/api/rooms", { method: "POST" });
    const rejected = expect(result).rejects.toBeInstanceOf(ServerWakingError);
    await vi.advanceTimersByTimeAsync(90_000);
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });
  it("does not retry JSON validation errors", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(json({ error: { message: "Enter a display name." } }, 400));
    vi.stubGlobal("fetch", fetcher);
    await expect(api("/api/rooms", { method: "POST" })).rejects.toThrow("Enter a display name.");
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("handles malformed JSON without exposing a parse error", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response("{bad", { headers: { "Content-Type": "application/json" } }),
        )
        .mockResolvedValueOnce(json({ ok: true })),
    );
    const result = api("/api/rooms", { method: "POST" });
    await vi.advanceTimersByTimeAsync(500);
    expect(await result).toEqual({ ok: true });
  });
  it("retries a dropped connection and recovers", async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(json({ ok: true }));
    vi.stubGlobal("fetch", fetcher);
    const result = api("/api/rooms", { method: "POST" });
    await vi.advanceTimersByTimeAsync(500);
    expect(await result).toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("sanitizes transport errors that last until the deadline", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const result = api("/api/rooms", { method: "POST" });
    const rejected = expect(result).rejects.toBeInstanceOf(ServerWakingError);
    await vi.advanceTimersByTimeAsync(90_000);
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });
  it("fails fast on a non-JSON 4xx such as the rate limiter", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response("Too many requests, please try again later.", { status: 429 }),
      );
    vi.stubGlobal("fetch", fetcher);
    await expect(api("/api/rooms", { method: "POST" })).rejects.toThrow("Too many requests.");
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("falls back when health is unavailable or lacks an identity", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValueOnce(new Error("offline"))
        .mockResolvedValueOnce(json({ status: "ok" }))
        .mockResolvedValueOnce(json({ bootId: "boot" })),
    );
    expect(await currentBootId()).toBeNull();
    expect(await currentBootId()).toBeNull();
    expect(await currentBootId()).toBe("boot");
  });
});
