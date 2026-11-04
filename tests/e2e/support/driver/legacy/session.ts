import { type Page } from "@playwright/test";
import { type OpenSessionOptions, type SessionDriver } from "../session.ts";

const ENTRY_TIMEOUT_MS = 25_000;
const LEGACY_DEFAULT_OPTION = 9;

async function waitForEntry(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      window._fgPrevGate === false &&
      Boolean(window.baseImg) &&
      Boolean(window.cv) &&
      window._facLoaded &&
      window._opcLoaded,
    null,
    { timeout: ENTRY_TIMEOUT_MS },
  );
}

async function waitForOption(page: Page, option: number): Promise<void> {
  await page.waitForFunction(
    (n) => {
      const image = window.baseImg;
      return (
        window._fgOpt === n &&
        Boolean(image) &&
        (image?.naturalWidth ?? 0) > 0 &&
        cv.height > 1000 &&
        _fgOptCache[n]?.img === image
      );
    },
    option,
    { timeout: ENTRY_TIMEOUT_MS },
  );
}

async function open(
  page: Page,
  { role, startOption, waitUntilReady }: OpenSessionOptions,
): Promise<void> {
  await page.goto("index.html");
  if (!waitUntilReady) return;
  await waitForEntry(page);
  const option = startOption ?? LEGACY_DEFAULT_OPTION;
  // Administrators land on an option of their own; everybody else, on the first they may use.
  if (role === "admin" || startOption !== undefined) {
    await page.evaluate((n) => {
      if (_optN(_fgOpt) !== n) switchFlyerOption(n);
    }, option);
  }
  await waitForOption(page, option);
}

export function createLegacySessionDriver(page: Page): SessionDriver {
  return {
    open: (options) => open(page, options),
    status: () =>
      page.evaluate(() => ({
        signedIn: Boolean(_me),
        loginScreenVisible: document.getElementById("login-ov")?.style.display !== "none",
        stillEntering: _fgPrevGate !== false,
      })),
  };
}
