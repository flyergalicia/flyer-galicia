import { setTimeout as sleep } from "node:timers/promises";

const POLL_INTERVAL_MS = 100;
const DEFAULT_TIMEOUT_MS = 8000;

/**
 * Waits for something the app does in the background, such as answering the cloud. It never
 * fails by itself: the check that follows reads the value and says what went wrong.
 */
export async function settled(
  condition: () => boolean | Promise<boolean>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  const attempts = Math.ceil(timeoutMs / POLL_INTERVAL_MS);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await condition()) return;
    await sleep(POLL_INTERVAL_MS);
  }
}

/** Average distance between two pixel samples of the same size. */
export function meanDifference(first: readonly number[], second: readonly number[]): number {
  let total = 0;
  for (const [index, value] of first.entries()) {
    total += Math.abs(value - (second[index] ?? 0));
  }
  return total / first.length;
}

export interface Gate {
  promise: Promise<void>;
  open: () => void;
}

/** Something a test keeps closed until it decides, to hold an answer of the cloud. */
export function gate(): Gate {
  const opener: { open?: () => void } = {};
  const promise = new Promise<void>((resolve) => {
    opener.open = resolve;
  });
  return { promise, open: () => opener.open?.() };
}
