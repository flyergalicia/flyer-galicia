import { type Locator, type Page } from "@playwright/test";
import {
  type ActionFormDriver,
  type AgendaAssignDriver,
  type AgendaDirection,
  type AgendaDriver,
  type AgendaLayout,
  type DashboardDriver,
  type DashboardFigures,
} from "../commercial-actions.ts";

const WAIT_MS = 15_000;
const POLL_MS = 100;
const SETTLED_MS = 250;
const SETTLE_LIMIT_MS = 8000;
/** The height of one hour on the agenda. */
const HOUR_HEIGHT_PX = 46;
const MONTHS_PER_QUARTER = 3;
const SCHEDULE_BUTTON = /^\+ (Asignar|Agendar)$/;
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

const LAYOUT_MARK: Readonly<Record<AgendaLayout, string>> = {
  hours: "agenda-day",
  team: "agenda-team",
  month: "agenda-month",
};

const MOVE_BUTTON: Readonly<Record<AgendaDirection, number>> = { previous: 0, today: 1, next: 2 };

const screen = (page: Page) => page.getByTestId("commercial-screen");
const agenda = (page: Page) => page.getByTestId("agenda");
const windowOf = (page: Page) => page.getByTestId("action-window");
const week = (page: Page) => page.getByTestId("hunter-week");

function textOf(locator: Locator): Promise<string> {
  return locator.evaluateAll((found) => found.map((element) => element.textContent).join(""));
}

/** The screen paints by itself when an answer arrives, even after what was being awaited. */
export async function settle(page: Page): Promise<void> {
  const read = () => screen(page).evaluate((body) => body.innerHTML);
  const deadline = performance.now() + SETTLE_LIMIT_MS;
  let before = await read();
  while (performance.now() < deadline) {
    await page.waitForTimeout(SETTLED_MS);
    const now = await read();
    if (now === before && !/Cargando…/.test(now)) return;
    before = now;
  }
}

function isThere(locator: Locator): Promise<boolean> {
  return locator
    .first()
    .waitFor({ timeout: WAIT_MS })
    .then(
      () => true,
      () => false,
    );
}

export function createAgendaDriver(page: Page): AgendaDriver {
  const views = () => agenda(page).getByRole("group", { name: "Cómo ver la agenda" });
  const agendaMonth = async () => (await agenda(page).getAttribute("data-month")) ?? "";
  const moveAgenda = async (direction: AgendaDirection) => {
    await page.getByTestId("agenda-nav").getByRole("button").nth(MOVE_BUTTON[direction]).click();
    await settle(page);
  };
  return {
    chooseAgendaView: async (label) => {
      await views().getByRole("button", { name: label, exact: true }).click();
      await settle(page);
    },
    agendaViewShown: async () => {
      await views().waitFor({ timeout: WAIT_MS });
      return views().locator('button[aria-pressed="true"]').innerText();
    },
    waitForAgendaLayout: async (layout) => {
      if (!(await isThere(agenda(page).getByTestId(LAYOUT_MARK[layout])))) return false;
      const others = Object.entries(LAYOUT_MARK).filter(([key]) => key !== layout);
      const shown = await Promise.all(
        others.map(([, mark]) => agenda(page).getByTestId(mark).count()),
      );
      return shown.every((count) => count === 0);
    },
    agendaDayColumns: () => agenda(page).getByTestId(LAYOUT_MARK.hours).count(),
    chooseWhoseAgenda: async (name) => {
      await agenda(page).getByLabel("Agenda de").selectOption({ label: name });
    },
    takenBlocks: () =>
      agenda(page)
        .locator('[data-testid="agenda-block"][data-taken="true"]')
        .evaluateAll((taken) => ({
          count: taken.length,
          thatOpen: taken.filter((block) => block.tagName === "BUTTON").length,
        })),
    agendaRangeLabel: () => textOf(page.getByTestId("agenda-range")),
    agendaMonth,
    moveAgenda,
    showMonthOf: async (date) => {
      if ((await agendaMonth()) !== date.slice(0, 7)) await moveAgenda("next");
    },
    agendaDayShown: () =>
      page.evaluate(() => ({
        date: document.querySelector('[data-testid="agenda"]')?.getAttribute("data-day") ?? "",
        heading: document.querySelector('[data-testid="agenda-day-head"]')?.textContent ?? "",
      })),
    openContactList: () =>
      page
        .locator('[data-tray="contact"]')
        .getByRole("button", { name: /^Ver todas/ })
        .click(),
    chooseContact: (name) =>
      windowOf(page).getByRole("button").filter({ hasText: name }).first().click(),
    openFromTray: async (tray, company) => {
      await page
        .locator(`[data-tray="${tray}"]`)
        .getByRole("button")
        .filter({ hasText: company })
        .click();
      await page.getByTestId("confirm-assignment").waitFor({ timeout: WAIT_MS });
    },
  };
}

