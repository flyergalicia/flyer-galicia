import ExcelJS from "exceljs";
import { type Locator, type Page } from "@playwright/test";
import {
  type CapField,
  type CompanyCategory,
  type CompanyOfficer,
  type CompanyRecord,
  type CompanyRegistryDriver,
  type RegistrySheet,
  type SheetRow,
} from "../company-registry.ts";
import { partialDriver } from "./pending.ts";

const LOAD_TIMEOUT_MS = 8_000;
const SETTLE_MS = 300;
const OFFICERS_SETTLE_MS = 400;
const SHEET_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const COMPANIES_ROUTE = "**/rest/v1/padron_empresas*";
const OPTIONS_ROUTE = "**/storage/v1/object/public/flyers/_opciones.json*";
/** The flyer the driver offers as a category. */
const CATEGORY_OPTION = 9;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };

const sleep = (page: Page, ms: number) => page.waitForTimeout(ms);

function database(page: Page): Locator {
  return page.locator('[data-screen="my-database"]');
}

function databaseWindow(page: Page): Locator {
  return page.getByRole("dialog", { name: /Base de datos/ });
}

function pane(page: Page): Locator {
  return database(page).getByRole("tabpanel").locator("visible=true");
}

function decisionDialog(page: Page): Locator {
  return page.getByTestId("decision-dialog");
}

function editorRow(page: Page, row: number): Locator {
  return page.locator(`[data-testid="company-editor-row"][data-row="${String(row)}"]`);
}

function generatorRow(page: Page, row: number): Locator {
  return page.locator(`[data-testid="generator-row"][data-row="${String(row)}"]`);
}

async function openRegistry(page: Page): Promise<void> {
  if (await database(page).isVisible()) return;
  await page.getByRole("button", { name: /^Menú de / }).click();
  await page
    .getByRole("menu", { name: "Tu cuenta" })
    .getByRole("menuitem", { name: "Base de datos" })
    .click();
  await database(page).waitFor({ timeout: LOAD_TIMEOUT_MS });
}

async function chooseTab(page: Page, label: string): Promise<void> {
  const tab = databaseWindow(page).getByRole("tab", { name: label });
  if ((await tab.count()) > 0) await tab.click();
  await sleep(page, SETTLE_MS);
}

function storedOfficer({ name, phone, email }: CompanyOfficer) {
  return { nombre: name, celular: phone ?? "", email: email ?? "" };
}

function storedCategory({ option, name, cap, secondCap }: CompanyCategory) {
  return {
    ...(option === undefined ? {} : { opcion: option }),
    ...(name === undefined ? {} : { txt: name }),
    ...(cap === undefined ? {} : { importe: cap }),
    ...(secondCap === undefined ? {} : { importe2: secondCap }),
  };
}

function storedCompany(company: CompanyRecord) {
  return {
    empresa: company.name,
    cuits: company.taxIds ?? [],
    config: company.cashback,
    asesores: (company.officers ?? []).map(storedOfficer),
    rubro: storedCategory(company.category ?? {}),
  };
}

function readCategory({
  opcion,
  txt,
  importe,
  importe2,
}: {
  opcion?: number;
  txt?: string;
  importe?: string;
  importe2?: string;
}): CompanyCategory {
  return {
    ...(opcion ? { option: opcion } : {}),
    ...(txt ? { name: txt } : {}),
    ...(importe === undefined ? {} : { cap: importe }),
    ...(importe2 === undefined ? {} : { secondCap: importe2 }),
  };
}

function cellText(value: ExcelJS.CellValue): string {
  return typeof value === "string" ? value : "";
}

async function encodeSheet(lines: string[][]): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Hoja1");
  for (const line of lines) sheet.addRow(line);
  return Buffer.from(await book.xlsx.writeBuffer());
}

async function decodeSheet(path: string): Promise<{ head: string[]; rows: string[][] }> {
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(path);
  const [sheet] = book.worksheets;
  const lines: string[][] = [];
  sheet?.eachRow((row) => {
    const values = row.values;
    if (Array.isArray(values)) lines.push(Array.from(values, cellText).slice(1));
  });
  const [head = [], ...rows] = lines;
  return { head, rows };
}

