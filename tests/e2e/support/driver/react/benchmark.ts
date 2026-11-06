import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { type Locator, type Page } from "@playwright/test";
import {
  type BenchmarkCardFields,
  type BenchmarkDriver,
  type BenchmarkView,
  type BenchmarkWorkbook,
} from "../benchmark.ts";

const DATA_TIMEOUT_MS = 15_000;
const REFRESH_TIMEOUT_MS = 15_000;
const EXCEL_TIMEOUT_MS = 30_000;

const VIEW_NAMES: Readonly<Record<string, BenchmarkView>> = {
  rubro: "rubro",
  marca: "brand",
  semana: "week",
  comercio: "merchant",
  versus: "versus",
  tarjetas: "cards",
};
const VIEW_TABS: Readonly<Record<BenchmarkView, string | RegExp>> = {
  rubro: "Resumen por rubro",
  brand: "Cara a cara por marca",
  week: "Semana",
  merchant: "Por comercio",
  versus: /^Galicia vs /,
  cards: "Tarjetas y salas VIP",
};
const AUDIENCES = { all: "todos", classic: "clasico", premium: "premium" } as const;
const CARD_TYPES = { all: "todas", debit: "debito" } as const;
const OUTCOME_PILLS = { all: /^Todas$/, "we-lose": /^Perdemos/ } as const;
/** The field of each reference purchase, by its rubro. */
const REFERENCE_LABELS: Readonly<Record<string, string>> = {
  Supermercados: "Supermercados",
  Combustible: "Combustible",
  "Salud y Bienestar": "Farmacia / salud",
  Otros: "Resto",
};
const CODE_OF_BENCHMARK = /\/fg-benchmark-[^/]*\.js/;
/** No person reaches it: no tab leads to the page of promotions loaded by hand, on purpose. */
const HAND_LOADED_UNREACHABLE =
  'The page "Cargadas a mano" is shown to nobody in React, as in the current app: no person can open it.';

function root(page: Page): Locator {
  return page.getByTestId("benchmark");
}

function filters(page: Page): Locator {
  return page.getByTestId("benchmark-filters");
}

function headerTab(page: Page): Locator {
  return page.getByRole("banner").getByRole("tab", { name: "Benchmark" });
}

function editor(page: Page): Locator {
  return page.getByRole("dialog");
}

function tableRows(page: Page): Locator {
  return root(page).locator("table tbody tr");
}

async function waitForData(page: Page): Promise<void> {
  await root(page)
    .and(page.locator('[data-loading="false"]'))
    .waitFor({ timeout: DATA_TIMEOUT_MS });
}

async function open(page: Page): Promise<void> {
  await headerTab(page).click();
  await waitForData(page);
}

function probe(page: Page) {
  return {
    promotions: () => page.evaluate(() => window["__flyerProbe"]?.benchmark?.().promotions() ?? []),
  };
}

async function fillIfGiven(field: Locator, value: string | undefined): Promise<void> {
  if (value !== undefined) await field.fill(value);
}

async function fillCard(page: Page, fields: BenchmarkCardFields): Promise<void> {
  const form = editor(page);
  if (fields.bank !== undefined) {
    await form.getByLabel("Banco", { exact: true }).selectOption(fields.bank);
  }
  await fillIfGiven(form.getByLabel("Tarjeta", { exact: true }), fields.card);
  await fillIfGiven(
    form.getByLabel("Pases a salas VIP por año (titular)", { exact: true }),
    fields.passesPerYear,
  );
  await fillIfGiven(form.getByLabel("Costo y cómo bonificarlo", { exact: true }), fields.cost);
  await fillIfGiven(
    form.getByLabel("Dirección de la página (https://…)", { exact: true }),
    fields.sourceUrl,
  );
}

function cardRow(page: Page, bank: string, card: string): Locator {
  return tableRows(page).filter({ hasText: bank }).filter({ hasText: card });
}

async function readWorkbook(bytes: Buffer): Promise<BenchmarkWorkbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Uint8Array.from(bytes).buffer);
  const sheets: Record<string, unknown[][]> = {};
  for (const sheet of workbook.worksheets) {
    const rows: unknown[][] = [];
    for (let index = 1; index <= sheet.rowCount; index += 1) {
      const values = sheet.getRow(index).values;
      rows.push(Array.isArray(values) ? values.slice(1) : []);
    }
    sheets[sheet.name] = rows;
  }
  return { sheetNames: workbook.worksheets.map(({ name }) => name), sheets };
}

