// What was used last, first: only the ids, in `fg_cmdk_rec`. Without a place to keep them (a private
// window, storage full or blocked), the search works the same, without recent ones.

export const RECENT_KEY = "fg_cmdk_rec";
const RECENT_MAX = 5;

export function readRecent(): readonly string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(stored) ? stored.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function rememberRecent(id: string): void {
  try {
    const recent = [id, ...readRecent().filter((other) => other !== id)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
  } catch {
    // Without a place to keep it, it is simply not among the recent ones.
  }
}
