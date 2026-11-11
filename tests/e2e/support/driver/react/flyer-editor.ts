import { createHash } from "node:crypto";
import { type Page } from "@playwright/test";
import { bucketUrl } from "../../cloud/index.ts";
import { type FlyerEditorDriver, type FlyerRegion } from "../flyer-editor.ts";
import { createReactFlyerBatches } from "./flyer-batches.ts";
import { companyField, pressOtherAction } from "./flyer-output.ts";

const OPTION_TIMEOUT_MS = 25_000;
const ZOOM_TIMEOUT_MS = 2_000;
const ZOOM_CEILING = 1.3;
const SAME_ZOOM = 0.001;

function preview(page: Page) {
  return page.getByTestId("flyer-preview");
}

export function flyerOptionButton(page: Page, option: number) {
  return page.getByTestId("flyer-options").locator(`button[data-option="${String(option)}"]`);
}

async function currentZoom(page: Page): Promise<number> {
  return page.evaluate(() => window["__flyerProbe"]?.flyerWorkspace?.().getState().zoom ?? 0);
}

/** One step of Ctrl + wheel over the preview, as a person zooms: up to the ceiling a person has. */
async function wheelToward(page: Page, wanted: number): Promise<void> {
  const box = await preview(page).boundingBox();
  if (!box) throw new Error("The preview is not on screen");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const target = Math.min(wanted, ZOOM_CEILING);
  await page.keyboard.down("Control");
  try {
    for (let current = await currentZoom(page); ; current = await currentZoom(page)) {
      if (Math.abs(current - target) < SAME_ZOOM) return;
      const goesUp = current < target;
      // It would go past: a person stays at the nearest step.
      const next = goesUp ? current * 1.25 : current / 1.25;
      const passes = goesUp ? next > target + SAME_ZOOM : next < target - SAME_ZOOM;
      if (passes && Math.abs(next - target) > Math.abs(current - target)) return;
      await page.mouse.wheel(0, goesUp ? -100 : 100);
      await page.waitForFunction(
        (before) => window["__flyerProbe"]?.flyerWorkspace?.().getState().zoom !== before,
        current,
        { timeout: ZOOM_TIMEOUT_MS },
      );
    }
  } finally {
    await page.keyboard.up("Control");
  }
}

async function downloadRegionDigest(page: Page, region: FlyerRegion): Promise<string> {
  const pixels = await page.evaluate(({ x, y, width, height }) => {
    const full = window["__flyerProbe"]?.flyerWorkspace?.().renderDownload();
    if (!full) throw new Error("There is no flyer to download");
    const crop = document.createElement("canvas");
    crop.width = width;
    crop.height = height;
    crop.getContext("2d")?.drawImage(full, x, y, width, height, 0, 0, width, height);
    return crop.toDataURL("image/png");
  }, region);
  return createHash("sha256").update(pixels).digest("hex");
}

/** Waits for that option to be on screen, finished loading, with its picture and its size. */
export async function waitForOptionShown(page: Page, option: number): Promise<void> {
  await page.waitForFunction(
    (wanted) => {
      const slot = window["__flyerProbe"]?.flyerWorkspace?.().getState().slot;
      const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="flyer-canvas"]');
      return (
        slot?.option === wanted &&
        !slot.loading &&
        !slot.failure &&
        Boolean(slot.scene) &&
        (canvas?.height ?? 0) > 1000
      );
    },
    option,
    { timeout: OPTION_TIMEOUT_MS },
  );
}

/** What that option published is what is being drawn, whichever option is chosen. */
async function showsArtworkOf(page: Page, option: number): Promise<boolean> {
  const file = bucketUrl(option === 1 ? "_active.json" : `_active${String(option)}.json`);
  return page.evaluate(
    async ({ address }) => {
      const slot = window["__flyerProbe"]?.flyerWorkspace?.().getState().slot;
      if (!slot?.scene) return false;
      const published: unknown = await (await fetch(address)).json();
      const imageUrl: unknown = Reflect.get(Object(published), "imageUrl");
      return typeof imageUrl === "string" && slot.scene.artKey === new URL(imageUrl).href;
    },
    { address: file },
  );
}

