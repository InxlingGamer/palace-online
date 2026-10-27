import { serverRestarted } from "./server-wake";

export function rejoinNotice(stored: string | null, current: string | null): string {
  return serverRestarted(stored, current)
    ? "Your last table closed while the server was asleep. Create or join a new one."
    : "Your last table ended.";
}
