export type BootDecision = "continue" | "loading" | "waking" | "offline" | "reload";
export function bootDecision({
  online,
  healthy,
  elapsed,
  buildId,
  bundleId,
  reloaded,
}: {
  online: boolean;
  healthy: boolean;
  elapsed: number;
  buildId: string | null;
  bundleId: string;
  reloaded: boolean;
}): BootDecision {
  if (!online) return "offline";
  if (!healthy) return elapsed >= 1500 ? "waking" : "loading";
  if (buildId && bundleId !== "dev" && buildId !== bundleId && !reloaded) return "reload";
  return "continue";
}

export async function checkHealth(signal: AbortSignal): Promise<{ buildId: string | null } | null> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  // Longer than the 1.5 s reveal so a slow but awake server on a weak network still gets through.
  const timeout = setTimeout(abort, 5000);
  try {
    if (signal.aborted) return null;
    const response = await fetch("/healthz", { cache: "no-store", signal: controller.signal });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (!body || typeof body !== "object") return null;
    return { buildId: "buildId" in body && typeof body.buildId === "string" ? body.buildId : null };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
}

const reloads = new Set<string>();
export function wasReloaded(buildId: string | null): boolean {
  if (!buildId) return false;
  try {
    return sessionStorage.getItem(`palace-build-${buildId}`) === "true" || reloads.has(buildId);
  } catch {
    return reloads.has(buildId);
  }
}
export function rememberReload(buildId: string): boolean {
  reloads.add(buildId);
  try {
    sessionStorage.setItem(`palace-build-${buildId}`, "true");
    return true;
  } catch {
    return false;
  } // Without a durable guard, continue instead of risking a reload loop.
}