async function downloadExcel(page: Page): Promise<BenchmarkWorkbook> {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: EXCEL_TIMEOUT_MS }),
    root(page).getByRole("button", { name: "Descargar Excel" }).click(),
  ]);
  return readWorkbook(await readFile(await download.path()));
}

function widths(page: Page) {
  return page.evaluate(() => {
    const panel = document.querySelector('[data-testid="benchmark"]');
    const boxes = Array.from(document.querySelectorAll('[data-testid="benchmark"] [data-slides]'));
    const widest = boxes.toSorted((one, other) => other.scrollWidth - one.scrollWidth)[0];
    return {
      page: document.documentElement.scrollWidth,
      panel: panel?.scrollWidth ?? 0,
      tabs: Math.max(
        ...Array.from(
          document.querySelectorAll('[data-testid="benchmark"] [role="tab"]'),
          (tab) => tab.getBoundingClientRect().right,
        ),
      ),
      table: widest?.scrollWidth ?? 0,
      tableBox: widest?.clientWidth ?? 0,
    };
  });
}

function reading(page: Page) {
  const area = root(page);
  return {
    sourceLabels: () =>
      page
        .getByTestId("benchmark-sources")
        .locator("[data-bank]")
        .evaluateAll((chips) =>
          chips.map((chip) => ({
            text: chip.textContent,
            stale: chip.getAttribute("data-stale") === "true",
          })),
        ),
    rubroWinners: (rubro) =>
      tableRows(page).evaluateAll(
        (rows, name) =>
          rows
            .filter((row) => row.querySelector("td strong")?.textContent === name)
            .flatMap((row) => Array.from(row.querySelectorAll("td[data-bank]")))
            .filter((cell) => cell.querySelector('[data-wins="true"]'))
            .map((cell): "galicia" | "competitor" =>
              cell.getAttribute("data-bank") === "galicia" ? "galicia" : "competitor",
            ),
        rubro,
      ),
    headline: async () => (await page.getByTestId("benchmark-headline").textContent()) ?? "",
    screenText: () => area.evaluate((element) => (element.textContent ?? "").replace(/\s+/g, " ")),
    tabs: () => area.getByRole("tab").allTextContents(),
    pageWidths: () => widths(page),
    buttons: () => area.getByRole("button").allTextContents(),
    tableCount: () => area.locator("table").count(),
    tableCells: () => tableRows(page).locator("td").allTextContents(),
    tableRows: () =>
      tableRows(page).evaluateAll((rows) =>
        rows.map((row) => (row.textContent ?? "").replace(/\s+/g, " ")),
      ),
    firstColumn: () =>
      tableRows(page).evaluateAll((rows) =>
        rows.map((row) => row.querySelector("td")?.textContent ?? ""),
      ),
    listedBrands: async () =>
      (await tableRows(page).locator('[data-part="brand"]').allTextContents()).map((brand) =>
        brand.trim(),
      ),
    tableLinks: () =>
      area
        .locator("table a")
        .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? "")),
    hasInjectedImage: async () => (await area.locator('img[src="x"]').count()) > 0,
  } satisfies Partial<BenchmarkDriver>;
}

function filtering(page: Page) {
  const field = (label: string) => filters(page).getByLabel(label, { exact: true });
  return {
    setProvince: async (province) => {
      await field("Provincia").selectOption(province);
    },
    setRubro: async (rubro) => {
      await field("Rubro").selectOption(rubro);
    },
    setAudience: (audience) =>
      field("Tarjeta de la persona")
        .selectOption(AUDIENCES[audience])
        .then(() => undefined),
    setCardType: (card) =>
      field("Tipo de tarjeta")
        .selectOption(CARD_TYPES[card])
        .then(() => undefined),
    setOutcome: (outcome) =>
      root(page).getByRole("button", { name: OUTCOME_PILLS[outcome] }).click(),
    setIncludeSalaryOnly: (include) =>
      filters(page)
        .getByRole("checkbox", { name: "Incluir promos para quien cobra el sueldo en el banco" })
        .setChecked(include),
    setReferencePurchase: async (rubro, amount) => {
      const input = field(REFERENCE_LABELS[rubro] ?? rubro);
      await input.fill(String(amount));
      await input.press("Tab");
    },
    rememberedReferencePurchases: () => page.evaluate(() => localStorage.getItem("fg_bench_ref")),
  } satisfies Partial<BenchmarkDriver>;
}

function unreachable(): never {
  throw new Error(HAND_LOADED_UNREACHABLE);
}