const FLYER_TABS = ["flyer", "rubros", "sueldo"];
const REDRAW_PAUSE_MS = 40;
const BUSY_TIMEOUT_MS = 60_000;
const AFTER_STAR_MS = 300;
const PRESSES_TO_RENAME = 4;
const HOLD_TO_LIFT_MS = 4_200;
const COMPANIES_ROUTE = "**/rest/v1/padron_empresas*";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };

function optionOnScreen(page: Page): Promise<number | null> {
  return page.evaluate(
    () => window["__flyerProbe"]?.flyerWorkspace?.().getState().slot.option ?? null,
  );
}

/** A person goes to its tab and chooses it. With one flyer in the tab, the tab already chooses it. */
export async function goToOption(page: Page, option: number): Promise<void> {
  const button = flyerOptionButton(page, option);
  if ((await button.isVisible()) || (await optionOnScreen(page)) === option) {
    if (await button.isVisible()) await button.click();
    return;
  }
  // With many flyers it may be in the list of "Otros".
  const others = page.getByTestId("other-flyers");
  const isInOthers = (await others.count()) > 0 && (await others.getAttribute("data-others"));
  if (isInOthers && isInOthers.split(",").includes(String(option))) {
    await others.click();
    await page.locator(`[data-option-row="${String(option)}"]`).click();
    return;
  }
  for (const tab of FLYER_TABS) {
    const header = page.getByRole("banner").locator(`[role="tab"][data-tab-id="${tab}"]`);
    if ((await header.count()) === 0) continue;
    await header.click();
    await page
      .waitForFunction(
        (wanted) => {
          const slot = window["__flyerProbe"]?.flyerWorkspace?.().getState().slot;
          return slot?.option === wanted || !slot?.loading;
        },
        option,
        { timeout: OPTION_TIMEOUT_MS },
      )
      .catch(() => undefined);
    if ((await optionOnScreen(page)) === option) return;
    if (await button.isVisible()) {
      await button.click();
      return;
    }
  }
}

/** A new page reads everything again, and a person goes back to the flyer they were on. */
export async function reloadKeepingOption(page: Page): Promise<void> {
  const option = await optionOnScreen(page);
  await page.reload();
  await page.getByRole("banner").waitFor({ timeout: OPTION_TIMEOUT_MS });
  await page.locator('[data-testid="flyer-canvas-box"]').waitFor({ timeout: OPTION_TIMEOUT_MS });
  if (option === null) return;
  await goToOption(page, option);
  await page.waitForFunction(
    () => !window["__flyerProbe"]?.flyerWorkspace?.().getState().slot.loading,
    null,
    { timeout: OPTION_TIMEOUT_MS },
  );
}

function legalField(page: Page) {
  return page.getByTestId("legal-text");
}

function downloadButton(page: Page) {
  return page.getByTestId("download-pdf");
}

/** What a person does for the flyer to be drawn again: press the cashback that is already on. */
async function redrawOnce(page: Page): Promise<void> {
  await page.locator('[data-cashback][aria-pressed="true"]').first().click();
}

async function waitUntilNotBusy(page: Page): Promise<void> {
  await page
    .locator('[data-testid="download-pdf"]:not([aria-busy="true"])')
    .waitFor({ timeout: BUSY_TIMEOUT_MS });
}

