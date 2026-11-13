import { useEffect, useState, type ReactNode } from "react";
import { bootDecision, checkHealth, rememberReload, wasReloaded, type BootDecision } from "./boot";
import { WakingScreen } from "./WakingScreen";

export function BootGate({ children }: { children: ReactNode }) {
  const [decision, setDecision] = useState<BootDecision>(navigator.onLine ? "loading" : "offline");
  useEffect(() => {
    const controller = new AbortController();
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    let attempt = 0;
    let finished = false;
    const reveal = setTimeout(() => {
      if (!finished) setDecision(navigator.onLine ? "waking" : "offline");
    }, 1500);
    const poll = async () => {
      clearTimeout(timer);
      const attemptStarted = Date.now();
      const currentAttempt = ++attempt;
      const health = navigator.onLine ? await checkHealth(controller.signal) : null;
      if (controller.signal.aborted || currentAttempt !== attempt || finished) return;
      const next = bootDecision({
        online: navigator.onLine,
        healthy: health !== null,
        elapsed: Date.now() - started,
        buildId: health?.buildId ?? null,
        bundleId: __PALACE_BUILD__,
        reloaded: wasReloaded(health?.buildId ?? null),
      });
      if (next === "reload" && health?.buildId && rememberReload(health.buildId)) {
        window.location.reload();
        return;
      }
      finished = next === "continue" || next === "reload";
      if (finished) clearTimeout(reveal);
      setDecision(finished ? "continue" : next);
      if (!finished)
        timer = setTimeout(() => void poll(), Math.max(0, 2000 - (Date.now() - attemptStarted)));
    };
    const changed = () => {
      if (finished) return;
      if (!navigator.onLine) setDecision("offline");
      void poll();
    };
    void poll();
    window.addEventListener("online", changed);
    window.addEventListener("offline", changed);
    return () => {
      controller.abort();
      clearTimeout(timer);
      clearTimeout(reveal);
      window.removeEventListener("online", changed);
      window.removeEventListener("offline", changed);
    };
  }, []);
  if (decision === "continue") return children;
  if (decision === "loading") return <main className="loading" aria-busy="true" />;
  return <WakingScreen offline={decision === "offline"} />;
}