/** What the window that assigns has of the agenda. */
export function createFormOfAgenda(page: Page): Partial<ActionFormDriver> {
  return {
    startScheduling: async () => {
      await agenda(page).getByRole("button", { name: SCHEDULE_BUTTON }).click();
      await windowOf(page).waitFor({ timeout: WAIT_MS });
    },
    waitForHunterWeek: async () => {
      if (!(await isThere(page.getByTestId("hunter-week-title")))) return null;
      const blocks = week(page).getByTestId("agenda-block");
      return {
        title: await textOf(page.getByTestId("hunter-week-title")),
        blocks: await blocks.count(),
        blocksThatOpen: await week(page).locator('button[data-testid="agenda-block"]').count(),
      };
    },
    touchHunterWeek: (hoursBelowTop) =>
      week(page)
        .getByTestId("agenda-day")
        .first()
        .click({ position: { x: 5, y: HOUR_HEIGHT_PX * hoursBelowTop + 5 } }),
    hunterWeekSizes: () =>
      week(page).evaluate((panel) => {
        const grid = panel.querySelector('[data-testid="hunter-week-grid"]');
        return {
          panelWidth: panel.clientWidth,
          windowWidth: panel.parentElement?.clientWidth ?? 0,
          scrollWidth: grid?.scrollWidth ?? 0,
          clientWidth: grid?.clientWidth ?? 0,
          scrollHeight: grid?.scrollHeight ?? 0,
          clientHeight: grid?.clientHeight ?? 0,
        };
      }),
  };
}

export function createAgendaAssignDriver(page: Page): AgendaAssignDriver {
  const results = () => page.getByTestId("form-company-results");
  const preview = () => page.getByTestId("agenda-paste-preview");
  const pasteButton = () => page.getByRole("button", { name: "Pegar desde Excel" });
  return {
    searchCompanyToAssign: (text) => page.getByTestId("form-company").fill(text),
    companySearchResults: () => textOf(results()),
    chooseCompanyFound: (name) => results().getByRole("button").filter({ hasText: name }).click(),
    confirmAgendaAction: () => page.getByTestId("confirm-agenda").click(),
    openAgendaPaste: async () => {
      await pasteButton().click();
      await page.getByTestId("agenda-paste-text").waitFor({ timeout: WAIT_MS });
    },
    agendaPasteOffered: () => pasteButton().isVisible(),
    pasteAgenda: (text) => page.getByTestId("agenda-paste-text").fill(text),
    agendaPreviewText: () => textOf(preview()),
    waitForAgendaReview: async () => {
      await page.getByTestId("agenda-paste-summary").waitFor({ timeout: WAIT_MS });
      const rows = await page.getByTestId("agenda-paste-row").evaluateAll((found) =>
        found.map((row) => {
          const [date = "", time = "", company = "", hunter = "", place = "", status = ""] =
            Array.from(row.querySelectorAll("td"), (cell) => cell.textContent);
          return { date, time, company, hunter, place, status };
        }),
      );
      const add = page.getByTestId("agenda-paste-add");
      return {
        summary: await textOf(page.getByTestId("agenda-paste-summary")),
        rows,
        addButton: { text: await textOf(add), locked: await add.isDisabled() },
      };
    },
    retryAgendaReview: () => preview().getByRole("button", { name: "Probar de nuevo" }).click(),
    addPastedAgenda: () => page.getByTestId("agenda-paste-add").click(),
  };
}

