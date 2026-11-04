import { type Page } from "@playwright/test";
import {
  type ActionFormDriver,
  type AgendaAssignDriver,
  type ActionType,
  type DialogDriver,
} from "../../commercial-actions.ts";
import { isThere, readUntil, textOf, WAIT_MS } from "./wait.ts";

const DIALOG = "#ges-ov";
const FORWARD_BUTTON = "#ges-der-ok";
const ASSIGN_BUTTON = "#ges-ra-ok";
const HUNTER_FIELD = "#gf-hunter";
const OVERLAP = "#gf-ocup";
const FREE_HUNTERS = "#gf-libres";
const WEEK = "#gf-ag";
/** The height of one hour on the agenda. */
const HOUR_HEIGHT_PX = 46;
const LEADER_WILL_ASSIGN = "__lider";

const TYPE_KEY: Readonly<Record<ActionType, string>> = {
  action: "accion",
  fair: "feria",
  "commercial-position": "posicion",
  "data-list": "datos",
};

function optionsOf(page: Page, selector: string): Promise<string[]> {
  return page.locator(`${selector} option`).allTextContents();
}

function sectionShows(page: Page, section: string): Promise<boolean> {
  return page.locator(`${DIALOG} [data-ges-sec="${section}"]`).first().isVisible();
}

export function createActionForm(page: Page): ActionFormDriver {
  const typePills = page.locator('.ges-pills[data-name="tipo"] button');
  return {
    startForwarding: async (company) => {
      await page
        .locator("#ges-emp-tb tr", { hasText: company })
        .getByRole("button", { name: "Derivar" })
        .click();
      await page.locator(FORWARD_BUTTON).waitFor();
    },
    startScheduling: async () => {
      await page.locator(".ges-ag-acts .bp").click();
      await page.locator(`${DIALOG} .ges-form`).first().waitFor();
    },
    actionTypeChoices: () => typePills.allTextContents(),
    chooseActionType: (type) =>
      page.locator(`.ges-pills[data-name="tipo"] button[data-v="${TYPE_KEY[type]}"]`).click(),
    formSections: async () => ({
      schedule: await sectionShows(page, "hor"),
      peopleList: await sectionShows(page, "datos"),
      leader: await sectionShows(page, "lider"),
    }),
    hunterChoices: () => optionsOf(page, HUNTER_FIELD),
    chooseHunter: async (name) => {
      await page.locator(HUNTER_FIELD).selectOption({ label: name });
    },
    leaveToLeader: async () => {
      await page.locator(HUNTER_FIELD).selectOption(LEADER_WILL_ASSIGN);
    },
    leaderChoices: () => optionsOf(page, "#gf-lider"),
    setDate: (date) => page.locator("#gf-fecha").fill(date),
    setTimes: async (from, to) => {
      await page.locator("#gf-hd").fill(from);
      await page.locator("#gf-hh").fill(to);
    },
    schedule: async () => ({
      date: await page.locator("#gf-fecha").inputValue(),
      from: await page.locator("#gf-hd").inputValue(),
      to: await page.locator("#gf-hh").inputValue(),
    }),
    pastePeople: async (text) => {
      await page.locator("#gf-datos").fill(text);
      return textOf(page, "#gf-datos-prev");
    },
    waitForOverlapNotice: async () => {
      const text = await readUntil(
        page,
        () => textOf(page, OVERLAP),
        (notice) => /Libres a esa hora/.test(notice),
      );
      return {
        text,
        freeHunters: await page.locator(`${FREE_HUNTERS} button`).allTextContents(),
      };
    },
    chooseFreeHunter: (name) => page.locator(`${FREE_HUNTERS} button`, { hasText: name }).click(),
    confirmForwarding: () => page.locator(FORWARD_BUTTON).click(),
    confirmAssignment: () => page.locator(ASSIGN_BUTTON).click(),
    waitForHunterWeek: async () => {
      if (!(await isThere(page, `${WEEK}:not([hidden]) .ges-hpanel-t`))) return null;
      return page.evaluate(() => {
        const week = document.querySelector("#gf-ag");
        return {
          title: week?.querySelector(".ges-hpanel-t b")?.textContent ?? "",
          blocks: week?.querySelectorAll(".ges-hbl").length ?? 0,
          blocksThatOpen: week?.querySelectorAll("button.ges-hbl, .ges-hbl button").length ?? 0,
        };
      });
    },
    touchHunterWeek: (hoursBelowTop) =>
      page
        .locator(`${WEEK} .ges-hcol`)
        .first()
        .click({ position: { x: 5, y: HOUR_HEIGHT_PX * hoursBelowTop + 5 } }),
    hunterWeekSizes: () =>
      page.evaluate(() => {
        const panel = document.querySelector("#gf-ag");
        const week = panel?.querySelector(".ges-hor");
        return {
          panelWidth: panel?.clientWidth ?? 0,
          windowWidth: panel?.parentElement?.clientWidth ?? 0,
          scrollWidth: week?.scrollWidth ?? 0,
          clientWidth: week?.clientWidth ?? 0,
          scrollHeight: week?.scrollHeight ?? 0,
          clientHeight: week?.clientHeight ?? 0,
        };
      }),
  };
}

