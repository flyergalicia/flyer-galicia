import { type Locator, type Page } from "@playwright/test";
import { SUPABASE_URL } from "../../cloud/users.ts";
import {
  type ActionDetailDriver,
  type ActionFormDriver,
  type ActionListDriver,
  type ActionType,
  type BehindTheScreenDriver,
  type CommercialActionsDriver,
  type CommercialTab,
  type CompaniesDriver,
  type CompanyFilter,
  type DialogDriver,
  type PersonOfAction,
  type PersonOutcome,
  type TutorialStep,
} from "../commercial-actions.ts";
import {
  createAgendaAssignDriver,
  createAgendaDriver,
  createDashboardDriver,
  createFormOfAgenda,
  settle,
} from "./commercial-agenda.ts";

const WAIT_MS = 15_000;
const POLL_MS = 100;
const ENTRY_TIMEOUT_MS = 30_000;
const LEADER_WILL_ASSIGN = "__lider";

const TAB_KEY: Readonly<Record<CommercialTab, string>> = {
  companies: "empresas",
  actions: "lista",
  agenda: "agenda",
  dashboard: "tablero",
};

const TYPE_KEY: Readonly<Record<ActionType, string>> = {
  action: "accion",
  fair: "feria",
  "commercial-position": "posicion",
  "data-list": "datos",
};

const COMPANY_FILTER_KEY: Readonly<Record<CompanyFilter, string>> = {
  all: "todas",
  forwarded: "derivadas",
  "not-forwarded": "sin",
  "with-signups": "altas",
};

const OUTCOME_KEY: Readonly<Record<PersonOutcome, string>> = {
  signup: "alta",
  discarded: "descartado",
};

async function readUntil<Value>(
  page: Page,
  read: () => Promise<Value>,
  isDone: (value: Value) => boolean,
): Promise<Value> {
  const deadline = performance.now() + WAIT_MS;
  let value = await read();
  while (!isDone(value) && performance.now() < deadline) {
    await page.waitForTimeout(POLL_MS);
    value = await read();
  }
  return value;
}

const screen = (page: Page) => page.getByTestId("commercial-screen");
const tabs = (page: Page) => page.getByTestId("commercial-tabs");
const windowOf = (page: Page) => page.getByTestId("action-window");
const actionRows = (page: Page) => page.getByTestId("action-row");
const companyRows = (page: Page) => page.getByTestId("company-row");
const commands = (page: Page) => page.getByTestId("action-commands");
const hunterField = (page: Page) => page.getByTestId("form-hunter");
const freeHunters = (page: Page) => page.getByTestId("free-hunters");

function textOf(locator: Locator): Promise<string> {
  return locator.evaluateAll((found) => found.map((element) => element.textContent).join(""));
}

async function showsSection(page: Page, section: string): Promise<boolean> {
  const found = windowOf(page).locator(`[data-section="${section}"]`).first();
  return (await found.count()) > 0 && found.isVisible();
}

function createForm(page: Page) {
  const typePills = windowOf(page).locator('[data-name="tipo"] button');
  return {
    startForwarding: async (company) => {
      await companyRows(page)
        .filter({ hasText: company })
        .getByRole("button", { name: "Derivar" })
        .click();
      await page.getByTestId("confirm-forwarding").waitFor();
    },
    actionTypeChoices: () => typePills.allTextContents(),
    chooseActionType: (type) =>
      typePills.and(page.locator(`[data-value="${TYPE_KEY[type]}"]`)).click(),
    formSections: async () => ({
      schedule: await showsSection(page, "hor"),
      peopleList: await showsSection(page, "datos"),
      leader: await showsSection(page, "lider"),
    }),
    hunterChoices: () => hunterField(page).locator("option").allTextContents(),
    chooseHunter: async (name) => {
      await hunterField(page).selectOption({ label: name });
    },
    leaveToLeader: async () => {
      await hunterField(page).selectOption(LEADER_WILL_ASSIGN);
    },
    leaderChoices: () => page.getByTestId("form-leader").locator("option").allTextContents(),
    setDate: (date) => page.getByTestId("form-date").fill(date),
    setTimes: async (from, to) => {
      await windowOf(page).getByLabel("Desde", { exact: true }).fill(from);
      await windowOf(page).getByLabel("Hasta", { exact: true }).fill(to);
    },
    schedule: async () => ({
      date: await page.getByTestId("form-date").inputValue(),
      from: await windowOf(page).getByLabel("Desde", { exact: true }).inputValue(),
      to: await windowOf(page).getByLabel("Hasta", { exact: true }).inputValue(),
    }),
    pastePeople: async (text) => {
      await page.getByTestId("form-people").fill(text);
      return textOf(page.getByTestId("form-people-preview"));
    },
    waitForOverlapNotice: async () => {
      const notice = page.getByTestId("hunter-day");
      const text = await readUntil(
        page,
        () => textOf(notice),
        (found) => /Libres a esa hora/.test(found),
      );
      return { text, freeHunters: await freeHunters(page).locator("button").allTextContents() };
    },
    chooseFreeHunter: (name) => freeHunters(page).getByRole("button", { name }).click(),
    confirmForwarding: () => page.getByTestId("confirm-forwarding").click(),
    confirmAssignment: () => page.getByTestId("confirm-assignment").click(),
  } satisfies Partial<ActionFormDriver>;
}

