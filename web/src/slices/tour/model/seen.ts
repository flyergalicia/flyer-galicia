// What a person has already seen of the tutorial (`_tourKey`, `_tourMarcarVisto`, `_tourYaVisto`):
// once per account and browser, in `fg_tour_done_<id>`. Without a place to keep it, it still works:
// it just does not remember.
const KEY_PREFIX = "fg_tour_done_";

export function tourKey(userId: string | null): string {
  return KEY_PREFIX + (userId ?? "anon");
}

export function markTourSeen(userId: string | null): void {
  try {
    localStorage.setItem(tourKey(userId), "1");
  } catch {
    // Nowhere to keep it: next time it may open again.
  }
}

export function tourSeen(userId: string | null): boolean {
  try {
    return Boolean(localStorage.getItem(tourKey(userId)));
  } catch {
    return false;
  }
}
