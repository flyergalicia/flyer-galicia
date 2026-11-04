import { type Page } from "@playwright/test";
import { type DashboardDriver, type DashboardFigures } from "../../commercial-actions.ts";
import { readUntil, screenToSettle } from "./wait.ts";

const PANEL = ".ges-qp";
const QUARTER_HEADS = ".ges-q-h";
const QUARTER_CARDS = ".ges-q-c";
const OFFICER_FIELD = "Oficial Payroll";
const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];
const MONTHS_PER_QUARTER = 3;

async function whileDashboardAnswers(page: Page, act: () => Promise<void>): Promise<void> {
  const answered = page.waitForResponse((response) =>
    response.url().includes("/rest/v1/rpc/gestiones_tablero"),
  );
  await act();
  await answered;
  await screenToSettle(page);
}

function clickOptions({ adding }: { adding: boolean } = { adding: false }) {
  return adding ? { modifiers: ["Shift" as const] } : {};
}

function quarterOfMonth(month: string): number {
  return Math.ceil(Number(month) / MONTHS_PER_QUARTER);
}

export function createDashboard(page: Page): DashboardDriver {
  const read = (): Promise<DashboardFigures | null> =>
    page.evaluate(() => {
      const { tablero } = GES;
      if (!tablero) return null;
      return {
        actions: tablero.kpis?.visitas ?? 0,
        unassigned: tablero.kpis?.sin_asignar ?? 0,
        hunterIds: (tablero.por_hunter ?? []).map(({ id }) => id),
        countedOfficerIds: (tablero.por_dueno ?? []).map(({ id }) => id),
      };
    });
  const waitForDashboardFigures: DashboardDriver["waitForDashboardFigures"] = async (isDone) => {
    const figures = await readUntil(page, read, (value) => value !== null && isDone(value));
    if (!figures) throw new Error("The dashboard never brought its numbers");
    return figures;
  };
  const arrowOf = (quarter: number) =>
    page
      .locator(QUARTER_CARDS)
      .nth(quarter - 1)
      .locator(".ges-q-x");
  return {
    dashboardFigures: () => waitForDashboardFigures(() => true),
    waitForDashboardFigures,
    choosePeriod: (label) =>
      whileDashboardAnswers(page, async () => {
        await page.locator("#ges-body").getByLabel("Período").selectOption({ label });
      }),
    officerChoices: async () => {
      const options = await page
        .locator("#ges-body")
        .getByLabel(OFFICER_FIELD)
        .locator("option")
        .allTextContents();
      return options.slice(1);
    },
    chooseOfficer: (name) =>
      whileDashboardAnswers(page, async () => {
        const option = name === null ? { index: 0 } : { label: name };
        await page.locator("#ges-body").getByLabel(OFFICER_FIELD).selectOption(option);
      }),
    quarterChoices: async () => {
      await page.locator(PANEL).waitFor();
      const labels = await page.locator(`${QUARTER_HEADS} .ges-q-b`).allTextContents();
      return labels.map((label) => label.slice(0, 2));
    },
    chosenMonths: () => page.evaluate(() => [...GES.f.meses]),
    touchQuarter: (quarter, options) =>
      whileDashboardAnswers(page, () =>
        page
          .locator(`${QUARTER_HEADS} .ges-q-b`)
          .nth(quarter - 1)
          .click(clickOptions(options)),
      ),
    openQuarterMonths: async (quarter) => {
      await arrowOf(quarter).click();
      return page
        .locator(QUARTER_CARDS)
        .nth(quarter - 1)
        .locator(".ges-q-m .ges-q-b")
        .count();
    },
    touchMonth: async (month, options) => {
      const quarter = quarterOfMonth(month);
      if ((await arrowOf(quarter).getAttribute("aria-expanded")) !== "true") {
        await arrowOf(quarter).click();
      }
      await whileDashboardAnswers(page, () =>
        page
          .locator(".ges-q-m .ges-q-b")
          .getByText(MONTH_NAMES[Number(month) - 1] ?? month, { exact: true })
          .click(clickOptions(options)),
      );
    },
    chooseYear: (year) =>
      whileDashboardAnswers(page, async () => {
        await page.locator(".ges-q-a select").selectOption(String(year));
      }),
  };
}
