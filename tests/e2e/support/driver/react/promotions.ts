import ExcelJS from "exceljs";
import { type Locator, type Page } from "@playwright/test";
import {
  type LocalityFieldView,
  type PromotionRowView,
  type PromotionsDriver,
  type PromotionsTab,
  type ProvinceField,
  type ProvinceFieldView,
} from "../promotions.ts";
import { partialDriver } from "./pending.ts";

const WAIT_MS = 15_000;
const BOX_DRAG_STEPS = 4;
const SEPARATOR = ";";
const TAB_NAME: Readonly<Record<PromotionsTab, string>> = { search: "Buscar", active: "Activas" };
const MIN_PROVINCES = 3;
const ONE_ROW_PER_BRAND = "Una sola fila por marca";

function tabs(page: Page): Locator {
  return page.getByRole("tablist", { name: "Modo de promociones" });
}

function results(page: Page): Locator {
  return page.getByTestId("promotions-results");
}

function tableRows(page: Page): Locator {
  return results(page).locator("tbody tr");
}

function brandsBox(page: Page): Locator {
  return page.getByTestId("promotions-brands");
}

function validateButton(page: Page): Locator {
  return page.getByTestId("promotions-validate");
}

function updateButton(page: Page): Locator {
  return page.getByTestId("promotions-update-catalog");
}

function menu(page: Page): Locator {
  return page.getByTestId("province-menu");
}

function menuRow(page: Page, province: string): Locator {
  return menu(page).locator(`[data-value="${province}"]`);
}

/** The windows of brands share their filters, and only one of them is open at a time. */
function provinceSelect(page: Page, field: ProvinceField): Locator {
  return page.getByTestId(field === "promotions" ? "promotions-province" : "brand-province");
}

function localitySelect(page: Page, field: ProvinceField): Locator {
  return page.getByTestId(field === "promotions" ? "promotions-locality" : "brand-locality");
}

/** The province or locality the screen filters by: in the window, what it shows. */
async function inUseOf(
  page: Page,
  field: ProvinceField,
  read: "province" | "locality",
  shown: string,
) {
  if (field !== "promotions") return shown;
  return page.evaluate((what) => window["__flyerProbe"]?.promotions?.()[what]() ?? "", read);
}

async function readRows(page: Page): Promise<PromotionRowView[]> {
  return tableRows(page).evaluateAll((rows) =>
    rows.flatMap((row) => {
      const description = row.querySelector('[data-part="promotion"]');
      if (!description) return [];
      const text = (part: string): string =>
        row.querySelector(`[data-part="${part}"]`)?.textContent.trim() ?? "";
      const link = row.querySelector('[data-part="link"]');
      return [
        {
          brand: text("brand"),
          title: text("title"),
          benefit: text("benefit"),
          note: text("note"),
          days: text("days"),
          category: text("category"),
          where: text("where"),
          status: text("status"),
          description: description.textContent,
          logoUrl: row.querySelector('[data-part="logo"] img')?.getAttribute("src") ?? "",
          hasPercentDot: Boolean(row.querySelector('[data-testid="percent-dot"]')),
          hasModoTag: Boolean(row.querySelector('[data-part="modo"]')),
          linkText: link?.textContent.trim() ?? "",
          linkUrl: link?.getAttribute("href") ?? "",
        },
      ];
    }),
  );
}

function cellText(value: ExcelJS.CellValue): string {
  return typeof value === "string" ? value : JSON.stringify(value ?? "");
}

async function readSheet(path: string): Promise<{ head: string[]; rows: string[][] }> {
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(path);
  const [sheet] = book.worksheets;
  if (!sheet) return { head: [], rows: [] };
  const lines: string[][] = [];
  sheet.eachRow((row) => {
    const values = row.values;
    if (Array.isArray(values)) lines.push(Array.from(values, cellText).slice(1));
  });
  const [head = [], ...rows] = lines;
  return { head, rows };
}

async function readProvinceField(page: Page, field: ProvinceField): Promise<ProvinceFieldView> {
  const { value, label } = await provinceSelect(page, field).evaluate(
    (element: HTMLSelectElement) => ({
      value: element.value,
      label: element.selectedOptions[0]?.textContent ?? "",
    }),
  );
  const inUse = await inUseOf(page, field, "province", value);
  return {
    selected: value.split(SEPARATOR).filter(Boolean),
    label,
    inUse: inUse.split(SEPARATOR).filter(Boolean),
  };
}

