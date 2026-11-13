const fallback = new Map<string, string>();

export function loadSaved(key: string): string | null {
  try {
    return localStorage.getItem(key) ?? fallback.get(key) ?? null;
  } catch {
    return fallback.get(key) ?? null;
  }
}

export function saveSaved(key: string, value: string): void {
  fallback.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Keep the value in memory when storage is unavailable. */
  }
}

export function clearSaved(key: string): void {
  fallback.delete(key);
  try {
    localStorage.removeItem(key);
  } catch {
    /* Storage may be blocked. */
  }
}

export function markPresented(key: string): void {
  const prefix = key.startsWith("palace-deal-") ? "palace-deal-" : "palace-result-";
  const indexKey = "palace-recent-" + prefix;
  let recent: string[] = [];
  try {
    const parsed: unknown = JSON.parse(loadSaved(indexKey) ?? "[]");
    if (Array.isArray(parsed))
      recent = parsed.filter(
        (entry): entry is string =>
          typeof entry === "string" && entry.startsWith(prefix) && entry !== key,
      );
  } catch {
    /* Recover an invalid index on the next write. */
  }
  const keys = [...fallback.keys()];
  try {
    keys.push(...Object.keys(localStorage));
  } catch {
    /* Prune memory too. */
  }
  recent = [...new Set([key, ...recent, ...keys.filter((entry) => entry.startsWith(prefix))])];
  for (const old of recent.slice(10)) clearSaved(old);
  saveSaved(key, "true");
  saveSaved(indexKey, JSON.stringify(recent.slice(0, 10)));
}

export const savedName = () => loadSaved("palace-name") ?? "";
export const savedRoom = () => loadSaved("palace-last-room");
export const forgetRoom = () => clearSaved("palace-last-room");
export function rememberRoom(room: string, name?: string): void {
  saveSaved("palace-last-room", room);
  if (name !== undefined) saveSaved("palace-name", name);
}