function editing(page: Page) {
  return {
    editorIsOpen: async () => (await editor(page).count()) > 0,
    cancelEditor: () => editor(page).getByRole("button", { name: "Cancelar" }).click(),
    saveEditor: () =>
      editor(page)
        .getByRole("button", { name: /^Guard/ })
        .click(),
    waitForEditorClosed: () =>
      editor(page).waitFor({ state: "detached", timeout: DATA_TIMEOUT_MS }),
    startNewCard: () => root(page).getByRole("button", { name: "+ Agregar tarjeta" }).click(),
    editCard: (bank, card) =>
      cardRow(page, bank, card).getByRole("button", { name: "Editar" }).click(),
    fillCard: (fields) => fillCard(page, fields),
    removeCard: async (bank, card) => {
      await cardRow(page, bank, card).getByRole("button", { name: "Quitar" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Quitar" }).click();
    },
    showHandLoadedPromotions: unreachable,
    startNewHandLoadedPromotion: unreachable,
    editHandLoadedPromotion: unreachable,
    fillHandLoadedPromotion: unreachable,
    handLoadedCondition: unreachable,
  } satisfies Partial<BenchmarkDriver>;
}

export function createReactBenchmarkDriver(page: Page): BenchmarkDriver {
  const probed = probe(page);
  return {
    access: async () => {
      const tabShown = await headerTab(page).isVisible();
      const codeLoaded = await page.evaluate(
        (code) =>
          performance.getEntriesByType("resource").some(({ name }) => new RegExp(code).test(name)),
        CODE_OF_BENCHMARK.source,
      );
      // The tab is there exactly when the profile has the faculty.
      return { allowed: tabShown, tabShown, codeLoaded };
    },
    startsAllowedFor: (role) =>
      page.evaluate(
        (name) => window["__flyerProbe"]?.permissions?.().startsAllowed(name, "benchmark") ?? false,
        role,
      ),
    open: () => open(page),
    reload: async () => {
      // As a person reads everything again: the page from scratch, and the tab.
      await page.reload();
      await headerTab(page).waitFor({ timeout: DATA_TIMEOUT_MS });
      await open(page);
    },
    waitForData: () => waitForData(page),
    currentView: async () => {
      const view = (await root(page).getAttribute("data-view")) ?? "";
      const known = VIEW_NAMES[view];
      if (!known) throw new Error(`Benchmark view not known: "${view}"`);
      return known;
    },
    showView: (view) => root(page).getByRole("tab", { name: VIEW_TABS[view] }).click(),
    promotions: () => probed.promotions(),
    bestOffer: (query) =>
      page.evaluate(
        (asked) => window["__flyerProbe"]?.benchmark?.().bestOffer(asked) ?? null,
        query,
      ),
    mostInstallments: (bank) =>
      page.evaluate(
        (name) => window["__flyerProbe"]?.benchmark?.().mostInstallments(name) ?? null,
        bank,
      ),
    openFirstDayListing: async () => {
      const button = root(page)
        .getByRole("button", { name: /^Ver las \d+ promos$/ })
        .first();
      if ((await button.count()) === 0) return null;
      const announced = Number(/\d+/.exec(await button.innerText())?.[0]);
      await button.click();
      const listing = page.getByTestId("benchmark-day-listing");
      const rows = await listing.locator("tbody tr").count();
      return {
        announced,
        rows,
        hasHeading: /: \d+ promos/.test(await root(page).innerText()),
      };
    },
    searchMerchant: (text) => root(page).getByLabel("Comercio", { exact: true }).fill(text),
    setMerchantDay: async (day) => {
      await root(page)
        .getByLabel("Día", { exact: true })
        .selectOption(String(day ?? -1));
    },
    merchantResults: () =>
      page.getByTestId("merchant-results").evaluate((results) => {
        const rows = Array.from(results.querySelectorAll("tbody tr"));
        const banks = rows.map((row) => row.querySelector("td")?.textContent ?? "");
        return {
          text: (results.textContent ?? "").replace(/\s+/g, " "),
          rows: rows.length,
          banks: [...new Set(banks)],
        };
      }),
    presentPromotion: (row) =>
      page.evaluate((asked) => {
        const benchmark = window["__flyerProbe"]?.benchmark?.();
        if (!benchmark) throw new Error("Benchmark is not open");
        return benchmark.present(asked);
      }, row),
    downloadExcel: () => downloadExcel(page),
    refreshNow: async () => {
      await root(page).getByRole("button", { name: "Actualizar ahora" }).click();
      await root(page)
        .getByRole("button", { name: "Actualizar ahora" })
        .and(page.locator(":not([disabled])"))
        .waitFor({ timeout: REFRESH_TIMEOUT_MS });
      await waitForData(page);
    },
    ...reading(page),
    ...filtering(page),
    ...editing(page),
  };
}
