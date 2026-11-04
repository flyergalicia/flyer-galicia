import { type Page } from "@playwright/test";
import { type SearchDriver } from "../search.ts";

const OVERLAY = "#cmdk-fondo";
const FIELD = "#cmdk-q";
const LIST = "#cmdk-l";
const RESULT = ".cmdk-it";
const PANEL = ".cmdk";

async function search(page: Page, text: string): Promise<void> {
  if (!(await page.isVisible(OVERLAY))) await page.keyboard.press("Control+k");
  await page.fill(FIELD, text);
}

export function createLegacySearchDriver(page: Page): SearchDriver {
  return {
    search: (text) => search(page, text),
    goTo: async (text) => {
      await search(page, text);
      await page.keyboard.press("Enter");
    },
    results: () => page.locator(`${RESULT} .cmdk-tx`).allTextContents(),
    resultLines: () => page.locator(RESULT).allTextContents(),
    groups: () => page.locator(".cmdk-sec").allTextContents(),
    markedResult: () =>
      page
        .locator(RESULT)
        .evaluateAll((rows) =>
          rows.findIndex((row) => row.getAttribute("aria-selected") === "true"),
        ),
    shortcutLabelOn: (system) =>
      page.evaluate(
        (platform) => {
          Object.defineProperty(navigator, "platform", { value: platform, configurable: true });
          return _cmdTecla();
        },
        system === "windows" ? "Win32" : "MacIntel",
      ),
    shortcutWithoutSession: () =>
      page.evaluate((overlay) => {
        const headerSide = document.getElementById("hdr-right");
        if (!headerSide) throw new Error("The header is not on screen");
        const shown = headerSide.style.display;
        headerSide.style.display = "none";
        const key = new KeyboardEvent("keydown", {
          key: "k",
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        });
        window.dispatchEvent(key);
        const opened = Boolean(document.querySelector(overlay));
        headerSide.style.display = shown;
        return { opened, appKeptTheKey: key.defaultPrevented };
      }, OVERLAY),
    injectedMarkup: () =>
      page.evaluate(
        (list) => ({
          ranScript: Boolean(window.__xss),
          imageInList: Boolean(document.querySelector(`${list} img`)),
        }),
        LIST,
      ),
    nameFirstFlyer: (name) =>
      page.evaluate((text) => {
        const options: unknown = Reflect.get(globalThis, "_OPC");
        if (typeof options !== "object" || options === null) throw new Error("No flyer options");
        const first: unknown = Reflect.get(options, _facOpts()[0] ?? -1);
        if (typeof first !== "object" || first === null) throw new Error("No flyers for this user");
        Reflect.set(first, "nombre", text);
      }, name),
    panelColors: () =>
      page.locator(PANEL).evaluate((panel) => {
        const style = getComputedStyle(panel);
        return { background: style.backgroundColor, text: style.color };
      }),
    panelLayout: () =>
      page.evaluate(
        ({ panel, field }) => {
          const box = document.querySelector(panel)?.getBoundingClientRect();
          const input = document.querySelector(field);
          return {
            left: box?.left ?? -1,
            right: box?.right ?? Number.POSITIVE_INFINITY,
            windowWidth: window.innerWidth,
            pageWidth: document.documentElement.scrollWidth,
            fieldFontSizePx: input ? Number.parseFloat(getComputedStyle(input).fontSize) : 0,
          };
        },
        { panel: PANEL, field: FIELD },
      ),
  };
}
