import { type Page } from "@playwright/test";
import { type FlyerEditorDriver } from "../flyer-editor.ts";

const BAR = "#fg-optbar";
const OTHERS_BUTTON = `${BAR} .fgo-mas`;
const BAR_TIMEOUT_MS = 10_000;
const AFTER_STAR_MS = 300;
const PRESSES_TO_RENAME = 4;
const HOLD_TO_LIFT_MS = 4_200;

export function createOptionBar(
  page: Page,
): Pick<
  FlyerEditorDriver,
  | "waitForOthersButton"
  | "optionBar"
  | "openOtherFlyers"
  | "otherFlyers"
  | "searchOtherFlyers"
  | "toggleFavorite"
  | "chooseFavorite"
  | "waitForOptionSelected"
  | "addDraftTab"
  | "removeDraftTab"
  | "draftTabLayout"
  | "barSplit"
  | "optionsOfTab"
  | "favoritesAfterStarring"
  | "renameFlyerTab"
  | "dragFlyerTab"
  | "flyerTabNames"
> {
  return {
    waitForOthersButton: async () => {
      await page.locator(OTHERS_BUTTON).waitFor({ timeout: BAR_TIMEOUT_MS });
    },
    optionBar: () =>
      page.evaluate((barSelector) => {
        const bar = document.querySelector<HTMLElement>(barSelector);
        if (!bar) throw new Error("The flyer bar is not on screen");
        const others = bar.querySelector(".fgo-mas");
        const favorite = bar.querySelector(".fgo-fav");
        return {
          tabs: [...bar.querySelectorAll(".fgo")].map((tab) => tab.textContent),
          favorite: favorite?.textContent ?? null,
          favoriteSelected: favorite?.classList.contains("on") === true,
          hasEmptyFavorite: bar.querySelector(".fgo-vacio") !== null,
          others: (others?.getAttribute("data-otras") ?? "").split(",").filter(Boolean).map(Number),
          othersLabel: others?.querySelector(".fgo-mas-t")?.textContent ?? "",
          othersSelected: others?.classList.contains("on") === true,
          buttons: bar.querySelectorAll(".fgo,.fgo-mas,.fgo-vacio").length,
          fitsItsWidth: bar.scrollWidth <= bar.clientWidth + 1,
          height: bar.getBoundingClientRect().height,
        };
      }, BAR),
    openOtherFlyers: () => page.locator(OTHERS_BUTTON).click(),
    otherFlyers: () =>
      page.evaluate(() => {
        const list = document.querySelector<HTMLElement>("#fg-optmas");
        const search = document.querySelector<HTMLInputElement>("#fg-optmas-q");
        return {
          open: Boolean(list) && !list?.hidden,
          items: [...document.querySelectorAll("#fg-optmas .fgm-it .fgm-t")].map(
            (item) => item.textContent,
          ),
          hasSearchBox: Boolean(search) && !search?.hidden,
          searchBoxFocused: document.activeElement === search,
          starred: [...document.querySelectorAll("#fg-optmas .fgm-st.on")].map((star) =>
            Number(star.getAttribute("data-o")),
          ),
        };
      }),
    searchOtherFlyers: (text) => page.locator("#fg-optmas-q").fill(text),
    toggleFavorite: async (option) => {
      await page.locator(`#fg-optmas .fgm-st[data-o="${String(option)}"]`).click();
      await page.waitForTimeout(AFTER_STAR_MS);
    },
    chooseFavorite: () => page.locator(`${BAR} .fgo-fav`).click(),
    waitForOptionSelected: async (option) => {
      await page.waitForFunction((n) => _optN(_fgOpt) === n && !_fgOptCargando(), option, {
        timeout: BAR_TIMEOUT_MS,
      });
    },
    addDraftTab: ({ id, option, name }) =>
      page.evaluate(
        (tab) => {
          _fgProtos.push({
            id: tab.id,
            opcion: tab.option,
            nombre: tab.name,
            temp: true,
            logos: [],
          });
          _facSyncOptBar();
          _fgRenderOptBar();
        },
        { id, option, name },
      ),
    removeDraftTab: (id) =>
      page.evaluate((draft) => {
        _fgProtos = _fgProtos.filter((candidate) => candidate.id !== draft);
        _facSyncOptBar();
        _fgRenderOptBar();
      }, id),
    draftTabLayout: (id) =>
      page.evaluate(
        ({ draft, barSelector }) => {
          const bar = document.querySelector(barSelector);
          const tab = bar?.querySelector(`.fgp[data-p="${draft}"]`);
          return {
            width: Math.round(tab?.getBoundingClientRect().width ?? 0),
            barFits: (bar?.scrollWidth ?? 0) <= (bar?.clientWidth ?? 0) + 1,
          };
        },
        { draft: id, barSelector: BAR },
      ),
    barSplit: (favorites, options) =>
      page.evaluate(
        ({ current, enabled }) => {
          _fgFav = current;
          const parts = _fgOptPartes(enabled);
          return parts ? { favorite: parts.fav, others: parts.otras.length } : null;
        },
        { current: favorites, enabled: options },
      ),
    optionsOfTab: (tab) => page.evaluate((name) => _facOptsDe(name), tab),
    renameFlyerTab: async (option, name) => {
      const tab = page.locator(`${BAR} .fgo[data-o="${String(option)}"]`);
      for (let press = 0; press < PRESSES_TO_RENAME; press += 1) await tab.click();
      await tab.locator("input").fill(name);
      await page.keyboard.press("Enter");
    },
    dragFlyerTab: async (option, over) => {
      const box = await page.locator(`${BAR} .fgo[data-o="${String(option)}"]`).boundingBox();
      const target = await page.locator(`${BAR} .fgo[data-o="${String(over)}"]`).boundingBox();
      if (!box || !target) throw new Error("The flyers are not on the bar");
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(HOLD_TO_LIFT_MS);
      await page.mouse.move(target.x + target.width - 4, target.y + target.height / 2, {
        steps: 4,
      });
      await page.mouse.up();
    },
    flyerTabNames: () => page.locator(`${BAR} .fgo`).allInnerTexts(),
    favoritesAfterStarring: (current, option) =>
      page.evaluate(
        ({ favorites, star }) => {
          _fgFav = favorites;
          fgOptFav(star);
          return [..._fgFav];
        },
        { favorites: current, star: option },
      ),
  };
}