async function whileDashboardAnswers(
  page: Page,
  act: () => Promise<void>,
  whatItAsks: () => Promise<string> = () => Promise.resolve(""),
): Promise<void> {
  const before = await whatItAsks();
  const answered = page
    .waitForResponse((response) => response.url().includes("/rest/v1/rpc/gestiones_tablero"), {
      timeout: WAIT_MS,
    })
    .catch(() => null);
  await act();
  // The same months as before ask nothing: the numbers on screen already are theirs.
  if ((await whatItAsks()) !== before || before === "") await answered;
  await settle(page);
}

function clickOptions({ adding }: { adding: boolean } = { adding: false }) {
  return adding ? { modifiers: ["Shift" as const] } : {};
}

async function readFigures(page: Page): Promise<DashboardFigures | null> {
  const figures = await page.evaluate(
    () => window["__flyerProbe"]?.commercialDashboard?.() ?? null,
  );
  if (!figures) return null;
  return {
    ...figures,
    countedOfficerIds: figures.countedOfficerIds.flatMap((id) => (id ? [id] : [])),
  };
}

export function createDashboardDriver(page: Page): DashboardDriver {
  const filters = () => page.getByTestId("dashboard-filters");
  const panel = () => page.getByTestId("quarter-panel");
  const quarter = (number: number) => panel().locator(`[data-quarter="${String(number)}"]`);
  const arrowOf = (number: number) => quarter(number).getByTestId("quarter-arrow");
  const monthsAsked = async () => (await panel().getAttribute("data-months")) ?? "";
  const waitForDashboardFigures: DashboardDriver["waitForDashboardFigures"] = async (isDone) => {
    const deadline = performance.now() + WAIT_MS;
    let figures = await readFigures(page);
    while ((figures === null || !isDone(figures)) && performance.now() < deadline) {
      await page.waitForTimeout(POLL_MS);
      figures = await readFigures(page);
    }
    if (!figures) throw new Error("The dashboard never brought its numbers");
    return figures;
  };
  return {
    dashboardFigures: () => waitForDashboardFigures(() => true),
    waitForDashboardFigures,
    choosePeriod: (label) =>
      whileDashboardAnswers(page, async () => {
        await filters().getByLabel("Período").selectOption({ label });
      }),
    officerChoices: async () => {
      const options = await filters()
        .getByLabel("Oficial Payroll")
        .locator("option")
        .allTextContents();
      return options.slice(1);
    },
    chooseOfficer: (name) =>
      whileDashboardAnswers(page, async () => {
        const option = name === null ? { index: 0 } : { label: name };
        await filters().getByLabel("Oficial Payroll").selectOption(option);
      }),
    quarterChoices: async () => {
      await panel().waitFor({ timeout: WAIT_MS });
      const labels = await panel().getByTestId("quarter-button").allTextContents();
      return labels.map((label) => label.slice(0, 2));
    },
    chosenMonths: async () => {
      const months = await panel().getAttribute("data-months");
      return months ? months.split(",") : [];
    },
    touchQuarter: (number, options) =>
      whileDashboardAnswers(
        page,
        () => quarter(number).getByTestId("quarter-button").click(clickOptions(options)),
        monthsAsked,
      ),
    openQuarterMonths: async (number) => {
      await arrowOf(number).click();
      return quarter(number).getByTestId("quarter-month").count();
    },
    touchMonth: async (month, options) => {
      const number = Math.ceil(Number(month) / MONTHS_PER_QUARTER);
      if ((await arrowOf(number).getAttribute("aria-expanded")) !== "true") {
        await arrowOf(number).click();
      }
      await whileDashboardAnswers(
        page,
        () =>
          quarter(number)
            .getByTestId("quarter-month")
            .getByText(MONTH_NAMES[Number(month) - 1] ?? month, { exact: true })
            .click(clickOptions(options)),
        monthsAsked,
      );
    },
    chooseYear: (year) =>
      whileDashboardAnswers(page, async () => {
        await panel().getByLabel("Año").selectOption(String(year));
      }),
  };
}
