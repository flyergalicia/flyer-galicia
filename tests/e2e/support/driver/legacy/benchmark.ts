import { readFile } from "node:fs/promises";
import { type Locator, type Page } from "@playwright/test";
import {
  type BenchmarkCardFields,
  type BenchmarkDriver,
  type BenchmarkManualFields,
  type BenchmarkView,
  type BenchmarkWorkbook,
} from "../benchmark.ts";

const ROOT = "#ben-root";
const MAIN_TABLE_ROWS = `${ROOT} table.ben-t tbody tr`;
const EDITOR = "#ben-ed-ov";
const FILTERS = ".ben-filtros";
const REFRESH = "#ben-act";
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
export const VIEW_TABS: Readonly<Record<BenchmarkView, string | RegExp>> = {
  rubro: "Resumen por rubro",
  brand: "Cara a cara por marca",
  week: "Semana",
  merchant: "Por comercio",
  versus: /^Galicia vs /,
  cards: "Tarjetas y salas VIP",
};
const AUDIENCES = { all: "todos", classic: "clasico", premium: "premium" } as const;
const CARD_TYPES = { all: "todas", debit: "debito" } as const;
const OUTCOME_PILLS = { all: "Todas", "we-lose": "Perdemos" } as const;

async function waitForData(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const state = window.BEN;
      return Boolean(state) && !state?.cargando && (Boolean(state?.rows) || Boolean(state?.error));
    },
    null,
    { timeout: DATA_TIMEOUT_MS },
  );
}

function filter(page: Page, label: string): Locator {
  return page.locator(`${FILTERS} label.ben-f`, { hasText: label }).locator("select").first();
}

async function selectFilter(page: Page, label: string, value: string): Promise<void> {
  await filter(page, label).selectOption(value);
}

function tableRow(page: Page, bank: string, name: string): Locator {
  return page.locator(MAIN_TABLE_ROWS).filter({ hasText: bank }).filter({ hasText: name });
}

async function fillIfGiven(page: Page, field: string, value: string | undefined): Promise<void> {
  if (value !== undefined) await page.locator(field).fill(value);
}

async function selectIfGiven(page: Page, field: string, value: string | undefined): Promise<void> {
  if (value !== undefined) await page.locator(field).selectOption(value);
}

async function fillCard(page: Page, fields: BenchmarkCardFields): Promise<void> {
  await selectIfGiven(page, "#ben-f-banco", fields.bank);
  await fillIfGiven(page, "#ben-f-tarjeta", fields.card);
  await fillIfGiven(page, "#ben-f-pases_anio", fields.passesPerYear);
  await fillIfGiven(page, "#ben-f-costo", fields.cost);
  await fillIfGiven(page, "#ben-f-fuente_url", fields.sourceUrl);
}

async function fillHandLoaded(page: Page, fields: BenchmarkManualFields): Promise<void> {
  await selectIfGiven(page, "#ben-m-banco", fields.bank);
  await selectIfGiven(page, "#ben-m-rubro", fields.rubro);
  await fillIfGiven(page, "#ben-m-titulo", fields.title);
  await fillIfGiven(page, "#ben-m-pct", fields.percent);
  await fillIfGiven(page, "#ben-m-tope", fields.cap);
  await selectIfGiven(page, "#ben-m-tope_por", fields.capPerMonth ? "month" : undefined);
  await fillIfGiven(page, "#ben-m-condicion", fields.condition);
  for (const day of fields.days ?? []) {
    await page.locator(`.ben-m-dia[value="${String(day)}"]`).check();
  }
}

async function readWorkbook(page: Page, bytes: Buffer): Promise<BenchmarkWorkbook> {
  return page.evaluate(async (base64) => {
    const raw = Uint8Array.from(atob(base64), (letter) => letter.charCodeAt(0));
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(raw.buffer);
    const sheets: Record<string, unknown[][]> = {};
    for (const sheet of workbook.worksheets) {
      const rows: unknown[][] = [];
      for (let index = 1; index <= sheet.rowCount; index += 1) {
        rows.push(Array.from(sheet.getRow(index).values).slice(1));
      }
      sheets[sheet.name] = rows;
    }
    return { sheetNames: workbook.worksheets.map(({ name }) => name), sheets };
  }, bytes.toString("base64"));
}

async function downloadExcel(page: Page): Promise<BenchmarkWorkbook> {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: EXCEL_TIMEOUT_MS }),
    page.locator("#ben-xl").click(),
  ]);
  return readWorkbook(page, await readFile(await download.path()));
}