function createFormFields(page: Page) {
  return {
    fillCompanyName: (name: string) => companyField(page).fill(name),
    companyName: () => companyField(page).inputValue(),
    fillOfficerName: (name: string) => page.locator('[data-officer-field="nombre1"]').fill(name),
    setOfficer: async ({ name, phone, email }: { name: string; phone: string; email: string }) => {
      await page.locator('[data-officer-field="nombre1"]').fill(name);
      await page.locator('[data-officer-field="celular1"]').fill(phone);
      await page.locator('[data-officer-field="email1"]').fill(email);
    },
    chooseEditorTab: (name: "Individual" | "Masivo" | "Historial") =>
      page.getByRole("tablist", { name: "Modo de armado" }).getByRole("tab", { name }).click(),
    chooseCashback: (name: string) => page.locator(`[data-cashback="${name}"]`).click(),
    benefitFieldLabels: () => page.getByTestId("benefit-fields").locator("label").allInnerTexts(),
    fillBenefitName: (name: string) => page.getByTestId("benefit-name").fill(name),
    fillBenefitCap: (cap: string) => page.getByTestId("benefit-cap").fill(cap),
    legalText: () => legalField(page).inputValue(),
    fillLegal: (text: string) => legalField(page).fill(text),
    selectInLegal: async (start: number, end: number) => {
      await legalField(page).focus();
      await legalField(page).evaluate(
        (element, range) => {
          if (element instanceof HTMLTextAreaElement) element.setSelectionRange(...range);
        },
        [start, end] as [number, number],
      );
    },
    pressLegalBold: () => page.getByRole("button", { name: "Negrita" }).click(),
    pasteInLegal: (html: string, text: string) =>
      legalField(page).evaluate(
        (field, content) => {
          const clipboardData = new DataTransfer();
          clipboardData.setData("text/html", content.html);
          clipboardData.setData("text/plain", content.text);
          field.dispatchEvent(
            new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }),
          );
        },
        { html, text },
      ),
    // What was typed reaches React as a person's letters do, all in the same frame.
    typeCompanyInOneFrame: (letters: number) =>
      companyField(page).evaluate((field, count) => {
        if (!(field instanceof HTMLInputElement)) return;
        for (let letter = 0; letter < count; letter += 1) {
          // The setter of the prototype: the one of the element is React's, and it would not tell.
          Reflect.set(HTMLInputElement.prototype, "value", `${field.value}x`, field);
          field.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }, letters),
    redrawFlyer: async (times: number) => {
      for (let round = 0; round < times; round += 1) {
        await redrawOnce(page);
        await page.waitForTimeout(REDRAW_PAUSE_MS);
      }
    },
  };
}

const NOT_ARRIVING = "**/storage/v1/object/public/flyers/_active*.json*";
/** The flyer of another category: nobody can be sent to it, it only has to be there on the list. */
const ANOTHER_CATEGORY = 97;
const LOAD_TIMEOUT_MS = 25_000;

async function pressDownload(page: Page, times: number): Promise<void> {
  await downloadButton(page).evaluate((button, count) => {
    if (!(button instanceof HTMLElement)) return;
    for (let press = 0; press < count; press += 1) button.click();
  }, times);
}

/** From here on, the file says something else: what a browser that fails would do on encoding. */
function breakEncoding(page: Page) {
  return page.evaluate(() => {
    const real: unknown = Reflect.get(HTMLCanvasElement.prototype, "toDataURL");
    Reflect.set(window, "__fgRealToDataUrl", real);
    Reflect.set(HTMLCanvasElement.prototype, "toDataURL", () => {
      throw new Error("falla simulada");
    });
  });
}

function repairEncoding(page: Page) {
  return page.evaluate(() => {
    Reflect.set(HTMLCanvasElement.prototype, "toDataURL", Reflect.get(window, "__fgRealToDataUrl"));
  });
}