async function readLocalityField(page: Page, field: ProvinceField): Promise<LocalityFieldView> {
  const select = localitySelect(page, field);
  if ((await select.count()) === 0)
    return { hidden: true, disabled: false, placeholder: "", inUse: "" };
  const shown = await select.evaluate((element: HTMLSelectElement) => ({
    hidden: element.hidden === true,
    disabled: element.disabled,
    placeholder: element.options[0]?.textContent ?? "",
    value: element.value,
  }));
  const inUse = await inUseOf(page, field, "locality", shown.value);
  return { hidden: shown.hidden, disabled: shown.disabled, placeholder: shown.placeholder, inUse };
}

function createTableActions(page: Page) {
  return {
    rows: () => readRows(page),
    sortBy: async (column: string) => {
      await results(page)
        .locator("thead th", { hasText: column })
        .first()
        .getByRole("button")
        .click();
    },
    statusCounters: () => page.getByTestId("status-counter").allInnerTexts(),
    filterResults: (text: string) =>
      page.getByTestId("promotions-results-search").pressSequentially(text),
    resultsFilterHasFocus: () =>
      page
        .getByTestId("promotions-results-search")
        .evaluate((field) => document.activeElement === field),
    filterColumn: (hint: string, text: string) =>
      results(page).getByPlaceholder(hint, { exact: true }).first().fill(text),
    filterStatus: async (label: string) => {
      await page.getByRole("combobox", { name: "Filtrar por estado" }).selectOption({ label });
    },
    confirmMatchAgain: async (brand: string) => {
      await page
        .getByRole("combobox", { name: `Coincidencia de ${brand}` })
        .first()
        .selectOption({ index: 1 });
    },
    downloadSheet: async () => {
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByTestId("promotions-download").click(),
      ]);
      return readSheet(await download.path());
    },
    activeResultIds: () =>
      tableRows(page)
        .locator("[data-promotion-id]")
        .evaluateAll((cells) => cells.map((cell) => cell.getAttribute("data-promotion-id") ?? "")),
  };
}

