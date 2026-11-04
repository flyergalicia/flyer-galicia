import { type Page } from "@playwright/test";
import {
  type ActionDetailDriver,
  type BehindTheScreenDriver,
  type PersonOutcome,
} from "../../commercial-actions.ts";
import { isThere, readUntil, textOf } from "./wait.ts";

const PASTED_LIST = "#gp-paste";
const HIGHLIGHTED = "#ges-body .ges-foco";

const OUTCOME_KEY: Readonly<Record<PersonOutcome, string>> = {
  signup: "alta",
  discarded: "descartado",
};

export function createActionDetail(page: Page): ActionDetailDriver {
  const people = () =>
    page.evaluate(() =>
      GES.detPros.map(({ id, nombre, estado, paquete, motivo }) => ({
        id,
        name: nombre,
        status: estado,
        package: paquete ?? null,
        reason: motivo ?? null,
      })),
    );
  return {
    openAction: async (id) => {
      await page.evaluate((target) => {
        gesAbrirDet(target);
      }, id);
      await page.waitForFunction(
        (target) => GES.detG?.id === target && document.querySelector(".ges-det-top") !== null,
        id,
      );
    },
    leaveAction: () => page.locator("#ges-body > .ges-link").first().click(),
    waitForActionToBeRead: () =>
      page
        .waitForFunction(() => !GES.msgN || !GES.detG || !GES.msgN[GES.detG.id])
        .then(
          () => true,
          () => false,
        ),
    sendMessage: async (text) => {
      await page.locator("#ges-msg-t").fill(text);
      await page.locator("#ges-msg-ok").click();
    },
    actionsWithUnreadMessages: () =>
      page.evaluate(async () => {
        await gesMsgNuevos(true);
        return Object.keys(GES.msgN ?? {});
      }),
    actionCommands: () => page.locator(".ges-acts button").allTextContents(),
    reportCannotAttend: async (reason) => {
      await page.locator(".ges-acts button", { hasText: "No puedo ir" }).click();
      await page.locator("#gf-np").fill(reason);
      await page.locator("#ges-np-ok").click();
    },
    people,
    waitForPeople: (isDone) => readUntil(page, people, isDone),
    movePerson: async (name, outcome) => {
      await page.getByLabel(`Estado de ${name}`).selectOption(OUTCOME_KEY[outcome]);
    },
    waitForPastedList: async () => {
      await page.waitForFunction(
        (selector) => (document.querySelector<HTMLTextAreaElement>(selector)?.value ?? "") !== "",
        PASTED_LIST,
      );
      return page.evaluate((selector) => {
        return {
          text: document.querySelector<HTMLTextAreaElement>(selector)?.value ?? "",
          sectionOpen: document.querySelector<HTMLDetailsElement>(".ges-paste")?.open ?? false,
        };
      }, PASTED_LIST);
    },
    addPastedList: () => page.locator("#gp-paste-ok").click(),
    markActionUnread: () => page.locator(".ges-acts button", { hasText: "Dejar sin leer" }).click(),
    waitForHighlightedPerson: async () => {
      await isThere(page, HIGHLIGHTED);
      return textOf(page, HIGHLIGHTED);
    },
    waitForNoHighlightedPerson: () =>
      page
        .locator(HIGHLIGHTED)
        .waitFor({ state: "detached" })
        .then(
          () => true,
          () => false,
        ),
  };
}

export function createBehindTheScreen(page: Page): BehindTheScreenDriver {
  const update = (
    table: string,
    target: { id: string; changes: Record<string, unknown> },
  ): Promise<string | null> =>
    page.evaluate(
      async ({ name, id, changes }) => {
        const { error } = await _sb.from(name).update(changes).eq("id", id).select().maybeSingle();
        return error?.message ?? null;
      },
      { name: table, ...target },
    );
  return {
    insertActionBehindTheScreen: (row) =>
      page.evaluate(async (fields) => {
        const { error } = await _sb.from("gestiones").insert(fields).select().single();
        return error?.message ?? null;
      }, row),
    updateActionBehindTheScreen: (id, changes) => update("gestiones", { id, changes }),
    updatePersonBehindTheScreen: (id, changes) => update("gestion_prospectos", { id, changes }),
  };
}
