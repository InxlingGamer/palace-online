import { WAKING_DELAY_MS, WAKING_FAILURE } from "./server-wake";

export class ServerWakingError extends Error {
  constructor() {
    super(WAKING_FAILURE);
  }
}

// One deadline covers requests, response bodies, and backoff, including a hung proxy.
export async function api<T>(
  url: string,
  init: RequestInit,
  onWaking: () => void = () => {},
): Promise<T> {
  const deadline = Date.now() + 90_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  const waking = setTimeout(onWaking, WAKING_DELAY_MS + 1);
  let backoff = 500;
  try {
    while (Date.now() < deadline) {
      let response: Response | undefined;
      try {
        response = await fetch(url, {
          ...init,
          headers: { "Content-Type": "application/json", ...init.headers },
          credentials: "include",
          signal: controller.signal,
        });
      } catch {
        // A dropped connection while Render swaps processes retries; the deadline abort ends it.
        if (controller.signal.aborted) throw new ServerWakingError();
      }
      let body: (T & { error?: { message: string } }) | undefined;
      if (response && ![502, 503, 504].includes(response.status)) {
        try {
          if (response.headers.get("content-type")?.includes("application/json"))
            body = (await response.json()) as T & { error?: { message: string } };
        } catch {
          // Render can return HTML or an incomplete body while the process wakes.
        }
        // 4xx responses are answers (bad name, wrong code, rate limit), never a waking server.
        if (body === undefined && response.status >= 400 && response.status < 500)
          throw new Error(
            response.status === 429
              ? "Too many requests. Try again in a minute."
              : "Request failed.",
          );
      }
      if (response && body !== undefined) {
        if (!response.ok) throw new Error(body?.error?.message ?? "Request failed.");
        return body;
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await new Promise((resolve) => setTimeout(resolve, Math.min(backoff, remaining)));
      backoff = Math.min(backoff * 2, 5000);
    }
    throw new ServerWakingError();
  } finally {
    clearTimeout(timeout);
    clearTimeout(waking);
  }
}

const roomBootIds = new Map<string, string>();
export function storedBootId(roomCode: string): string | null {
  try {
    return sessionStorage.getItem(`palace-boot-${roomCode}`) ?? roomBootIds.get(roomCode) ?? null;
  } catch {
    return roomBootIds.get(roomCode) ?? null;
  }
}
export async function currentBootId(): Promise<string | null> {
  try {
    const response = await fetch("/healthz", {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { bootId?: unknown };
    return typeof body.bootId === "string" && body.bootId ? body.bootId : null;
  } catch {
    return null;
  }
}
export async function rememberBootId(roomCode: string): Promise<void> {
  const bootId = await currentBootId();
  if (!bootId) return;
  roomBootIds.set(roomCode, bootId);
  try {
    sessionStorage.setItem(`palace-boot-${roomCode}`, bootId);
  } catch {
    /* Keep the in-memory identity if storage is unavailable. */
  }
}