function createPanelActions(page: Page) {
  const fillBrands = (brands: string[]) => brandsBox(page).fill(brands.join("\n"));
  return {
    searchBrands: async (brands: string[]) => {
      await fillBrands(brands);
      await validateButton(page).click();
      await tableRows(page).first().waitFor({ timeout: WAIT_MS });
    },
    listActive: async () => {
      await page.getByTestId("promotions-list").click();
      await tableRows(page).first().waitFor({ timeout: WAIT_MS });
    },
    pressValidate: async (brands: string[]) => {
      await fillBrands(brands);
      await validateButton(page).click();
    },
    validateWithShortcut: async (brands: string[]) => {
      await fillBrands(brands);
      await brandsBox(page).press("Control+Enter");
    },
    validateIsLocked: () => validateButton(page).isDisabled(),
    validateButtonText: async () => (await validateButton(page).textContent()) ?? "",
    pressUpdateCatalog: () => updateButton(page).click(),
    updateCatalogButton: async () => ({
      text: ((await updateButton(page).textContent()) ?? "").trim(),
      locked: await updateButton(page).isDisabled(),
    }),
    catalogStatus: async () =>
      (await page.getByTestId("promotions-catalog-status").textContent()) ?? "",
    oneRowPerBrandIsOn: (tab: PromotionsTab) =>
      page
        .getByRole("tabpanel", { name: TAB_NAME[tab], includeHidden: true })
        .getByRole("checkbox", { name: ONE_ROW_PER_BRAND, includeHidden: true })
        .isChecked(),
    setOnlyNew: (on: boolean) =>
      page.getByRole("checkbox", { name: /Sólo las nuevas/ }).setChecked(on),
    setOneRowPerBrand: (on: boolean) =>
      page.getByRole("checkbox", { name: ONE_ROW_PER_BRAND }).setChecked(on),
    setIncludeModo: (on: boolean) =>
      page.getByRole("checkbox", { name: "Incluir MODO" }).setChecked(on),
    rememberedIncludeModo: async () => {
      const stored = await page.evaluate(() => localStorage.getItem("fg_promos_modo"));
      return stored === null ? null : stored === "1";
    },
    watchFoundBrandsOn: async (option: number) => {
      await page.getByLabel("Vigilar estas marcas en").selectOption(String(option));
      await page.getByRole("button", { name: "Guardar" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Vigilar" }).click();
      await page
        .getByText(/se vigilan \d+ marcas/)
        .first()
        .waitFor({ timeout: WAIT_MS });
    },
  };
}

function createProvinceActions(page: Page) {
  return {
    chooseProvince: async (field: ProvinceField, province: string) => {
      await provinceSelect(page, field).selectOption(province);
    },
    chooseLocality: async (field: ProvinceField, locality: string) => {
      await localitySelect(page, field).selectOption(locality);
      if (field !== "promotions") {
        await page.locator('[data-testid="brand-list"]:not([data-searching])').waitFor();
        return;
      }
      await page.waitForFunction(
        () => window["__flyerProbe"]?.promotions?.().localityAnswered(),
        null,
        {
          timeout: WAIT_MS,
        },
      );
    },
    provinceField: (field: ProvinceField) => readProvinceField(page, field),
    localityField: (field: ProvinceField) => readLocalityField(page, field),
    openProvinceMenu: async (field: ProvinceField) => {
      await provinceSelect(page, field).click();
      await menu(page).waitFor({ timeout: WAIT_MS });
    },
    openProvinceMenuWithKeyboard: async (field: ProvinceField) => {
      await provinceSelect(page, field).focus();
      await page.keyboard.press("ArrowDown");
    },
    provinceMenuIsOpen: () => menu(page).isVisible(),
    provinceMenuTicked: () =>
      menu(page)
        .locator('[aria-pressed="true"]')
        .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-value") ?? "")),
    clickInProvinceMenu: (province: string) => menuRow(page, province).click(),
    shiftClickInProvinceMenu: (province: string) =>
      menuRow(page, province).click({ modifiers: ["Shift"] }),
    removeInProvinceMenu: (province: string) =>
      menu(page)
        .getByRole("listitem")
        .filter({ has: page.locator(`[data-value="${province}"]`) })
        .getByRole("button", { name: /^Sacar / })
        .click(),
    clickAllProvincesInProvinceMenu: () => menuRow(page, "").click(),
  };
}

/** What the catalog says about what is not on the table: the app lets it be read, nothing else. */
function createCatalogQuestions(page: Page) {
  return {
    catalog: () => page.evaluate(() => window["__flyerProbe"]?.promotions?.().catalog() ?? []),
    promotionIdsIn: (provinces: string[]) =>
      page.evaluate(
        (names) => window["__flyerProbe"]?.promotions?.().idsIn(names) ?? [],
        provinces,
      ),
    currentOfferCount: (title: string, province: string) =>
      page.evaluate(
        ({ wanted, where }) =>
          window["__flyerProbe"]?.promotions?.().currentOffers(wanted, where) ?? 0,
        { wanted: title, where: province },
      ),
    supermarketDaysOnFlyer: (
      promotion: Parameters<PromotionsDriver["supermarketDaysOnFlyer"]>[0],
      zone?: Parameters<PromotionsDriver["supermarketDaysOnFlyer"]>[1],
    ) =>
      page.evaluate(
        async ({ query, where }) =>
          (await window["__flyerProbe"]?.promotions?.().flyerDays(query, where)) ?? "",
        { query: promotion, where: zone ?? null },
      ),
    hasPercentDiscount: (
      promotion: Parameters<PromotionsDriver["hasPercentDiscount"]>[0],
      zone?: Parameters<PromotionsDriver["hasPercentDiscount"]>[1],
    ) =>
      page.evaluate(
        async ({ query, where }) =>
          (await window["__flyerProbe"]?.promotions?.().hasPercent(query, where)) ?? false,
        { query: promotion, where: zone ?? null },
      ),
    titlesWithPercentDiscount: (titles: string[]) =>
      page.evaluate(
        (wanted) => window["__flyerProbe"]?.promotions?.().withPercent(wanted) ?? [],
        titles,
      ),
    ownDays: (promotion: Parameters<PromotionsDriver["ownDays"]>[0]) =>
      page.evaluate(
        (query) => window["__flyerProbe"]?.promotions?.().ownDays(query) ?? "",
        promotion,
      ),
    appliesInProvince: (
      promotion: Parameters<PromotionsDriver["appliesInProvince"]>[0],
      province: string,
    ) =>
      page.evaluate(
        ({ query, where }) =>
          window["__flyerProbe"]?.promotions?.().inProvince(query, where) ?? false,
        { query: promotion, where: province },
      ),
    modoPromotionShownInLocality: ({
      province,
      locality,
      cities,
    }: Parameters<PromotionsDriver["modoPromotionShownInLocality"]>[0]) =>
      page.evaluate(
        ({ where, town, stores }) =>
          window["__flyerProbe"]?.promotions?.().modoShownInLocality(where, town, stores) ?? false,
        { where: province, town: locality, stores: cities },
      ),
    includeModoIsOn: () =>
      page.evaluate(() => window["__flyerProbe"]?.promotions?.().includeModo() ?? false),
  };
}

function brandWindow(page: Page): Locator {
  return page.getByRole("dialog", { name: /Cambiar esto|Agregar acá|Reemplazar \d+ lugares/ });
}

async function bringToMiddle(page: Page, top: number): Promise<void> {
  await page.evaluate((y) => {
    const pane = document.querySelector('[data-testid="flyer-preview"]');
    const point = window["__flyerProbe"]?.logoEditor?.().toClient(0, y);
    if (!pane || !point) throw new Error("The preview is not on screen");
    const box = pane.getBoundingClientRect();
    pane.scrollTop += point.y - (box.top + box.height / 2);
  }, top);
}

function flyerPoint(page: Page, x: number, y: number) {
  return page.evaluate(
    ({ left, top }) => window["__flyerProbe"]?.logoEditor?.().toClient(left, top) ?? null,
    { left: x, top: y },
  );
}

async function openWindowOver(
  page: Page,
  { x, y, width, height }: { x: number; y: number; width: number; height: number },
): Promise<void> {
  await bringToMiddle(page, y + height / 2);
  const from = await flyerPoint(page, x, y);
  const to = await flyerPoint(page, x + width, y + height);
  if (!from || !to) throw new Error("The flyer is not on screen");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: BOX_DRAG_STEPS });
  await page.mouse.up();
  await brandWindow(page).getByTestId("brand-card").first().waitFor({ timeout: WAIT_MS });
}

