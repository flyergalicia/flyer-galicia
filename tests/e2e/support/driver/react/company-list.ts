// The list of companies as a person reaches it, for whoever needs it to hold some: Base de datos,
// reading it again, and the generator of flyers with everything ticked.
import { type Download, type Locator, type Page } from "@playwright/test";
import {
  type CompanyCategory,
  type CompanyOfficer,
  type CompanyRecord,
  type FlyerGeneration,
} from "../company-registry.ts";
import { readZipEntries } from "../../golden-files.ts";
import { readFile } from "node:fs/promises";

const LOAD_TIMEOUT_MS = 8_000;
const SETTLE_MS = 300;
const GENERATION_TIMEOUT_MS = 60_000;
const COMPANIES_ROUTE = "**/rest/v1/padron_empresas*";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };
const SUMMARY_FILE = "Resumen.txt";

export const sleep = (page: Page, ms: number) => page.waitForTimeout(ms);

export function database(page: Page): Locator {
  return page.locator('[data-screen="my-database"]');
}

export function databaseWindow(page: Page): Locator {
  return page.getByRole("dialog", { name: /Base de datos/ });
}

export function pane(page: Page): Locator {
  return database(page).getByRole("tabpanel").locator("visible=true");
}

export function decisionDialog(page: Page): Locator {
  return page.getByTestId("decision-dialog");
}

export async function openRegistry(page: Page): Promise<void> {
  if (await database(page).isVisible()) return;
  await page.getByRole("button", { name: /^Menú de / }).click();
  await page
    .getByRole("menu", { name: "Tu cuenta" })
    .getByRole("menuitem", { name: "Base de datos" })
    .click();
  await database(page).waitFor({ timeout: LOAD_TIMEOUT_MS });
}

export async function closeRegistryIfOpen(page: Page): Promise<void> {
  if (!(await database(page).isVisible())) return;
  await databaseWindow(page).getByRole("button", { name: "Cerrar", exact: true }).click();
  await database(page).waitFor({ state: "detached" });
}

export async function chooseTab(page: Page, label: string): Promise<void> {
  const tab = databaseWindow(page).getByRole("tab", { name: label });
  if ((await tab.count()) > 0) await tab.click();
  await sleep(page, SETTLE_MS);
}

function storedOfficer({ name, phone, email }: CompanyOfficer) {
  return { nombre: name, celular: phone ?? "", email: email ?? "" };
}

export function storedCategory({ option, name, cap, secondCap }: CompanyCategory) {
  return {
    ...(option === undefined ? {} : { opcion: option }),
    ...(name === undefined ? {} : { txt: name }),
    ...(cap === undefined ? {} : { importe: cap }),
    ...(secondCap === undefined ? {} : { importe2: secondCap }),
  };
}

export function storedCompany(company: CompanyRecord) {
  return {
    empresa: company.name,
    cuits: company.taxIds ?? [],
    config: company.cashback,
    asesores: (company.officers ?? []).map(storedOfficer),
    rubro: storedCategory(company.category ?? {}),
  };
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

export async function waitForCompanies(page: Page, count: number): Promise<void> {
  await page.waitForFunction(
    (wanted) => {
      const probe = window["__flyerProbe"]?.companyList?.();
      return probe && !probe.companiesFailed() && probe.ownCompanyCount() === wanted;
    },
    count,
    { timeout: LOAD_TIMEOUT_MS },
  );
  await sleep(page, SETTLE_MS);
}

export async function reloadCompaniesWith(
  page: Page,
  companies: readonly CompanyRecord[],
): Promise<void> {
  await answerCompanies(page, companies);
  await openRegistry(page);
  await chooseTab(page, "Mis empresas");
  await pane(page).getByRole("button", { name: "Recargar" }).click();
  await waitForCompanies(page, companies.length);
}

function generator(page: Page): Locator {
  return page.getByTestId("generator");
}

/** The generator open over those companies, all of them ticked. */
async function tickAllOf(page: Page, companies: readonly CompanyRecord[]): Promise<void> {
  await reloadCompaniesWith(page, companies);
  const open = pane(page).getByRole("button", { name: /Generar flyers/ });
  if (await open.isVisible()) await open.click();
  await generator(page).getByTestId("generator-row").first().waitFor({ timeout: LOAD_TIMEOUT_MS });
  await generator(page).getByRole("button", { name: "Todas" }).click();
}

function pressGenerate(page: Page) {
  return generator(page)
    .getByRole("button", { name: /Generar ZIP/ })
    .click();
}

/** What Generar flyers asks before starting, answered with "Volver". */
export async function questionBeforeGenerating(
  page: Page,
  companies: readonly CompanyRecord[],
): Promise<string> {
  await tickAllOf(page, companies);
  await pressGenerate(page);
  const question = page.getByRole("alertdialog");
  await question.waitFor({ timeout: LOAD_TIMEOUT_MS });
  const text = (await question.innerText()).replace(/\s+/g, " ");
  await question.getByRole("button", { name: "Volver" }).click();
  return text;
}

/** All the way, as a person does: it ends with the window that tells how it went. */
export async function generateCompanies(
  page: Page,
  companies: readonly CompanyRecord[],
): Promise<FlyerGeneration> {
  await tickAllOf(page, companies);
  const downloads: Download[] = [];
  const onDownload = (download: Download) => {
    downloads.push(download);
  };
  page.on("download", onDownload);
  await pressGenerate(page);
  await page.getByRole("alertdialog").getByRole("button", { name: "Generar", exact: true }).click();
  await decisionDialog(page).waitFor({ timeout: GENERATION_TIMEOUT_MS });
  page.off("download", onDownload);
  const [last] = downloads.slice(-1);
  const entries = last
    ? readZipEntries(await readFile(await last.path()))
    : new Map<string, Buffer>();
  const screen = await page.evaluate(() => ({
    finalOption: window["__flyerProbe"]?.flyerWorkspace?.().getState().slot.option ?? 0,
    stillGenerating: window["__flyerProbe"]?.flyerKnowledge?.().isGenerating() ?? false,
  }));
  return {
    zips: downloads.length,
    files: [...entries.keys()],
    summary: entries.get(SUMMARY_FILE)?.toString("utf8") ?? "",
    notice: await decisionDialog(page).innerText(),
    ...screen,
  };
}
