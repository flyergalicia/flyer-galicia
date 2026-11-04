import { type Page } from "@playwright/test";
import {
  type AgendaDirection,
  type AgendaDriver,
  type AgendaLayout,
  type AssignmentTray,
} from "../../commercial-actions.ts";
import { isThere, screenToSettle, textOf } from "./wait.ts";

const LAYOUT_MARK: Readonly<Record<AgendaLayout, string>> = {
  hours: "#ges-body .ges-hcol",
  team: "#ges-body .ges-eqh",
  month: "#ges-body .ges-mes",
};

const TRAY_TITLE: Readonly<Record<AssignmentTray, string>> = {
  unassigned: "Por asignar",
  "reassign-requests": "Piden que se la pasen a otro",
};

const MOVE_BUTTON: Readonly<Record<AgendaDirection, number>> = { previous: 0, today: 1, next: 2 };

export function createAgenda(page: Page): AgendaDriver {
  const agendaMonth = () => page.evaluate(() => GES.ag.mes ?? "");
  const moveAgenda = async (direction: AgendaDirection) => {
    await page.locator(".ges-ag-nav button").nth(MOVE_BUTTON[direction]).click();
    await screenToSettle(page);
  };
  return {
    chooseAgendaView: async (label) => {
      await page.locator(".ges-ag-ver button").getByText(label, { exact: true }).click();
      await screenToSettle(page);
    },
    agendaViewShown: async () => {
      await page.locator(".ges-ag-ver").waitFor();
      return page.locator('.ges-ag-ver button[aria-pressed="true"]').innerText();
    },
    waitForAgendaLayout: async (layout) => {
      const shown = await isThere(page, LAYOUT_MARK[layout]);
      if (!shown) return false;
      const others = Object.values(LAYOUT_MARK).filter((mark) => mark !== LAYOUT_MARK[layout]);
      return (await page.locator(others.join(",")).count()) === 0;
    },
    agendaDayColumns: () => page.locator(LAYOUT_MARK.hours).count(),
    chooseWhoseAgenda: async (name) => {
      await page.locator(".ges-ag-fil select").selectOption({ label: name });
    },
    takenBlocks: () =>
      page.evaluate(() => {
        const taken = [...document.querySelectorAll("#ges-body .ges-hbl.tapado")];
        const thatOpen = taken.filter(
          (block) => block.tagName === "BUTTON" || block.getAttribute("onclick") !== null,
        );
        return { count: taken.length, thatOpen: thatOpen.length };
      }),
    agendaRangeLabel: () => textOf(page, ".ges-ag-rango"),
    agendaMonth,
    moveAgenda,
    showMonthOf: async (date) => {
      if ((await agendaMonth()) !== date.slice(0, 7)) await moveAgenda("next");
    },
    agendaDayShown: () =>
      page.evaluate(() => ({
        date: GES.ag.dia ?? "",
        heading: document.querySelector(".ges-hth")?.textContent ?? "",
      })),
    openContactList: async () => {
      await page.evaluate(() => {
        gesContactarTodas();
      });
    },
    chooseContact: (name) => page.locator("#ges-ov .ges-band-i", { hasText: name }).click(),
    openFromTray: async (tray, company) => {
      await page
        .locator(".ges-band", { hasText: TRAY_TITLE[tray] })
        .locator(".ges-band-i", { hasText: company })
        .click();
      await page.locator("#ges-ra-ok").waitFor();
    },
  };
}