function stripWindow(page: Page): Locator {
  return page.getByRole("dialog", { name: "Armar franja" });
}

function readCards(cards: Locator) {
  return cards.evaluateAll((elements) =>
    elements.map((card) => {
      const more = card.querySelector('[data-testid="more-promotions"]');
      return {
        title: card.querySelector('[data-testid="brand-title"]')?.textContent ?? "",
        detail: card.querySelector('[data-testid="brand-detail"]')?.textContent ?? "",
        logoUrl: card.querySelector("img")?.getAttribute("src") ?? "",
        hasPercentDot: Boolean(card.querySelector('[data-testid="percent-dot"]')),
        hasModoTag: Boolean(card.querySelector('[data-testid="modo-tag"]')),
        noteOnHover: card.querySelector('[data-testid="brand-note"]')?.getAttribute("title") ?? "",
        morePromos: more?.textContent ?? "",
        morePromosOnHover: more?.getAttribute("title") ?? "",
      };
    }),
  );
}

function createStripWindow(page: Page) {
  return {
    openLogoStripOver: async ({
      x,
      y,
      width,
      height,
    }: {
      x: number;
      y: number;
      width: number;
      height: number;
    }) => {
      await page
        .getByTestId("logo-editor-bar")
        .getByRole("button", { name: "Armar franja", exact: true })
        .click();
      await bringToMiddle(page, y + height / 2);
      const from = await flyerPoint(page, x, y);
      const to = await flyerPoint(page, x + width, y + height);
      if (!from || !to) throw new Error("The flyer is not on screen");
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps: BOX_DRAG_STEPS });
      await page.mouse.up();
      await stripWindow(page).getByTestId("brand-card").first().waitFor({ timeout: WAIT_MS });
    },
    closeLogoStrip: async () => {
      await stripWindow(page).getByRole("button", { name: "Cancelar" }).click();
      await stripWindow(page).waitFor({ state: "detached", timeout: WAIT_MS });
    },
    searchInLogoStrip: async (text: string) => {
      await stripWindow(page).getByRole("searchbox", { name: "Buscar marca" }).fill(text);
      await stripWindow(page)
        .locator(`[data-testid="brand-list"][data-search="${text}"]`)
        .waitFor({ timeout: WAIT_MS });
    },
    logoStripCards: () => readCards(stripWindow(page).getByTestId("brand-card")),
    logoStripOfferIds: () =>
      page.evaluate(() =>
        (window["__flyerProbe"]?.logoStripWindow?.().offers() ?? []).map(({ id }) => String(id)),
      ),
  };
}

