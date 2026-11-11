import { chromium, type LaunchOptions } from "@playwright/test";
import { fileURLToPath } from "node:url";

// macOS takes classic scrollbars while a mouse is connected and overlay ones when it is not, and the
// classic ones move what the images show: they narrow a centered flyer and widen every `<select>`.
// The reference was recorded with overlay ones, so the browser always starts with them. It cannot go
// through `args`: the setting takes two words, and Playwright reads the second one as a page to open.
const WRAPPER = fileURLToPath(new URL("./overlay-scrollbars.sh", import.meta.url));
const CHROMIUM_PATH = /^(.*)\/chromium-(\d+)\/chrome-(mac-[^/]+)\//;

function headlessShellNextTo(chromiumPath: string): string {
  const parts = CHROMIUM_PATH.exec(chromiumPath);
  if (!parts) throw new Error(`Chromium is not where it used to be: ${chromiumPath}`);
  const [, cache, revision, platform] = parts;
  return `${cache}/chromium_headless_shell-${revision}/chrome-headless-shell-${platform}/chrome-headless-shell`;
}

export function overlayScrollbarsLaunch(): LaunchOptions {
  if (process.platform !== "darwin") return {};
  const chromiumPath = chromium.executablePath();
  process.env.FLYER_CHROMIUM = chromiumPath;
  process.env.FLYER_HEADLESS_SHELL = headlessShellNextTo(chromiumPath);
  return { executablePath: WRAPPER };
}