async function downloadSheet(page: Page, label: string): Promise<RegistrySheet> {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    pane(page).getByRole("button", { name: label }).click(),
  ]);
  const { head, rows } = await decodeSheet(await download.path());
  return { name: download.suggestedFilename(), head, rows };
}

/** The list the cloud answers with, from here on: a person gets it by reading it again. */
async function answerCompanies(page: Page, companies: readonly CompanyRecord[]): Promise<void> {
  await page.route(COMPANIES_ROUTE, async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({ json: companies.map(storedCompany), headers: CORS });
  });
}

async function waitForCompanies(page: Page, count: number): Promise<void> {
  await page.waitForFunction(
    (wanted) => {
      const probe = window["__flyerProbe"]?.companyRegistry?.();
      return probe && !probe.companiesFailed() && probe.ownCompanyCount() === wanted;
    },
    count,
    { timeout: LOAD_TIMEOUT_MS },
  );
  await sleep(page, SETTLE_MS);
}

async function reloadCompaniesWith(page: Page, companies: readonly CompanyRecord[]): Promise<void> {
  await answerCompanies(page, companies);
  await openRegistry(page);
  await chooseTab(page, "Mis empresas");
  await pane(page).getByRole("button", { name: "Recargar" }).click();
  await waitForCompanies(page, companies.length);
}

function createLoading(page: Page) {
  return {
    // The list stays in memory while the page lives: a new page reads it again.
    forgetCompanies: async () => {
      await page.reload();
      await page.getByRole("banner").waitFor({ timeout: LOAD_TIMEOUT_MS });
    },
    loadCompanies: async () => {
      await openRegistry(page);
    },
    waitForConnectionProblem: async () => {
      await page.waitForFunction(
        () => window["__flyerProbe"]?.companyRegistry?.().companiesFailed() === true,
        null,
        { timeout: LOAD_TIMEOUT_MS },
      );
      await sleep(page, SETTLE_MS);
    },
    waitForCompaniesLoaded: (count: number) => waitForCompanies(page, count),
    ownCompanyCount: () =>
      page.evaluate(() => window["__flyerProbe"]?.companyRegistry?.().ownCompanyCount() ?? 0),
    retryConnection: () =>
      page
        .getByRole("button", { name: /Reintentar/ })
        .last()
        .click(),
  };
}

function createSearch(page: Page) {
  const list = page.getByTestId("company-search-list");
  const suggestions = page.getByTestId("company-suggestions");
  const field = page.getByTestId("company-name");
  return {
    openSearch: async () => {
      await page.getByTestId("company-search-button").click();
      await sleep(page, SETTLE_MS);
    },
    closeSearch: () => page.getByTestId("company-search").getByLabel("Cerrar").click(),
    waitForSearchResults: (count: number) =>
      page
        .waitForFunction(
          (wanted) =>
            document.querySelectorAll(
              '[data-testid="company-search-list"] [data-testid="company-option"]',
            ).length === wanted,
          count,
          { timeout: LOAD_TIMEOUT_MS },
        )
        .then(() => undefined),
    searchList: async () => ({
      text: await list.innerText(),
      hasRetry: (await list.getByRole("button").count()) > 0,
      companies: await list.locator('[data-part="name"]').allInnerTexts(),
      ownerTags: await list.locator('[data-part="owner"]').allInnerTexts(),
    }),
    searchFor: async (text: string) => {
      await page.getByTestId("company-search-query").fill(text);
      await sleep(page, SETTLE_MS);
    },
    retrySearch: () => list.getByRole("button").click(),
    chooseFromSearch: async (name: string) => {
      await list.getByTestId("company-option").filter({ hasText: name }).first().click();
      await sleep(page, SETTLE_MS);
    },
    searchOffered: () => page.getByTestId("company-search-button").isVisible(),
    typeCompanyName: (text: string) => field.fill(text),
    suggestions: async () => {
      await sleep(page, SETTLE_MS);
      return {
        visible: await suggestions.isVisible(),
        count: await suggestions.getByTestId("company-option").count(),
        ownerTags: await suggestions.locator('[data-part="owner"]').count(),
      };
    },
    closeSuggestions: () => field.press("Escape"),
    suggestedCompanies: async () => {
      await sleep(page, SETTLE_MS);
      return suggestions.locator('[data-part="name"]').allInnerTexts();
    },
    pressInCompanyField: (key: string) => field.press(key),
    companyNote: async () => {
      const note = page.getByTestId("company-note");
      return (await note.isVisible()) ? await note.innerText() : "";
    },
  };
}

