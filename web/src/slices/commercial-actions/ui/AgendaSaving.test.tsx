// What is saved from the agenda shows on it: the agenda is read again after saving.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { type Answer, jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import { today } from "../model/formatting.ts";
import { agendaTable } from "../testing/agenda-cloud.ts";
import { FAILS, fieldsOf, ME } from "../testing/commercial-cloud.ts";
import { openCommercial } from "../testing/commercial-on-screen.tsx";
import { anAction } from "../testing/fixtures.ts";

const agenda = () => page.getByTestId("agenda");
const sofia = () => agenda().getByRole("row").filter({ hasText: "Sofía Paz" });

function savingTable(): Answer {
  const added: object[] = [];
  return (request) => {
    if (request.method !== "POST") return agendaTable({ period: added })(request);
    const row = anAction({
      id: `new${String(added.length)}`,
      creada_por: ME,
      ...fieldsOf(request.body),
    });
    added.push(row);
    return jsonResponse(row, 201);
  };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("after assigning from the agenda", () => {
  it("what was saved is there, on the day it looks at", async () => {
    await openCommercial({
      companies: [],
      hunterDay: [],
      tables: { gestiones: savingTable() },
      functions_: {
        gestiones_ocupacion: () => jsonResponse([]),
        gestiones_empresas: () => jsonResponse([{ empresa: "TEXTIL SA", dueno_id: ME, cuits: [] }]),
      },
    });
    await page
      .getByTestId("commercial-tabs")
      .getByRole("tab", { name: /^Agenda/ })
      .click();
    await expect.element(sofia()).toBeVisible();

    await sofia().getByTitle("Libre: asignarle algo a las 09:00").click();
    await page.getByTestId("form-company").fill("TEXTIL");
    await page
      .getByTestId("form-company-results")
      .getByRole("button", { name: /TEXTIL SA/ })
      .click();
    await page.getByTestId("confirm-agenda").click();

    await expect.element(page.getByTestId("action-window")).not.toBeInTheDocument();
    await expect.element(sofia().getByRole("button", { name: "TEXTIL SA" })).toBeVisible();
    expect(agenda().element().getAttribute("data-day")).toBe(today());
  });
});

describe("pasting into the agenda", () => {
  it("what was added is there, on its first date", async () => {
    await openCommercial({
      companies: [],
      hunterDay: [],
      tables: { gestiones: savingTable() },
      functions_: {
        gestiones_ocupacion: () => jsonResponse([]),
        gestiones_empresas: () => jsonResponse([{ empresa: "TEXTIL SA", dueno_id: ME, cuits: [] }]),
      },
    });
    await page
      .getByTestId("commercial-tabs")
      .getByRole("tab", { name: /^Agenda/ })
      .click();
    await page.getByRole("button", { name: "Pegar desde Excel" }).click();

    await page.getByTestId("agenda-paste-text").fill(`${today()}\t10 a 12\tTEXTIL SA\tSofía`);
    await expect.element(page.getByTestId("agenda-paste-add")).toBeEnabled();
    await page.getByTestId("agenda-paste-add").click();

    await expect.element(page.getByTestId("action-window")).not.toBeInTheDocument();
    expect(agenda().element().getAttribute("data-day")).toBe(today());
  });
});

describe("a list that cannot be saved", () => {
  it("opens its action on the list, with the people pasted to try again", async () => {
    await openCommercial({
      companies: [],
      hunterDay: [],
      list: [],
      tables: {
        gestiones: savingTable(),
        gestion_prospectos: (request) =>
          request.method === "POST" ? FAILS(request) : jsonResponse([]),
      },
      functions_: {
        gestiones_ocupacion: () => jsonResponse([]),
        gestiones_empresas: () => jsonResponse([{ empresa: "TEXTIL SA", dueno_id: ME, cuits: [] }]),
      },
    });
    await page
      .getByTestId("commercial-tabs")
      .getByRole("tab", { name: /^Agenda/ })
      .click();
    await page.getByRole("button", { name: "+ Asignar" }).click();
    await page.getByTestId("form-company").fill("TEXTIL");
    await page
      .getByTestId("form-company-results")
      .getByRole("button", { name: /TEXTIL SA/ })
      .click();
    await page
      .getByTestId("action-window")
      .getByRole("button", { name: "Base de datos", exact: true })
      .click();
    await page.getByTestId("form-hunter").selectOptions("h1");
    await page.getByTestId("form-people").fill("Ana Pérez\t11 5555-1234");
    await page.getByTestId("confirm-agenda").click();

    await expect.element(page.getByTestId("action-detail")).toBeVisible();
    await expect
      .element(page.getByTestId("paste-people-text"))
      .toHaveValue("Ana Pérez\t11 5555-1234\t");
    await page.getByTestId("action-back").click();
    await expect.element(page.getByTestId("actions-list")).toBeVisible();
  });
});