/** Runs in the page: what the window of the paste shows once it reviewed the lines. */
function readAgendaReview() {
  const preview = document.querySelector("#ga-prev");
  const add = document.querySelector<HTMLButtonElement>("#ga-ok");
  return {
    summary: preview?.querySelector(".ges-paste-res")?.textContent ?? "",
    rows: Array.from(preview?.querySelectorAll("tbody tr") ?? [], (row) => {
      const [date = "", time = "", company = "", hunter = "", place = "", status = ""] = Array.from(
        row.querySelectorAll("td"),
        (cell) => cell.textContent,
      );
      return { date, time, company, hunter, place, status };
    }),
    addButton: { text: add?.textContent ?? "", locked: add?.disabled ?? true },
  };
}

export function createAgendaAssign(page: Page): AgendaAssignDriver {
  return {
    searchCompanyToAssign: (text) => page.locator("#gf-emp").fill(text),
    companySearchResults: () => textOf(page, "#gf-emp-res"),
    chooseCompanyFound: (name) => page.locator("#gf-emp-res button", { hasText: name }).click(),
    confirmAgendaAction: () => page.locator("#ges-ag-ok").click(),
    openAgendaPaste: async () => {
      await page.getByRole("button", { name: "Pegar desde Excel" }).click();
      await page.locator("#ga-paste").waitFor();
    },
    agendaPasteOffered: () => page.getByRole("button", { name: "Pegar desde Excel" }).isVisible(),
    pasteAgenda: (text) => page.locator("#ga-paste").fill(text),
    agendaPreviewText: () => textOf(page, "#ga-prev"),
    waitForAgendaReview: async () => {
      await page.locator("#ga-prev .ges-paste-res").waitFor({ timeout: WAIT_MS });
      return page.evaluate(readAgendaReview);
    },
    retryAgendaReview: () =>
      page.locator("#ga-prev").getByRole("button", { name: "Probar de nuevo" }).click(),
    addPastedAgenda: () => page.locator("#ga-ok").click(),
  };
}

export function createDialog(page: Page): DialogDriver {
  const dialogIsOpen = () => page.evaluate(() => document.querySelector("#ges-ov") !== null);
  return {
    dialogIsOpen,
    dialogText: () => textOf(page, DIALOG),
    waitForDialogText: (pattern) =>
      readUntil(
        page,
        () => textOf(page, DIALOG),
        (text) => pattern.test(text),
      ),
    waitForDialogToClose: () =>
      page
        .locator(DIALOG)
        .waitFor({ state: "detached", timeout: WAIT_MS })
        .then(
          () => true,
          () => false,
        ),
    chooseInDialog: (option) =>
      page.locator(`${DIALOG} .ges-elegir button`, { hasText: option }).click(),
    dismissDialog: () => page.locator(`${DIALOG} .ges-foot .bg`).first().click(),
  };
}
