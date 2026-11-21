// The Excel of the dashboard: the numbers on screen and the actions the filters leave, nothing to
// come. New: the old suite did not download it.
import ExcelJS from "exceljs";
import { type Page } from "@playwright/test";
import { today } from "../../support/cloud/commercial-actions/model.ts";
import { openAsTeamMember } from "../../support/commercial-team.ts";
import { expect, test } from "../../support/test.ts";

type Sheets = Record<string, unknown[][]>;

function plain(value: unknown): unknown {
  if (value && typeof value === "object" && "result" in value) return value.result;
  return value;
}

async function downloadExcel(
  page: Page,
): Promise<{ name: string; sheets: Sheets; order: string[] }> {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Descargar Excel" }).click(),
  ]);
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(await download.path());
  const sheets: Sheets = {};
  for (const sheet of book.worksheets) {
    const lines: unknown[][] = [];
    sheet.eachRow((row) => {
      const values = row.values;
      if (Array.isArray(values)) lines.push(values.slice(1).map((value) => plain(value)));
    });
    sheets[sheet.name] = lines;
  }
  return {
    name: download.suggestedFilename(),
    sheets,
    order: book.worksheets.map(({ name }) => name),
  };
}

function column(lines: unknown[][], title: string): unknown[] {
  const [head = [], ...rows] = lines;
  const index = head.indexOf(title);
  return rows.map((row) => row[index]);
}

test("the Excel carries the numbers on screen and only the actions of the filter", async ({
  cloud,
  openApp,
}) => {
  cloud.seedCommercialActions();
  const { commercialActions: actions, page } = await openAsTeamMember(openApp, "officer");
  await actions.goToTab("dashboard");
  await actions.choosePeriod("Todo");
  const figures = await actions.dashboardFigures();

  const { name, sheets, order } = await downloadExcel(page);

  expect.soft(name, "the name has the day").toBe(`Gestiones_${today()}.xlsx`);
  expect.soft(order).toEqual(["Resumen", "Por hunter", "Por oficial", "Por empresa", "Gestiones"]);
  const summary = sheets.Resumen ?? [];
  expect
    .soft(summary.find(([label]) => label === "Acciones realizadas")?.[1], "as on screen")
    .toBe(figures.actions);
  expect.soft(summary.find(([label]) => label === "Período")?.[1]).toBe("Todo");
  expect
    .soft(column(sheets["Por hunter"] ?? [], "Nombre"), "no row of hunters without a name")
    .not.toContain(undefined);
  const dates = column(sheets.Gestiones ?? [], "Fecha").map(String);
  expect.soft(dates.length, "it has the actions").toBeGreaterThan(0);
  expect
    .soft(
      dates.filter((date) => date > today()),
      "what is still to come does not count",
    )
    .toEqual([]);

  await page.getByRole("combobox", { name: "Tipo", exact: true }).selectOption("feria");
  await actions.waitForScreenToSettle();
  const fairs = await downloadExcel(page);
  const companies = column(fairs.sheets.Gestiones ?? [], "Empresa");

  expect
    .soft(column(fairs.sheets.Gestiones ?? [], "Tipo"), "only fairs")
    .toEqual(companies.map(() => "Feria"));
  expect.soft(companies, "the fair already done").toContain("SUPERMERCADOS DEL VALLE SA");
  expect.soft(companies, "and not the one to come").not.toContain("LOGISTICA ANDINA SRL");
});