/** Everything real: a second flyer in another tab, and a company of the list that goes in it. */
async function prepareCategoryWarning(page: Page): Promise<void> {
  const company = await companyField(page).inputValue();
  const [list, faculties] = await page.evaluate(
    ([listAddress, facultiesAddress]) =>
      Promise.all(
        [listAddress ?? "", facultiesAddress ?? ""].map(async (address) => {
          const answer = await fetch(address);
          const file: unknown = await answer.json();
          return file;
        }),
      ),
    [bucketUrl("_opciones.json"), bucketUrl("_facultades.json")],
  );
  const opts: unknown = Reflect.get(Object(list), "opts");
  const roles: unknown = Reflect.get(Object(faculties), "roles");
  await page.route("**/_opciones.json*", (route) =>
    route.fulfill({
      json: {
        opts: [
          ...(Array.isArray(opts) ? opts : []),
          { n: ANOTHER_CATEGORY, nombre: "Otro rubro", solapa: "rubros" },
        ],
      },
      headers: CORS,
    }),
  );
  const asesor: unknown = Reflect.get(Object(roles), "asesor");
  await page.route("**/_facultades.json*", (route) =>
    route.fulfill({
      json: {
        roles: {
          ...Object(roles),
          asesor: {
            ...Object(asesor),
            padron_buscar: true,
            [`opcion_${String(ANOTHER_CATEGORY)}`]: true,
          },
        },
      },
      headers: CORS,
    }),
  );
  await page.route(COMPANIES_ROUTE, (route) =>
    route.request().method() === "GET"
      ? route.fulfill({
          json: [
            {
              empresa: company,
              cuits: [],
              config: "BAU",
              asesores: [],
              rubro: { opcion: ANOTHER_CATEGORY },
            },
          ],
          headers: CORS,
        })
      : route.fallback(),
  );
  await reloadKeepingOption(page);
  await page.waitForFunction(
    () => window["__flyerProbe"]?.companyList?.().ownCompanyCount() === 1,
    null,
    { timeout: LOAD_TIMEOUT_MS },
  );
  await companyField(page).fill(company);
}

function createDownloads(page: Page) {
  /** Forgotten, the library comes down again: what looks at that moment cannot wait for the end. */
  let isLibraryComing = false;
  return {
    // The libraries come with the app and are downloaded by the first flyer: there is no waiting.
    loadDownloadLibrary: async () => undefined,
    // A page keeps what it downloaded while it lives: a new page asks for it again.
    forgetDownloadLibrary: async () => {
      isLibraryComing = true;
      await reloadKeepingOption(page);
    },
    downloadPdf: async (times = 1) => {
      await pressDownload(page, times);
      if (isLibraryComing) isLibraryComing = false;
      else await waitUntilNotBusy(page);
    },
    downloadPng: () => pressOtherAction(page, /Descargar como imagen/),
    downloadPdfToDisk: async () => {
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        downloadButton(page).click(),
      ]);
      return download.suggestedFilename();
    },
    downloadPngToDisk: async () => {
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        pressOtherAction(page, /Descargar como imagen/),
      ]);
      return download.suggestedFilename();
    },
    otherActions: async () => {
      const box = page.getByTestId("other-actions");
      const toggle = box.getByRole("button", { name: /^Otros/ });
      await toggle.click();
      const items = await box.locator("button, [role=switch]").evaluateAll((entries) =>
        entries.flatMap((entry) => {
          const isToggle = entry.hasAttribute("aria-expanded");
          return !isToggle && entry.getClientRects().length > 0 ? [entry.textContent.trim()] : [];
        }),
      );
      await toggle.click();
      return items;
    },
    dismissAfterDownload: async () => {
      await page.waitForTimeout(500);
      const no = page.getByTestId("decision-dialog").locator('[data-decision="no"]');
      if ((await no.count()) > 0) await no.click();
    },
    // One press and the repetitions of the keyboard, with nothing else in the middle.
    holdDownloadShortcut: async () => {
      await page.keyboard.down("Control");
      await page.keyboard.down("Enter");
      await page.keyboard.down("Enter");
      await page.keyboard.down("Enter");
      await page.keyboard.up("Enter");
      await page.keyboard.up("Control");
    },
    downloadIsBusy: async () => (await downloadButton(page).getAttribute("aria-busy")) === "true",
    breakDrawing: () => breakEncoding(page),
    repairDrawing: () => repairEncoding(page),
    holdDownloadAtCategoryWarning: () => prepareCategoryWarning(page),
    confirmCategoryWarning: () =>
      page.getByTestId("decision-dialog").locator('[data-decision="no"]').click(),
    // The connection drops: the next page cannot bring the flyer.
    reportFlyerNotArrived: async () => {
      await page.route(NOT_ARRIVING, (route) => route.abort("connectionreset"));
      await page.reload();
      await page.getByTestId("flyer-load-problem").waitFor({ timeout: LOAD_TIMEOUT_MS });
    },
    clearLoadProblem: async () => {
      await page.unroute(NOT_ARRIVING);
      const notice = page.getByTestId("flyer-load-problem");
      await notice.getByRole("button", { name: /Reintentar/ }).click();
      await notice.waitFor({ state: "detached", timeout: LOAD_TIMEOUT_MS });
    },
    // The other way out of the flyer: the button of the window of Vista previa.
    saveFlyerAsPdf: async () => {
      await page.getByRole("button", { name: "Vista previa", exact: true }).first().click();
      await page
        .getByRole("dialog", { name: "Vista previa" })
        .getByRole("button", { name: "PDF", exact: true })
        .click();
    },
  };
}

