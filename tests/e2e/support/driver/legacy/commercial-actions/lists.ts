import { type Page } from "@playwright/test";
import {
  type ActionListDriver,
  type CompaniesDriver,
  type CompanyFilter,
} from "../../commercial-actions.ts";
import { readUntil, textOf } from "./wait.ts";

const FILTER_FIELD = "#ges-emp-f";
const COMPANIES = "#ges-emp-tb";
const SEARCH = ".ges-tool-e input";

const FILTER_KEY: Readonly<Record<CompanyFilter, string>> = {
  all: "todas",
  forwarded: "derivadas",
  "not-forwarded": "sin",
  "with-signups": "altas",
};

export function createCompanies(page: Page): CompaniesDriver {
  return {
    filterCompanies: async (filter) => {
      await page.locator(FILTER_FIELD).selectOption(FILTER_KEY[filter]);
      return page.locator(`${COMPANIES} .ges-td-e`).count();
    },
    companyFilterOptions: () => page.locator(`${FILTER_FIELD} option`).allTextContents(),
    searchCompanies: (text) => page.locator(SEARCH).fill(text),
    companiesText: () => textOf(page, COMPANIES),
  };
}

export function createActionList(page: Page): ActionListDriver {
  const actionRows = () =>
    page.evaluate(() =>
      [...document.querySelectorAll("#ges-list .ges-row")].map((row) => ({
        text: row.textContent,
        type: row.querySelector(".ges-c-tipo")?.textContent ?? "",
        flagged: row.classList.contains("nueva"),
      })),
    );
  return {
    actionRows: async () => {
      await page.locator("#ges-list").waitFor();
      return actionRows();
    },
    waitForActionRows: (isDone) => readUntil(page, actionRows, isDone),
    searchActions: (text) => page.locator("#ges-q").fill(text),
    filterActionsByType: async (label) => {
      await page.locator("#ges-ftipo").selectOption({ label });
    },
    filterActionsFrom: (date) => page.locator("#ges-fd1").fill(date),
    // "Limpiar filtros" only shows after the whole solapa repaints, not after choosing a filter.
    clearActionFilters: () =>
      page.evaluate(() => {
        gesListaLimpiar();
      }),
  };
}
