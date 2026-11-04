import { type Page } from "@playwright/test";
import { type CommercialActionsDriver, type CommercialTab } from "../commercial-actions.ts";
import { createAgenda } from "./commercial-actions/agenda.ts";
import { createDashboard } from "./commercial-actions/dashboard.ts";
import { createActionDetail, createBehindTheScreen } from "./commercial-actions/detail.ts";
import { createActionForm, createAgendaAssign, createDialog } from "./commercial-actions/form.ts";
import { createActionList, createCompanies } from "./commercial-actions/lists.ts";
import { readUntil, screenToSettle, textOf } from "./commercial-actions/wait.ts";

const SCREEN = "#ges-body";
const TABS = "#ges-root .ges-tabs";
const ENTRY_TIMEOUT_MS = 30_000;
const TUTORIAL_PAUSE_MS = 300;
const TUTORIAL_MAX_STEPS = 12;

const TAB_KEY: Readonly<Record<CommercialTab, string>> = {
  companies: "empresas",
  actions: "lista",
  agenda: "agenda",
  dashboard: "tablero",
};

function waitForEntry(page: Page): Promise<unknown> {
  return page.waitForFunction(() => Boolean(window._me) && window._facLoaded && _gesOn(), null, {
    timeout: ENTRY_TIMEOUT_MS,
  });
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
      isPhone &&
      (element.classList.contains("ges-hor") ||
        element.querySelector(":scope > .ges-eqh,:scope > .ges-hin") !== null);
    for (const element of document.querySelectorAll("#ges-root *")) {
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

function walkTutorial(page: Page): ReturnType<CommercialActionsDriver["walkTutorial"]> {
  return page.evaluate(
    async ({ pause, maxSteps }) => {
      const wait = () =>
        new Promise((resolve) => {
          setTimeout(resolve, pause);
        });
      _tourStart("gestiones");
      await wait();
      const seen = [];
      for (let step = 0; step < maxSteps && _tour; step += 1) {
        const current = _tour.pasos[_tour.i];
        if (current?.cap !== "gestiones") break;
        const { target } = current;
        const element = typeof target === "function" ? target() : document.querySelector(target);
        seen.push({
          title: document.querySelector("#fg-tour-tip h4")?.textContent ?? "",
          pointsInsideCommercialActions: element?.closest("#ges-root") != null,
        });
        _tourNext();
        await wait();
      }
      if (_tour) _tourEnd();
      return seen;
    },
    { pause: TUTORIAL_PAUSE_MS, maxSteps: TUTORIAL_MAX_STEPS },
  );
}

export function createLegacyCommercialActionsDriver(page: Page): CommercialActionsDriver {
  return {
    ...createActionForm(page),
    ...createAgendaAssign(page),
    ...createDialog(page),
    ...createActionDetail(page),
    ...createBehindTheScreen(page),
    ...createAgenda(page),
    ...createCompanies(page),
    ...createActionList(page),
    ...createDashboard(page),
    prepareForDemo: (noticesEveryMs) =>
      page.evaluate((every) => {
        setInterval(() => {
          _gesAvisoCargar();
        }, every);
        document.title = `Demo · ${_myName} · Gestiones`;
      }, noticesEveryMs),
    open: async () => {
      await waitForEntry(page);
      await page.evaluate(() => {
        switchApp("gestiones");
      });
      await page.locator(TABS).waitFor({ timeout: ENTRY_TIMEOUT_MS });
    },
    goToTab: async (tab) => {
      await page.locator(`.ges-tab[onclick*="'${TAB_KEY[tab]}'"]`).click();
      await screenToSettle(page);
    },
    screenText: () => textOf(page, SCREEN),
    waitForScreenText: (pattern) =>
      readUntil(
        page,
        () => textOf(page, SCREEN),
        (text) => pattern.test(text),
      ),
    screenMarkup: () => page.locator(SCREEN).innerHTML(),
    sidewaysOverflow: async () => {
      await screenToSettle(page);
      return sidewaysOverflow(page);
    },
    waitForScreenToSettle: () => screenToSettle(page),
    walkTutorial: () => walkTutorial(page),
  };
}