export function createLegacyBenchmarkDriver(page: Page): BenchmarkDriver {
  const root = page.locator(ROOT);
  return {
    access: () =>
      page.evaluate(() => {
        const tab = document.getElementById("apptab-benchmark");
        return {
          allowed: _can("benchmark"),
          tabShown: tab ? getComputedStyle(tab).display !== "none" : false,
          codeLoaded:
            Boolean(document.querySelector('script[src*="benchmark"]')) ||
            typeof benInit === "function",
        };
      }),
    startsAllowedFor: (role) => page.evaluate((name) => _FAC_DEF[name]?.benchmark === true, role),
    open: async () => {
      await page.locator("#apptab-benchmark").click();
      await page.waitForFunction(() => Boolean(window.BEN), null, { timeout: DATA_TIMEOUT_MS });
      await waitForData(page);
    },
    reload: () =>
      page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            BEN.rows = null;
            BEN.cargando = false;
            BEN.error = "";
            benCargar(resolve);
          }),
      ),
    waitForData: () => waitForData(page),

    currentView: async () => {
      const view = await page.evaluate(() => window.BEN?.vista ?? "");
      const known = VIEW_NAMES[view];
      if (!known) throw new Error(`Benchmark view not known: "${view}"`);
      return known;
    },
    showView: (view) => page.getByRole("tab", { name: VIEW_TABS[view] }).click(),
    showHandLoadedPromotions: () =>
      page.evaluate(() => {
        BEN.vista = "manual";
        benRender();
      }),

    setProvince: (province) => selectFilter(page, "Provincia", province),
    setRubro: (rubro) => selectFilter(page, "Rubro", rubro),
    setAudience: (audience) => selectFilter(page, "Tarjeta de la persona", AUDIENCES[audience]),
    setCardType: (card) => selectFilter(page, "Tipo de tarjeta", CARD_TYPES[card]),
    setOutcome: (outcome) =>
      page.locator(`${ROOT} .ben-pill`, { hasText: OUTCOME_PILLS[outcome] }).click(),
    setIncludeSalaryOnly: (include) =>
      page
        .locator(`${FILTERS} label.ben-f`, { hasText: "Incluir promos" })
        .locator("input")
        .setChecked(include),
    setReferencePurchase: async (rubro, amount) => {
      const field = page.locator(".ben-ref label", { hasText: rubro }).locator("input");
      await field.fill(String(amount));
      await field.press("Tab");
    },
    rememberedReferencePurchases: () => page.evaluate(() => localStorage.getItem("fg_bench_ref")),

    promotions: () =>
      page.evaluate(() =>
        benFiltradas().map((row) => ({
          title: row.titulo,
          bank: row.banco,
          rubro: row.rubro,
          source: row.fuente ?? null,
          days: row.dias ?? "",
          brandKey: row.marca_clave ?? "",
          banksSharing: row.bancos_n ?? null,
          returned: benDevuelve(row),
          cap: row.tope ?? null,
          audience: benSegTxt(row),
        })),
      ),
    bestOffer: (query) =>
      page.evaluate(({ bank, rubro, titles }) => {
        const best = benMejor(
          benFiltradas().filter(
            (row) =>
              (bank === undefined || row.banco === bank) &&
              (rubro === undefined || row.rubro === rubro) &&
              (titles === undefined || titles.includes(row.titulo)),
          ),
        );
        return best
          ? {
              title: best.r.titulo,
              returned: best.v,
              cap: best.r.tope ?? null,
              audience: benSegTxt(best.r),
              source: best.r.fuente ?? null,
            }
          : null;
      }, query),
    mostInstallments: (bank) =>
      page.evaluate(
        (name) => benMasCuotas(benFiltradas().filter((row) => row.banco === name))?.cuotas ?? null,
        bank,
      ),

    sourceLabels: () =>
      page.locator(".ben-chip").evaluateAll((chips) =>
        chips.map((chip) => ({
          text: chip.textContent,
          stale: chip.classList.contains("vieja"),
        })),
      ),
    rubroWinners: (rubro) =>
      page.locator(MAIN_TABLE_ROWS).evaluateAll(
        (rows, name) =>
          rows
            .filter((row) => row.querySelector("td strong")?.textContent === name)
            .flatMap((row) => Array.from(row.querySelectorAll("td")))
            .filter((cell) => cell.querySelector(".ben-c.gana"))
            .map((cell): "galicia" | "competitor" =>
              cell.classList.contains("gal") ? "galicia" : "competitor",
            ),
        rubro,
      ),
    headline: async () => (await page.locator(".ben-resumen").first().textContent()) ?? "",
    screenText: () => root.evaluate((element) => (element.textContent ?? "").replace(/\s+/g, " ")),
    tabs: () => page.locator(".ben-tab").allTextContents(),
    buttons: () => page.locator(`${ROOT} button`).allTextContents(),
    tableCount: () => page.locator(`${ROOT} table.ben-t`).count(),
    tableCells: () => page.locator(`${MAIN_TABLE_ROWS} td`).allTextContents(),
    tableRows: () =>
      page
        .locator(MAIN_TABLE_ROWS)
        .evaluateAll((rows) => rows.map((row) => (row.textContent ?? "").replace(/\s+/g, " "))),
    firstColumn: () =>
      page
        .locator(MAIN_TABLE_ROWS)
        .evaluateAll((rows) => rows.map((row) => row.querySelector("td")?.textContent ?? "")),
    listedBrands: async () =>
      (await page.locator(`${MAIN_TABLE_ROWS} .ben-marca`).allTextContents()).map((brand) =>
        brand.trim(),
      ),
    tableLinks: () =>
      page
        .locator(`${ROOT} table.ben-t a`)
        .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? "")),
    hasInjectedImage: async () => (await page.locator(`${ROOT} img[src="x"]`).count()) > 0,
    openFirstDayListing: async () => {
      const button = page.getByRole("button", { name: /^Ver las \d+ promos$/ }).first();
      if ((await button.count()) === 0) return null;
      const announced = Number(/\d+/.exec(await button.innerText())?.[0]);
      await button.click();
      const tables = page.locator(`${ROOT} table.ben-t`);
      const rows = await tables.nth(1).locator("tbody tr").count();
      return { announced, rows, hasHeading: /: \d+ promos/.test(await root.innerText()) };
    },

    searchMerchant: (text) => page.locator("#ben-com-q").fill(text),
    setMerchantDay: async (day) => {
      await page.locator(`${ROOT} select:has(option[value="-1"])`).selectOption(String(day ?? -1));
    },
    merchantResults: () =>
      page.locator("#ben-com-res").evaluate((results) => {
        const rows = Array.from(results.querySelectorAll("tbody tr"));
        const banks = rows.map((row) => row.querySelector("td")?.textContent ?? "");
        return {
          text: (results.textContent ?? "").replace(/\s+/g, " "),
          rows: rows.length,
          banks: [...new Set(banks)],
        };
      }),

    presentPromotion: (row) =>
      page.evaluate(
        (promotion) => ({
          link: benLink(promotion),
          schedule: benEmpieza(promotion),
          cap: benTopeTxt(promotion),
          audience: benSegTxt(promotion),
        }),
        row,
      ),

    editorIsOpen: async () => (await page.locator(EDITOR).count()) > 0,
    cancelEditor: () => page.locator(EDITOR).getByRole("button", { name: "Cancelar" }).click(),
    saveEditor: () => page.locator("#ben-ed-ok").click(),
    waitForEditorClosed: () =>
      page.locator(EDITOR).waitFor({ state: "detached", timeout: DATA_TIMEOUT_MS }),

    startNewCard: () => page.getByRole("button", { name: "+ Agregar tarjeta" }).click(),
    editCard: (bank, card) =>
      tableRow(page, bank, card).getByRole("button", { name: "Editar" }).click(),
    fillCard: (fields) => fillCard(page, fields),
    removeCard: async (bank, card) => {
      await tableRow(page, bank, card).getByRole("button", { name: "Quitar" }).click();
      await page.locator("#fg-cf-ok").click();
    },

    startNewHandLoadedPromotion: () =>
      page.getByRole("button", { name: "+ Agregar promo" }).click(),
    editHandLoadedPromotion: (bank, title) =>
      tableRow(page, bank, title).getByRole("button", { name: "Editar" }).click(),
    fillHandLoadedPromotion: (fields) => fillHandLoaded(page, fields),
    handLoadedCondition: () => page.locator("#ben-m-condicion").inputValue(),

    downloadExcel: () => downloadExcel(page),
    refreshNow: async () => {
      await page.locator(REFRESH).click();
      await page.locator(`${REFRESH}:not([disabled])`).waitFor({ timeout: REFRESH_TIMEOUT_MS });
      await waitForData(page);
    },
  };
}