function createUpdateDialog(page: Page) {
  const dialog = decisionDialog(page);
  return {
    waitForUpdateDialog: async () => {
      await dialog.waitFor({ timeout: LOAD_TIMEOUT_MS });
      return {
        title: await dialog.getByRole("heading").innerText(),
        text: await dialog.innerText(),
        asksForTaxId: (await dialog.getByLabel("CUIT / CUITs del grupo").count()) > 0,
      };
    },
    updateDialogIsOpen: async () => {
      await sleep(page, OFFICERS_SETTLE_MS);
      return dialog.isVisible();
    },
    acceptUpdateDialog: async () => {
      await dialog.locator('[data-decision="yes"]').click();
      await dialog.waitFor({ state: "detached", timeout: LOAD_TIMEOUT_MS });
    },
    dismissUpdateDialog: () => dialog.locator("[data-decision]").first().click(),
    declineUpdateDialog: () => dialog.locator('[data-decision="no"]').click(),
    clickOutsideUpdateDialog: () => page.mouse.click(4, 4),
    updateDialogLosses: async () => ({
      redItems: await dialog.locator('[data-danger="true"]').allTextContents(),
      alert: (await dialog.getByTestId("decision-alert").count())
        ? await dialog.getByTestId("decision-alert").innerText()
        : "",
      redColor: await dialog
        .locator('[data-danger="true"]')
        .first()
        .evaluate((item) => getComputedStyle(item).color),
    }),
    fillTaxIdInDialog: (text: string) => dialog.getByLabel("CUIT / CUITs del grupo").fill(text),
    updateDialogTaxIdNote: async () =>
      await dialog
        .getByLabel("CUIT / CUITs del grupo")
        .locator("xpath=following-sibling::p")
        .innerText(),
  };
}

function createGenerator(page: Page) {
  const generator = page.getByTestId("generator");
  return {
    showGenerator: async () => {
      await openRegistry(page);
      await chooseTab(page, "Mis empresas");
      await pane(page)
        .getByRole("button", { name: /Generar flyers/ })
        .click();
      await generator.waitFor({ timeout: LOAD_TIMEOUT_MS });
    },
    showGeneratorAndLoad: async () => {
      await openRegistry(page);
      await chooseTab(page, "Mis empresas");
      await pane(page)
        .getByRole("button", { name: /Generar flyers/ })
        .click();
    },
    hideGenerator: () =>
      pane(page)
        .getByRole("button", { name: /Cerrar generador/ })
        .click(),
    generatorText: () => generator.innerText(),
    generatorRowCount: () => page.getByTestId("generator-row").count(),
    openGeneratorWith: async (companies: CompanyRecord[]) => {
      await reloadCompaniesWith(page, companies);
      await pane(page)
        .getByRole("button", { name: /Generar flyers/ })
        .click();
      await page.getByTestId("generator-row").first().waitFor();
    },
    tickInGenerator: async (rows: number[]) => {
      const first = page.getByTestId("generator-row").first();
      await first.evaluate((row) => {
        row.setAttribute("data-before-ticking", "true");
      });
      for (const row of rows) await generatorRow(page, row).getByRole("checkbox").check();
      return {
        repainted: (await first.getAttribute("data-before-ticking")) !== "true",
        counter: await page.getByTestId("generator-count").innerText(),
      };
    },
    filterGenerator: async (text: string) => {
      await generator.getByPlaceholder("Filtrar por razón social o CUIT...").fill(text);
      await sleep(page, SETTLE_MS);
      return page.getByTestId("generator-name").allInnerTexts();
    },
  };
}

