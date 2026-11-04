import { type Page } from "@playwright/test";

export const WAIT_MS = 15_000;
const POLL_MS = 100;
const SETTLED_MS = 250;
const SETTLE_LIMIT_MS = 8000;

/** Reads until the value is what is wanted, or until time is up: returns the last one read. */
export async function readUntil<Value>(
  page: Page,
  read: () => Promise<Value>,
  isDone: (value: Value) => boolean,
): Promise<Value> {
  const deadline = performance.now() + WAIT_MS;
  let value = await read();
  while (!isDone(value) && performance.now() < deadline) {
    await page.waitForTimeout(POLL_MS);
    value = await read();
  }
  return value;
}

export function textOf(page: Page, selector: string): Promise<string> {
  return page.evaluate((target) => document.querySelector(target)?.textContent ?? "", selector);
}

export function isThere(page: Page, selector: string): Promise<boolean> {
  return page
    .locator(selector)
    .first()
    .waitFor({ timeout: WAIT_MS })
    .then(
      () => true,
      () => false,
    );
}

/** The screen repaints on its own when an answer arrives, even after what was being awaited. */
export async function screenToSettle(page: Page): Promise<void> {
  const read = () =>
    page.evaluate(() => {
      const body = document.querySelector("#ges-body");
      return body && !body.querySelector(".ges-cargando") ? body.innerHTML : null;
    });
  const deadline = performance.now() + SETTLE_LIMIT_MS;
  let before = await read();
  while (performance.now() < deadline) {
    await page.waitForTimeout(SETTLED_MS);
    const now = await read();
    if (now !== null && now === before) return;
    before = now;
  }
}