function createSharing(page: Page) {
  return {
    /** In the menu Otros and in the window of Vista previa. */
    shareOffered: async () => {
      const box = page.getByTestId("other-actions");
      const toggle = box.getByRole("button", { name: /^Otros/ });
      await toggle.click();
      const inMenu = await box.getByRole("button", { name: /Compartir/ }).isVisible();
      await toggle.click();
      await page.getByRole("button", { name: "Vista previa", exact: true }).first().click();
      const window = page.getByRole("dialog", { name: "Vista previa" });
      await window.getByRole("button", { name: "PNG", exact: true }).waitFor();
      const inWindow = await window.getByRole("button", { name: "Compartir" }).isVisible();
      await page.keyboard.press("Escape");
      return inMenu && inWindow;
    },
    pressShare: () => pressOtherAction(page, /Compartir/),
  };
}

function createHistory(page: Page) {
  const rows = () => page.getByTestId("history-row");
  return {
    historyRows: () => rows().allInnerTexts(),
    editFromHistory: (index: number) =>
      rows().nth(index).getByRole("button", { name: "Editar" }).click(),
    pressDownloadFromHistory: (index: number) =>
      rows().nth(index).getByRole("button", { name: "PDF" }).click(),
    pressRemoveFromHistory: (index: number) =>
      rows()
        .nth(index)
        .getByRole("button", { name: /^Quitar/ })
        .click(),
    emptyHistoryText: async () => {
      const empty = page.getByText("Todavía no hay flyers en tu historial").locator("..");
      return (await empty.count()) > 0 ? empty.innerText() : "";
    },
    sessionDraftOffer: async () => {
      const offer = page.getByTestId("draft-offer");
      return (await offer.count()) > 0 ? offer.innerText() : null;
    },
    carryOnWithSessionDraft: () =>
      page.getByTestId("draft-offer").getByRole("button", { name: "Seguir con ese" }).click(),
    discardSessionDraft: () =>
      page.getByTestId("draft-offer").getByRole("button", { name: "Descartar" }).click(),
  };
}

function createOfficerFields(page: Page) {
  const block = (officer: number) => page.getByTestId(`officer-block-${String(officer)}`);
  const branches = () =>
    page.getByTestId("other-actions").getByRole("switch", { name: /Oficiales por sede/ });
  const toggle = () => page.getByTestId("other-actions").getByRole("button", { name: /^Otros/ });
  return {
    fieldWarning: async (field: "phone" | "email", officer = 1) => {
      const name = `${field === "phone" ? "celular" : "email"}${String(officer)}`;
      const message = block(officer)
        .locator(`input[data-officer-field="${name}"]`)
        .locator("..")
        .locator("p");
      return (await message.count()) > 0 ? ((await message.first().textContent()) ?? "") : "";
    },
    branchesSwitchOffered: async () => {
      await toggle().click();
      const offered = await branches().isVisible();
      await toggle().click();
      return offered;
    },
    pressBranchesSwitch: async () => {
      if ((await toggle().getAttribute("aria-expanded")) !== "true") await toggle().click();
      await branches().click();
    },
    fillBranch: (officer: number, place: string) =>
      page.getByTestId(`officer-place-${String(officer)}`).fill(place),
    fillBranchesTitle: (title: string) => page.getByTestId("branches-title").fill(title),
  };
}