function createDialog(page: Page): DialogDriver {
  const dialog = windowOf(page);
  return {
    dialogIsOpen: async () => (await dialog.count()) > 0,
    dialogText: () => textOf(dialog),
    waitForDialogText: (pattern) =>
      readUntil(
        page,
        () => textOf(dialog),
        (text) => pattern.test(text),
      ),
    waitForDialogToClose: () =>
      dialog.waitFor({ state: "detached", timeout: WAIT_MS }).then(
        () => true,
        () => false,
      ),
    chooseInDialog: (option) =>
      page.getByTestId("window-choices").getByRole("button", { name: option, exact: true }).click(),
    dismissDialog: () => page.getByTestId("window-dismiss").click(),
  };
}

function peopleOnScreen(page: Page): Promise<PersonOfAction[]> {
  return page.getByTestId("person-row").evaluateAll((rows) =>
    rows.map((row) => ({
      id: row.getAttribute("data-person-id") ?? "",
      name: row.getAttribute("data-person-name") ?? "",
      status: row.getAttribute("data-status") ?? "",
      package: row.getAttribute("data-package") || null,
      reason: row.getAttribute("data-reason") || null,
    })),
  );
}

/** What the database answers to this person, as somebody skipping the screen would ask. */
function askTheCloud(
  page: Page,
  path: string,
  init: { readonly method: string; readonly body?: unknown; readonly one?: boolean },
): Promise<{ readonly status: number; readonly body: unknown }> {
  return page.evaluate(
    async ({ address, method, body, one }) => {
      const answer = await fetch(address, {
        method,
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=representation",
          ...(one ? { Accept: "application/vnd.pgrst.object+json" } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const text = await answer.text();
      return { status: answer.status, body: text ? (JSON.parse(text) as unknown) : null };
    },
    { address: `${SUPABASE_URL}/rest/v1/${path}`, ...init },
  );
}

function refusalOf(answer: { readonly status: number; readonly body: unknown }): string | null {
  if (answer.status < 400) return null;
  const { body } = answer;
  const hasMessage = typeof body === "object" && body !== null && "message" in body;
  return hasMessage ? String(body.message) : `status ${String(answer.status)}`;
}

async function unreadMessageIds(page: Page): Promise<string[]> {
  const { body } = await askTheCloud(page, "rpc/gestiones_mensajes_nuevos", {
    method: "POST",
    body: {},
  });
  const rows: readonly unknown[] = Array.isArray(body) ? body : [];
  return rows.flatMap((row) =>
    typeof row === "object" && row !== null && "gestion_id" in row ? [String(row.gestion_id)] : [],
  );
}

async function goToTab(page: Page, tab: CommercialTab): Promise<void> {
  await tabs(page).locator(`[data-tab="${TAB_KEY[tab]}"]`).click();
  await settle(page);
}

/** The list is where a person finds an action. */
async function openAction(page: Page, id: string): Promise<void> {
  await goToTab(page, "actions");
  const clear = page.getByRole("button", { name: "Limpiar filtros" });
  if (await clear.isVisible()) await clear.click();
  await actionRows(page)
    .and(page.locator(`[data-action-id="${id}"]`))
    .click();
  await page
    .getByTestId("action-detail")
    .and(page.locator(`[data-action-id="${id}"]`))
    .waitFor();
}

function createDetail(page: Page) {
  const highlighted = page.locator('[data-testid="person-row"][data-highlighted="true"]');
  const commandButton = (name: string) => commands(page).getByRole("button", { name });
  return {
    openAction: (id) => openAction(page, id),
    leaveAction: () => page.getByTestId("action-back").click(),
    waitForActionToBeRead: async () => {
      const id = await page.getByTestId("action-detail").getAttribute("data-action-id");
      const unread = await readUntil(
        page,
        () => unreadMessageIds(page),
        (ids) => !ids.includes(id ?? ""),
      );
      return !unread.includes(id ?? "");
    },
    sendMessage: async (text) => {
      await page.getByTestId("message-text").fill(text);
      await page.getByTestId("message-send").click();
    },
    actionsWithUnreadMessages: () => unreadMessageIds(page),
    actionCommands: () => commands(page).getByRole("button").allTextContents(),
    reportCannotAttend: async (reason) => {
      await commandButton("No puedo ir").click();
      await page.getByTestId("cannot-attend-reason").fill(reason);
      await page.getByTestId("confirm-cannot-attend").click();
    },
    people: () => peopleOnScreen(page),
    waitForPeople: (isDone) => readUntil(page, () => peopleOnScreen(page), isDone),
    movePerson: async (name, outcome) => {
      await page.getByLabel(`Estado de ${name}`).selectOption(OUTCOME_KEY[outcome]);
    },
    waitForPastedList: async () => {
      const box = page.getByTestId("paste-people-text");
      await readUntil(
        page,
        () => box.inputValue().catch(() => ""),
        (text) => text !== "",
      );
      return {
        text: await box.inputValue(),
        sectionOpen: await page
          .getByTestId("paste-people")
          .evaluate((section) => section.hasAttribute("open")),
      };
    },
    addPastedList: () => page.getByTestId("paste-people-add").click(),
    markActionUnread: () => commandButton("Dejar sin leer").click(),
    waitForHighlightedPerson: async () => {
      await highlighted
        .first()
        .waitFor({ timeout: WAIT_MS })
        .catch(() => undefined);
      return textOf(highlighted);
    },
    waitForNoHighlightedPerson: () =>
      highlighted
        .first()
        .waitFor({ state: "detached", timeout: WAIT_MS })
        .then(
          () => true,
          () => false,
        ),
  } satisfies Partial<ActionDetailDriver>;
}

function createBehindTheScreen(page: Page): BehindTheScreenDriver {
  const update = async (table: string, id: string, changes: Record<string, unknown>) =>
    refusalOf(
      await askTheCloud(page, `${table}?id=eq.${id}&select=*`, { method: "PATCH", body: changes }),
    );
  return {
    insertActionBehindTheScreen: async (row) =>
      refusalOf(
        await askTheCloud(page, "gestiones?select=*", { method: "POST", body: row, one: true }),
      ),
    updateActionBehindTheScreen: (id, changes) => update("gestiones", id, changes),
    updatePersonBehindTheScreen: (id, changes) => update("gestion_prospectos", id, changes),
  };
}

function createCompanies(page: Page): CompaniesDriver {
  const filter = page.getByLabel("Filtrar empresas");
  return {
    filterCompanies: async (choice) => {
      await filter.selectOption(COMPANY_FILTER_KEY[choice]);
      return companyRows(page).count();
    },
    companyFilterOptions: () => filter.locator("option").allTextContents(),
    searchCompanies: (text) =>
      page.getByPlaceholder("Buscar en tus empresas (nombre o CUIT)").fill(text),
    companiesText: () => textOf(page.getByTestId("companies-table")),
  };
}

function rowsOnScreen(page: Page) {
  return actionRows(page).evaluateAll((rows) =>
    rows.map((row) => ({
      text: row.textContent,
      type: row.querySelector('[data-part="type"]')?.textContent ?? "",
      flagged: row.getAttribute("data-flagged") === "true",
    })),
  );
}

function createList(page: Page): ActionListDriver {
  const clearFilters = () => page.getByRole("button", { name: "Limpiar filtros" });
  return {
    actionRows: async () => {
      await page.getByTestId("actions-list").waitFor({ timeout: WAIT_MS });
      return rowsOnScreen(page);
    },
    waitForActionRows: (isDone) => readUntil(page, () => rowsOnScreen(page), isDone),
    searchActions: (text) => page.getByPlaceholder("Buscar empresa, CUIT o persona").fill(text),
    filterActionsByType: async (label) => {
      await page.getByLabel("Filtrar por tipo de acción").selectOption({ label });
    },
    filterActionsFrom: (date) => screen(page).getByLabel("Desde", { exact: true }).fill(date),
    filterActionsUntil: (date) => screen(page).getByLabel("Hasta", { exact: true }).fill(date),
    filterActionsByStatus: async (label) => {
      await page.getByLabel("Filtrar por estado").selectOption({ label });
    },
    filterActionsByHunter: async (label) => {
      await page.getByLabel("Filtrar por hunter").selectOption({ label });
    },
    clearFiltersOffered: () => clearFilters().isVisible(),
    clearActionFilters: () => clearFilters().click(),
  };
}

function sidewaysOverflow(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const found: string[] = [];
    const { documentElement } = document;
    if (documentElement.scrollWidth > window.innerWidth + 1) {
      found.push(`page ${String(documentElement.scrollWidth)}>${String(window.innerWidth)}`);
    }
    // On a phone, the calendar by hours slides on purpose: seven days do not fit in 390 px.
    const isPhone = window.innerWidth <= 700;
    const isPhoneCalendar = (element: Element) =>
      isPhone && element.getAttribute("data-slides") === "calendar";
    const root = document.querySelector('[data-screen="commercial-actions"]');
    for (const element of root?.querySelectorAll("*") ?? []) {
      const overflows = element.scrollWidth > element.clientWidth + 1 && element.clientWidth > 0;
      if (
        overflows &&
        !isPhoneCalendar(element) &&
        /auto|scroll/.test(getComputedStyle(element).overflowX)
      ) {
        const name = element.className || element.tagName;
        found.push(`${name} ${String(element.scrollWidth)}>${String(element.clientWidth)}`);
      }
    }
    return found;
  });
}

const TUTORIAL_PAUSE_MS = 300;
const TUTORIAL_MAX_STEPS = 12;

/** The step on screen: its title, its number, and whether its light falls inside Gestiones. */
function tutorialNow(page: Page) {
  return page.evaluate(() => {
    const tip = document.querySelector('[data-testid="tour-tip"]');
    if (!tip) return null;
    const light = document.querySelector('[data-testid="tour-spotlight"]')?.getBoundingClientRect();
    const area = document
      .querySelector('section[data-screen="commercial-actions"]:not([hidden])')
      ?.getBoundingClientRect();
    const inside =
      light !== undefined &&
      area !== undefined &&
      light.left >= area.left - 8 &&
      light.right <= area.right + 8 &&
      light.top >= area.top - 8 &&
      light.bottom <= area.bottom + 8;
    return {
      chapter: tip.querySelector('[aria-current="step"]')?.getAttribute("data-chip") ?? "",
      count: tip.querySelector('[data-testid="tour-count"]')?.textContent ?? "",
      title: tip.querySelector("h4")?.textContent ?? "",
      inside,
    };
  });
}

/** As a person: "Ver tutorial" in the name menu, the chip of Gestiones, and the arrows. */
async function walkTutorial(page: Page): Promise<TutorialStep[]> {
  await page.getByRole("button", { name: /^Menú de / }).click();
  await page.getByRole("menu").getByRole("menuitem", { name: "Ver tutorial" }).click();
  const tip = page.getByTestId("tour-tip");
  await tip.waitFor({ timeout: WAIT_MS });
  await tip.locator('[data-chip="gestiones"]').click();
  await waitUntil(page, async () => (await tutorialNow(page))?.chapter === "gestiones");
  const seen: TutorialStep[] = [];
  for (let step = 0; step < TUTORIAL_MAX_STEPS; step += 1) {
    await page.waitForTimeout(TUTORIAL_PAUSE_MS);
    const now = await tutorialNow(page);
    if (now?.chapter !== "gestiones") break;
    seen.push({ title: now.title, pointsInsideCommercialActions: now.inside });
    await page.keyboard.press("ArrowRight");
    // The next step paints when its screen is there: until then, the globe says the same.
    await waitUntil(page, async () => {
      const next = await tutorialNow(page);
      return next === null || next.count !== now.count || next.title !== now.title;
    });
  }
  if (await tip.isVisible()) await page.keyboard.press("Escape");
  return seen;
}

/** Waits for something to be true, as a person waits for the screen. */
async function waitUntil(page: Page, isTrue: () => Promise<boolean>): Promise<void> {
  const until = Date.now() + WAIT_MS;
  while (!(await isTrue())) {
    if (Date.now() > until) throw new Error("The tutorial did not move");
    await page.waitForTimeout(POLL_MS);
  }
}

export function createReactCommercialActionsDriver(page: Page): CommercialActionsDriver {
  return {
    ...createForm(page),
    ...createFormOfAgenda(page),
    ...createAgendaAssignDriver(page),
    ...createAgendaDriver(page),
    ...createDashboardDriver(page),
    ...createDialog(page),
    ...createDetail(page),
    ...createBehindTheScreen(page),
    ...createCompanies(page),
    ...createList(page),
    open: async () => {
      const tab = page
        .getByRole("banner")
        .getByRole("tab", { name: /Gestiones/ })
        .first();
      await tab.waitFor({ timeout: ENTRY_TIMEOUT_MS });
      await tab.click();
      await tabs(page).waitFor({ timeout: ENTRY_TIMEOUT_MS });
    },
    goToTab: (tab) => goToTab(page, tab),
    screenText: () => textOf(screen(page)),
    waitForScreenText: (pattern) =>
      readUntil(
        page,
        () => textOf(screen(page)),
        (text) => pattern.test(text),
      ),
    screenMarkup: () => screen(page).innerHTML(),
    sidewaysOverflow: async () => {
      await settle(page);
      return sidewaysOverflow(page);
    },
    waitForScreenToSettle: () => settle(page),
    walkTutorial: () => walkTutorial(page),
    // The demo runs on the current version: in React what waits for each one is read again every
    // 90 s, and a person cannot ask for it sooner.
    prepareForDemo: () => {
      throw new Error("The demo of Gestiones runs on the current version.");
    },
  };
}