function createDatabaseScreen(page: Page) {
  return {
    openRegistry: () => openRegistry(page),
    closeRegistry: async () => {
      await databaseWindow(page).getByRole("button", { name: "Cerrar" }).click();
      await database(page).waitFor({ state: "detached" });
    },
    databaseTabs: () => databaseWindow(page).getByRole("tab").allInnerTexts(),
    chooseDatabaseTab: (label: string) => chooseTab(page, label),
    registryStatus: async () => (await page.getByTestId("company-status").textContent()) ?? "",
    uploadRegistrySheet: async (lines: string[][]) => {
      await page.getByTestId("company-sheet-input").setInputFiles({
        name: "e.xlsx",
        mimeType: SHEET_MIME,
        buffer: await encodeSheet(lines),
      });
      await sleep(page, SETTLE_MS);
    },
    dismissImport: () => decisionDialog(page).locator('[data-decision="no"]').click(),
    downloadRegistrySheet: (kind: "companies" | "template") =>
      downloadSheet(page, kind === "companies" ? "Descargar Excel" : "Plantilla vacía"),
    templateName: async () => {
      await openRegistry(page);
      const { name } = await downloadSheet(page, "Plantilla vacía");
      await databaseWindow(page).getByRole("button", { name: "Cerrar" }).click();
      return name;
    },
    openInlineEditor: async () => {
      await pane(page)
        .getByRole("button", { name: /Editar en línea/ })
        .click();
      await page.getByTestId("company-editor").waitFor();
    },
    saveInlineEditor: async () => {
      const editor = page.getByTestId("company-editor");
      await editor.getByRole("button", { name: "Guardar cambios" }).click();
      await editor.waitFor({ state: "detached" });
    },
    renameInEditor: (row: number, name: string) =>
      editorRow(page, row).getByPlaceholder("Razón social").fill(name),
    advisorsInDatabase: async () => {
      await page
        .getByTestId("advisor-status")
        .filter({ hasNotText: "Cargando" })
        .waitFor({ timeout: LOAD_TIMEOUT_MS });
      return page
        .getByTestId("advisor-list")
        .locator("input")
        .evaluateAll((fields) =>
          fields.map((field) => (field instanceof HTMLInputElement ? field.value : "")),
        );
    },
    editAdvisorInDatabase: (row: number, name: string) =>
      page.getByTestId("advisor-row").nth(row).getByPlaceholder("Nombre real").fill(name),
    saveAdvisorsInDatabase: () => page.getByTestId("advisors-save").click(),
  };
}

function createEditor(page: Page) {
  // Choosing the flyers of the app is the administrator's: the cloud answers with it, and the app
  // reads that file when it starts. So the editor is left as it was, after starting again.
  let shown: readonly CompanyRecord[] | null = null;
  let filtered = "";
  const openEditorWith = async (companies: CompanyRecord[]) => {
    shown = companies;
    filtered = "";
    await reloadCompaniesWith(page, companies);
    const closed = pane(page).getByRole("button", { name: /Editar en línea/ });
    if ((await closed.count()) > 0) await closed.click();
    await page.getByTestId("company-editor").waitFor();
  };
  const filterEditor = async (text: string) => {
    filtered = text;
    await page
      .getByTestId("company-editor")
      .getByPlaceholder(/^Filtrar/)
      .fill(text);
    await sleep(page, SETTLE_MS);
  };
  return {
    openEditorWith,
    filterEditor,
    offerCurrentFlyerAsCategory: async (kind?: string) => {
      await page.route(OPTIONS_ROUTE, (route) =>
        route.fulfill({
          json: {
            opts: [
              { n: 1, nombre: "Opción 1" },
              {
                n: CATEGORY_OPTION,
                nombre: "Combustible",
                solapa: "rubros",
                ...(kind ? { rubro: kind } : {}),
              },
            ],
          },
          headers: CORS,
        }),
      );
      await page.reload();
      await openRegistry(page);
      if (shown) {
        await openEditorWith([...shown]);
        if (filtered) await filterEditor(filtered);
      }
      return CATEGORY_OPTION;
    },
    chooseCategoryFlyer: (row: number) =>
      editorRow(page, row)
        .getByLabel("Rubro")
        .selectOption({ index: 1 })
        .then(() => undefined),
    capFields: async (row: number): Promise<CapField[] | null> => {
      if ((await editorRow(page, row).count()) === 0) return null;
      return editorRow(page, row)
        .getByTestId("cap-field")
        .evaluateAll((fields) =>
          fields.flatMap((field) =>
            field instanceof HTMLInputElement
              ? [{ placeholder: field.placeholder, value: field.value, disabled: field.disabled }]
              : [],
          ),
        );
    },
    writeCaps: async (row: number, caps: string[]) => {
      for (const [position, cap] of caps.entries()) {
        await editorRow(page, row).getByTestId("cap-field").nth(position).fill(cap);
      }
    },
    editorCategory: async (row: number) =>
      readCategory(
        await page.evaluate(
          (index) => window["__flyerProbe"]?.companyRegistry?.().editorCategory(index) ?? {},
          row,
        ),
      ),
    expandOfficers: async (rows: number[]) => {
      for (const row of rows) {
        const line = editorRow(page, row);
        if ((await line.getAttribute("data-expanded")) !== "true") {
          await line.getByRole("button", { name: /Oficiales/ }).click();
        }
      }
    },
    expandedCompanies: () =>
      page
        .locator('[data-testid="company-editor-row"][data-expanded="true"]')
        .evaluateAll((rows) =>
          rows
            .toSorted((one, other) => Number(one.dataset.row) - Number(other.dataset.row))
            .map((row) => row.querySelector("input")?.value ?? ""),
        ),
    officerFieldsShown: () => page.getByTestId("officer-fields").count(),
    removeFromEditor: async (row: number) => {
      await editorRow(page, row).getByRole("button", { name: "Eliminar empresa" }).click();
      await page.getByRole("alertdialog").getByRole("button").nth(1).click();
    },
  };
}