function otherFlyersButton(page: Page) {
  return page.getByTestId("other-flyers");
}

function draftTabs(page: Page) {
  return page.getByTestId("open-work");
}

function createOptionBar(page: Page) {
  const list = () => page.getByTestId("other-flyers-list");
  /** The id a spec gives a tab is not a real one: which one it is, is remembered here. */
  const given = new Map<string, string>();
  return {
    waitForOthersButton: () => otherFlyersButton(page).waitFor({ timeout: LOAD_TIMEOUT_MS }),
    optionBar: () =>
      page.getByTestId("flyer-options").evaluate((bar) => {
        const others = bar.querySelector('[data-testid="other-flyers"]');
        const favorite = bar.querySelector("[data-favorite]");
        const tabs = [...bar.querySelectorAll("button[data-option]")];
        return {
          tabs: tabs.map((tab) => tab.textContent),
          favorite: favorite?.textContent ?? null,
          favoriteSelected: favorite?.getAttribute("aria-pressed") === "true",
          hasEmptyFavorite: bar.querySelector('[data-testid="favorite-place"]') !== null,
          others: (others?.getAttribute("data-others") ?? "")
            .split(",")
            .filter(Boolean)
            .map(Number),
          othersLabel:
            others?.querySelector('[data-testid="other-flyers-label"]')?.textContent ?? "",
          othersSelected: others?.getAttribute("aria-pressed") === "true",
          buttons:
            tabs.length +
            bar.querySelectorAll('[data-testid="other-flyers"], [data-testid="favorite-place"]')
              .length,
          fitsItsWidth: bar.scrollWidth <= bar.clientWidth + 1,
          height: bar.getBoundingClientRect().height,
        };
      }),
    openOtherFlyers: () => otherFlyersButton(page).click(),
    otherFlyers: async () => {
      if ((await list().count()) === 0) {
        return {
          open: false,
          items: [],
          hasSearchBox: false,
          searchBoxFocused: false,
          starred: [],
        };
      }
      return list().evaluate((box) => {
        const search = box.querySelector("input");
        return {
          open: true,
          items: [...box.querySelectorAll('[data-testid="other-flyer"]')].map(
            (item) => item.textContent,
          ),
          hasSearchBox: search !== null,
          searchBoxFocused: document.activeElement === search,
          starred: [...box.querySelectorAll('[data-star][aria-pressed="true"]')].map((star) =>
            Number(star.getAttribute("data-star")),
          ),
        };
      });
    },
    searchOtherFlyers: (text: string) => list().getByRole("searchbox").fill(text),
    toggleFavorite: async (option: number) => {
      await list()
        .locator(`[data-star="${String(option)}"]`)
        .click();
      await page.waitForTimeout(AFTER_STAR_MS);
    },
    chooseFavorite: () => page.getByTestId("flyer-options").locator("[data-favorite]").click(),
    waitForOptionSelected: (option: number) => waitForOptionShown(page, option),
    // A person opens one with its button, and it gets the first name free.
    addDraftTab: async ({ id }: { id: string; option: number; name: string }) => {
      const bar = page.getByTestId("logo-editor-bar");
      const before = await draftTabs(page).count();
      const isOutside = await bar.getByRole("button", { name: "Cambiar logos" }).isVisible();
      if (isOutside) await bar.getByRole("button", { name: "Cambiar logos" }).click();
      await bar.getByRole("button", { name: /Nuevo borrador/ }).click();
      await draftTabs(page).nth(before).waitFor({ timeout: LOAD_TIMEOUT_MS });
      const real = await draftTabs(page).nth(before).getAttribute("data-work");
      given.set(id, real ?? "");
    },
    removeDraftTab: async (id: string) => {
      await page
        .locator(`[data-work="${given.get(id) ?? ""}"]`)
        .getByRole("button", { name: "Cerrar" })
        .click();
      given.delete(id);
    },
    draftTabLayout: (id: string) =>
      page.getByTestId("flyer-options").evaluate(
        (bar, work) => {
          const tab = bar.querySelector(`[data-work="${work}"]`);
          return {
            width: Math.round(tab?.getBoundingClientRect().width ?? 0),
            barFits: bar.scrollWidth <= bar.clientWidth + 1,
          };
        },
        given.get(id) ?? "",
      ),
    renameFlyerTab: async (option: number, name: string) => {
      const tab = flyerOptionButton(page, option);
      for (let press = 0; press < PRESSES_TO_RENAME; press += 1) await tab.click();
      await page.getByRole("textbox", { name: "Nombre del flyer" }).fill(name);
      await page.keyboard.press("Enter");
    },
    dragFlyerTab: async (option: number, over: number) => {
      const box = await flyerOptionButton(page, option).boundingBox();
      const target = await flyerOptionButton(page, over).boundingBox();
      if (!box || !target) throw new Error("The flyers are not on the bar");
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(HOLD_TO_LIFT_MS);
      await page.mouse.move(target.x + target.width - 4, target.y + target.height / 2, {
        steps: 4,
      });
      await page.mouse.up();
    },
    flyerTabNames: () =>
      page.getByTestId("flyer-options").locator("button[data-option]").allInnerTexts(),
    // What a person cannot make happen on a whim is asked of the rule itself, which only answers.
    barSplit: (favorites: number[], options: number[]) =>
      page.evaluate(
        ({ current, enabled }) =>
          window["__flyerProbe"]?.flyerBar?.().split(current, enabled) ?? null,
        { current: favorites, enabled: options },
      ),
    optionsOfTab: (tab: string) =>
      page.evaluate(
        (name) => [...(window["__flyerProbe"]?.flyerBar?.().optionsOfTab(name) ?? [])],
        tab,
      ),
    favoritesAfterStarring: (current: number[], option: number) =>
      page.evaluate(
        ({ favorites, star }) => [
          ...(window["__flyerProbe"]?.flyerBar?.().afterStar(favorites, star) ?? []),
        ],
        { favorites: current, star: option },
      ),
  };
}

