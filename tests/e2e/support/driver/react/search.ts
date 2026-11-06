// The search of screens as a person uses it: Cmd/Ctrl+K, writing, the arrows, Enter or a touch.
import { type Locator, type Page } from "@playwright/test";
import { type SearchDriver } from "../search.ts";

const PROMPT = "Buscar una pantalla o función";
const ENTRY_TIMEOUT_MS = 25_000;
const PLATFORMS = { windows: "Win32", mac: "MacIntel" } as const;

function panel(page: Page): Locator {
  return page.getByRole("dialog", { name: "Buscador de pantallas" });
}

function field(page: Page): Locator {
  return panel(page).getByRole("combobox", { name: PROMPT });
}

function results(page: Page): Locator {
  return panel(page).getByRole("listbox", { name: "Resultados" });
}

async function search(page: Page, text: string): Promise<void> {
  if (!(await panel(page).isVisible())) await page.keyboard.press("Control+k");
  await field(page).fill(text);
}

/**
 * What the button of the header says on that system: the same session, in another tab of the browser
 * that says it is that system.
 */
async function shortcutLabelOn(page: Page, system: keyof typeof PLATFORMS): Promise<string> {
  const other = await page.context().newPage();
  try {
    await other.addInitScript((platform) => {
      Object.defineProperty(navigator, "platform", { value: platform, configurable: true });
    }, PLATFORMS[system]);
    await other.goto(page.url());
    const button = other.getByRole("banner").getByRole("button", { name: PROMPT });
    await button.waitFor({ timeout: ENTRY_TIMEOUT_MS });
    return ((await button.locator("kbd").textContent()) ?? "").trim();
  } finally {
    await other.close();
  }
}

/** Leaves the session as a person does, and presses the key at the entry. */
async function shortcutWithoutSession(page: Page) {
  await page
    .getByRole("banner")
    .getByRole("button", { name: /^Menú de / })
    .click();
  await page
    .getByRole("menu", { name: "Tu cuenta" })
    .getByRole("menuitem", { name: "Salir" })
    .click();
  await page.getByRole("banner").waitFor({ state: "detached", timeout: ENTRY_TIMEOUT_MS });
  const appKeptTheKey = await page.evaluate(() => {
    const key = new KeyboardEvent("keydown", {
      key: "k",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(key);
    return key.defaultPrevented;
  });
  return { opened: await panel(page).isVisible(), appKeptTheKey };
}

export function createReactSearchDriver(page: Page): SearchDriver {
  return {
    search: (text) => search(page, text),
    goTo: async (text) => {
      await search(page, text);
      await page.keyboard.press("Enter");
    },
    results: () => results(page).locator('[data-part="title"]').allTextContents(),
    resultLines: () => results(page).getByRole("option").allTextContents(),
    groups: () => results(page).locator('[role="presentation"]').allTextContents(),
    markedResult: () =>
      results(page)
        .getByRole("option")
        .evaluateAll((rows) =>
          rows.findIndex((row) => row.getAttribute("aria-selected") === "true"),
        ),
    shortcutLabelOn: (system) => shortcutLabelOn(page, system),
    shortcutWithoutSession: () => shortcutWithoutSession(page),
    injectedMarkup: async () => ({
      ranScript: await page.evaluate(() => Boolean(Reflect.get(window, "__xss"))),
      imageInList: (await results(page).locator("img").count()) > 0,
    }),
    // A flyer name never arrives with < or >: they are taken out when the list of flyers is read and
    // when it is saved, and only a back door would put them. The spec that asks for it stays without
    // @react; "the name of a flyer that arrives with markup…" checks the same with real data.
    nameFirstFlyer: () => {
      throw new Error(
        "In React a flyer name cannot hold < or >: they are filtered on arrival, as in the current app.",
      );
    },
    panelColors: () =>
      panel(page).evaluate((element) => {
        const style = getComputedStyle(element);
        return { background: style.backgroundColor, text: style.color };
      }),
    panelLayout: async () => {
      await field(page).waitFor();
      return panel(page).evaluate((element) => {
        const box = element.getBoundingClientRect();
        const input = element.querySelector("input");
        return {
          left: box.left,
          right: box.right,
          windowWidth: window.innerWidth,
          pageWidth: document.documentElement.scrollWidth,
          fieldFontSizePx: input ? Number.parseFloat(getComputedStyle(input).fontSize) : 0,
        };
      });
    },
  };
}
