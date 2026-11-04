import { type Page } from "@playwright/test";
import { type FlyerEditorDriver } from "../flyer-editor.ts";
import { partialDriver } from "./pending.ts";

/** Only what is of the whole app: the slice of the flyer editor brings the rest. */
export function createReactFlyerEditorDriver(page: Page): FlyerEditorDriver {
  return partialDriver<FlyerEditorDriver>("flyerEditor", {
    latestNotice: async () => {
      const notice = page.getByRole("status").and(page.locator("[data-visible]"));
      return (await notice.textContent()) ?? "";
    },
    scriptRan: () => page.evaluate(() => Reflect.has(window, "__xss")),
  });
}