function createDesignSaving(page: Page) {
  const read = (id: string | null) =>
    page.evaluate((wanted) => {
      const editor = window["__flyerProbe"]?.logoEditor?.();
      const open = editor?.openWork() ?? null;
      const work = wanted === null ? open : (editor?.work(wanted) ?? null);
      return {
        id: open?.id ?? null,
        temporary: Boolean(work?.isDraft),
        name: work?.name ?? null,
        designName: editor?.openDesign() ?? null,
      };
    }, id);
  return {
    startSavingDesign: async (name: string) => {
      await page.getByTestId("save-design").click();
      await page.getByLabel("Nombre del diseño").fill(name);
      await page
        .getByRole("dialog", { name: "Guardar en Estudio" })
        .getByRole("button", { name: "Guardar", exact: true })
        .click();
    },
    newDraft: () =>
      page.getByTestId("logo-editor-bar").getByRole("button", { name: "+ Nuevo borrador" }).click(),
    openDraft: () => read(null),
    draftById: (id: string) => read(id),
  };
}

export function createReactFlyerEditorDriver(page: Page): FlyerEditorDriver {
  return {
    ...createDesignSaving(page),
    ...createFormFields(page),
    ...createDownloads(page),
    ...createSharing(page),
    ...createHistory(page),
    ...createOfficerFields(page),
    ...createOptionBar(page),
    ...createReactFlyerBatches(page),
    // It is done by itself, some seconds after entering.
    checkOptionsInBackground: async () => undefined,
    waitForOptionKnownWithoutArtwork: async (option) => {
      await page.waitForFunction(
        (n) => window["__flyerProbe"]?.flyerKnowledge?.().answer(n) === false,
        option,
        { timeout: OPTION_TIMEOUT_MS },
      );
    },
    noCashbackVariantOf: (option) =>
      page.evaluate((n) => window["__flyerProbe"]?.flyerBatch?.().versionOf(n) ?? 0, option),
    optionStatus: (option) =>
      page.evaluate(
        (n) =>
          window["__flyerProbe"]?.flyerReadings?.().optionStatus(n) ?? {
            settled: false,
            hasArtwork: null,
            ready: false,
          },
        option,
      ),
    previewIsOff: async () =>
      (await page.getByTestId("flyer-canvas-box").getAttribute("data-off")) === "true",
    // What is loaded stays while the page lives: a new page asks for it again.
    reloadOption: async (option) => {
      await page.reload();
      await page.getByRole("banner").waitFor({ timeout: OPTION_TIMEOUT_MS });
      await page.getByTestId("flyer-options").waitFor({ timeout: OPTION_TIMEOUT_MS });
      await goToOption(page, option);
    },
    // The screen keeps nothing between two draws: what would change is what is read here.
    screenLayoutAroundDownload: () =>
      page.evaluate(() => {
        const workspace = window["__flyerProbe"]?.flyerWorkspace?.();
        const readings = window["__flyerProbe"]?.flyerReadings?.();
        const before = { extraHeight: workspace?.getState().extra ?? 0, contentBottom: null };
        readings?.renderWith({
          has1: true,
          nombre: "A",
          has2: true,
          nombre2: "B",
          has3: true,
          nombre3: "C",
          has4: true,
          nombre4: "D",
        });
        const after = { extraHeight: workspace?.getState().extra ?? 0, contentBottom: null };
        return { before, after };
      }),
    boldPartsOfLegal: (text) =>
      page.evaluate(
        (legal) => window["__flyerProbe"]?.flyerReadings?.().boldParts(legal) ?? [],
        text,
      ),
    // What is loaded stays while the page lives: a new page asks for it again.
    forgetOption: async () => {
      await page.reload();
      await page.getByRole("banner").waitFor({ timeout: OPTION_TIMEOUT_MS });
      await page.getByTestId("flyer-options").waitFor({ timeout: OPTION_TIMEOUT_MS });
    },
    latestNotice: async () => {
      const notice = page.getByRole("status").and(page.locator("[data-visible]"));
      return (await notice.textContent()) ?? "";
    },
    scriptRan: () => page.evaluate(() => Reflect.has(window, "__xss")),
    selectOption: (option) => goToOption(page, option),
    waitForOptionShown: (option) => waitForOptionShown(page, option),
    waitForLoadProblem: async () => {
      const notice = page.getByTestId("flyer-load-problem");
      await notice.waitFor({ timeout: OPTION_TIMEOUT_MS });
      return (await notice.innerText()).replace(/\s+/g, " ").trim();
    },
    waitForNoLoadProblem: () =>
      page
        .getByTestId("flyer-load-problem")
        .waitFor({ state: "detached", timeout: OPTION_TIMEOUT_MS }),
    hasLoadProblem: async () => (await page.getByTestId("flyer-load-problem").count()) > 0,
    retryLoading: () =>
      page
        .getByTestId("flyer-load-problem")
        .getByRole("button", { name: /Reintentar/ })
        .click(),
    activeOption: () =>
      page.evaluate(() => window["__flyerProbe"]?.flyerWorkspace?.().getState().slot.option ?? 0),
    currentOption: () =>
      page.evaluate(() => window["__flyerProbe"]?.flyerWorkspace?.().getState().slot.option ?? 0),
    showsArtworkOf: (option) => showsArtworkOf(page, option),
    activeCalibration: () =>
      page.evaluate(() => {
        const scene = window["__flyerProbe"]?.flyerWorkspace?.().getState().slot.scene;
        return { ...scene?.calibration, ...scene?.whole.rawCalibration };
      }),
    setZoom: (zoom) => wheelToward(page, zoom),
    restoreDefaults: async () => {
      await page.getByRole("button", { name: "Restaurar", exact: true }).click();
    },
    downloadRegionDigest: (region) => downloadRegionDigest(page, region),
    downloadBlockReason: () =>
      page.evaluate(() => window["__flyerProbe"]?.flyerReadings?.().blockText() ?? ""),
    optionCalibration: (option) =>
      page.evaluate(
        (n) => window["__flyerProbe"]?.flyerReadings?.().optionCalibration(n) ?? {},
        option,
      ),
  };
}