async function withProbe<T>(page: Page, read: () => Promise<T>): Promise<T> {
  await openRegistry(page);
  return read();
}

function createSheets(page: Page) {
  return {
    sheetColumns: () =>
      withProbe(page, () =>
        page.evaluate(() => [
          ...(window["__flyerProbe"]?.companyRegistry?.().sheetColumns() ?? []),
        ]),
      ),
    exportAndReadBack: (companies: CompanyRecord[]) =>
      withProbe(page, () =>
        page.evaluate(
          (rows) =>
            window["__flyerProbe"]?.companyRegistry?.().exportAndReadBack(rows) ?? {
              cells: [],
              unchanged: [],
            },
          companies.map(storedCompany),
        ),
      ),
    capsOfSheetRow: (cells: Record<string, string>) =>
      withProbe(page, async () =>
        readCategory(
          await page.evaluate(
            (row) => window["__flyerProbe"]?.companyRegistry?.().capsOfSheetRow(row) ?? {},
            cells,
          ),
        ),
      ),
    validateSheet: (rows: SheetRow[]) =>
      withProbe(page, () =>
        page.evaluate(
          (sheet) =>
            window["__flyerProbe"]?.companyRegistry?.().validateSheet(sheet) ?? {
              firstCompanyCap: "",
              problems: [],
            },
          rows,
        ),
      ),
    destinationOption: (company: CompanyRecord) =>
      withProbe(page, () =>
        page.evaluate(
          (row) => window["__flyerProbe"]?.companyRegistry?.().destinationOption(row) ?? 0,
          storedCompany(company),
        ),
      ),
  };
}

function createProposals(page: Page) {
  const list = page.getByTestId("proposal-list");
  return {
    pendingProposals: async () => {
      await openRegistry(page);
      await chooseTab(page, "Cambios pendientes");
      await sleep(page, OFFICERS_SETTLE_MS);
      return list
        .getByTestId("proposal-card")
        .evaluateAll((cards) =>
          cards.flatMap((card) =>
            card instanceof HTMLElement
              ? [{ text: card.innerText, canAskBack: card.innerText.includes("Repreguntar") }]
              : [],
          ),
        );
    },
    answerProposal: async (button: string, text: string) => {
      await openRegistry(page);
      await chooseTab(page, "Cambios pendientes");
      const card = list.getByTestId("proposal-card").first();
      await card.getByRole("button", { name: button, exact: true }).click();
      await card.locator("textarea").fill(text);
      await card.getByTestId("proposal-confirm").click();
    },
  };
}

/** What can be reached today. The form of the flyer brings what is left: see etapa4-avance. */
export function createReactCompanyRegistryDriver(page: Page): CompanyRegistryDriver {
  return partialDriver<CompanyRegistryDriver>("companyRegistry", {
    ...createLoading(page),
    ...createSearch(page),
    ...createUpdateDialog(page),
    ...createGenerator(page),
    ...createDatabaseScreen(page),
    ...createEditor(page),
    ...createSheets(page),
    ...createProposals(page),
  });
}
