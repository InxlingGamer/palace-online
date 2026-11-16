// The client's health check. The server also answers /healthz for Render, but some desktop
// blockers and extensions refuse any root path starting with /health, which left the boot
// gate on "Waking the table…" forever.
export const WAKE_PATH = "/api/wake";
export const WAKING_DELAY_MS = 4000;
export const WAKING_FAILURE = "The server is still waking up. Try again in a moment.";

export function wakingBanner(
  connected: boolean,
  unreachableSince: number | null,
  now: number,
  online: boolean,
  retrying = true,
): "hidden" | "offline" | "stopped" | "reconnecting" | "waking" {
  if (!online) return "offline";
  if (connected) return "hidden";
  // Socket.IO gives up after a server-side disconnect; only a tap reconnects.
  if (!retrying) return "stopped";
  return unreachableSince !== null && now - unreachableSince > WAKING_DELAY_MS
    ? "waking"
    : "reconnecting";
}

export function serverRestarted(stored: string | null, current: string | null): boolean {
  return Boolean(stored && current && stored !== current);
}