function createBrandWindow(page: Page) {
  const cards = () => brandWindow(page).getByTestId("brand-card");
  return {
    openBrandPickerOver: (place: { x: number; y: number; width: number; height: number }) =>
      openWindowOver(page, place),
    openBrandPickerAt: async ({ x, y }: { x: number; y: number }) => {
      await bringToMiddle(page, y);
      const point = await flyerPoint(page, x, y);
      if (!point) throw new Error("The flyer is not on screen");
      await page.mouse.click(point.x, point.y);
      await cards().first().waitFor({ timeout: WAIT_MS });
    },
    closeBrandPicker: async () => {
      await brandWindow(page).getByRole("button", { name: "Cerrar" }).click();
      await brandWindow(page).waitFor({ state: "detached", timeout: WAIT_MS });
    },
    searchInBrandPicker: async (text: string) => {
      await brandWindow(page).getByRole("searchbox", { name: "Buscar marca" }).fill(text);
      await brandWindow(page)
        .locator(`[data-testid="brand-list"][data-search="${text}"]`)
        .waitFor({ timeout: WAIT_MS });
    },
    brandCards: () => readCards(cards()),
    pickBrand: async (title: string) => {
      await cards()
        .filter({ has: page.getByText(title, { exact: true }) })
        .first()
        .click();
      await brandWindow(page).waitFor({ state: "detached", timeout: WAIT_MS });
    },
    hasDaysTextBelowLogoAt: async ({ x, y }: { x: number; y: number }) =>
      page.evaluate(
        (point) => Boolean(window["__flyerProbe"]?.logoEditor?.().hasDaysBelow(point.x, point.y)),
        { x, y },
      ),
    percentDotOnFlyer: async () =>
      (await page.getByTestId("logo-editor-layer").getByTestId("percent-dot").count()) > 0,
    expiredLogosOnFlyer: () =>
      page.evaluate(() =>
        [...document.querySelectorAll('[data-testid="logo-marker"][data-note="expired"]')].map(
          (marker) => marker.getAttribute("data-title") ?? "",
        ),
      ),
    placedOnFlyer: () =>
      page.evaluate(() => {
        const editor = window["__flyerProbe"]?.logoEditor?.();
        const changes = editor?.placed() ?? [];
        return {
          logos: changes
            .filter(({ img, tipo }) => img && tipo !== "txt")
            .map(({ t = "", img = "", tx = 0, ty = 0, tw = 0, th = 0 }) => ({
              title: t,
              logoFile: img,
              centerX: Math.round(tx + tw / 2),
              bottom: Math.round(ty + th),
            })),
          texts: changes
            .filter(({ tipo }) => tipo === "txt")
            .map(({ texto = "", fs = 0, peso = 0, color = "", tx = 0, ty = 0, tw = 0 }) => ({
              text: texto,
              fontSize: fs,
              weight: peso,
              color,
              centerX: Math.round(tx + tw / 2),
              top: Math.round(ty),
            })),
          selectedTitle: changes[editor?.selection().main ?? -1]?.t ?? "",
        };
      }),
  };
}

export function createReactPromotionsDriver(page: Page): PromotionsDriver {
  const headerTab = (name: string) =>
    page.getByRole("banner").getByRole("tab", { name, exact: false }).first();
  const goToScreen = async () => {
    await headerTab("Promociones").click();
    await tabs(page).waitFor({ timeout: WAIT_MS });
  };
  const switchTab = (tab: PromotionsTab) =>
    tabs(page).getByRole("tab", { name: TAB_NAME[tab] }).click();
  const waitForCatalog = async () => {
    await page.waitForFunction(
      () => {
        const probe = window["__flyerProbe"];
        return (
          (probe?.promotions?.().catalog().length ?? probe?.logoEditor?.().catalogSize() ?? 0) > 0
        );
      },
      null,
      { timeout: WAIT_MS },
    );
  };
  return partialDriver<PromotionsDriver>("promotions", {
    ...createBrandWindow(page),
    ...createStripWindow(page),
    ...createTableActions(page),
    ...createPanelActions(page),
    ...createProvinceActions(page),
    ...createCatalogQuestions(page),
    waitForCatalog,
    open: async (tab) => {
      await goToScreen();
      await waitForCatalog();
      await switchTab(tab);
      await page.waitForFunction(
        (least) =>
          (document.querySelector('[data-testid="promotions-province"]')?.children.length ?? 0) >
          least,
        MIN_PROVINCES,
        { timeout: WAIT_MS },
      );
    },
    openWithoutCatalog: async (tab) => {
      await goToScreen();
      await switchTab(tab);
    },
    switchTab,
    // Until flyer-editor arrives, what the first tab of the header opens.
    backToFlyer: () => page.getByRole("banner").getByRole("tab").first().click(),
  });
}
