// Data: Mis empresas and Mis asesores of the panel, and the companies of someone else, read only.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { SHEET_LIBRARY, type SheetApi } from "@/shared/lib/sheet-library.ts";
import { FIRST_PLACE, goToSheet, rememberPlace, type SheetId } from "../model/panel.ts";
import { openPanel, type PanelOptions } from "../testing/panel-cloud.ts";

const panel = () => page.getByTestId("admin-panel");
const sheet = () => panel().getByTestId("admin-other-companies");
const chooser = () => sheet().getByRole("combobox", { name: "Usuario" });
const notice = () => page.getByRole("status");

const PEOPLE = [
  { id: "o1", full_name: "Otra Persona", email_asesor: "otra@b.com", role: "asesor" },
  { id: "v1", full_name: null, email_asesor: "vip@b.com", role: "vip" },
  { id: "x1", full_name: null, email_asesor: null, role: "rara" },
  { id: "adm", full_name: "Admin Dos", email_asesor: "adm@b.com", role: "admin" },
];

function company(empresa: string, cuits: string[] = [], user = "o1") {
  return {
    empresa,
    cuits,
    config: "BAU",
    asesores: [],
    rubro: {},
    user_id: user,
    created_at: "2026-10-01T10:00:00Z",
  };
}

async function openOn(where: SheetId, options: PanelOptions = {}) {
  rememberPlace(goToSheet(FIRST_PLACE, where));
  return openPanel({ accounts: PEOPLE, ...options });
}

let written: string[] = [];

beforeEach(async () => {
  const library: SheetApi = await SHEET_LIBRARY.load();
  written = [];
  vi.spyOn(library, "writeFile").mockImplementation((_book, name) => {
    written.push(name);
  });
});

afterEach(() => {
  rememberPlace(FIRST_PLACE);
  vi.restoreAllMocks();
});

describe("Empresas por usuario", () => {
  it("offers everybody but the administrators, and reads only the list of the one chosen", async () => {
    const { harness } = await openOn("padronotros", {
      companies: (request) =>
        new Response(
          JSON.stringify(
            [
              company("DE OTRO SA", ["30711111111"]),
              company("SEGUNDA SRL"),
              company("MIA SA", [], "x"),
            ].filter(({ user_id: user }) => request.query.get("user_id") === `eq.${user}`),
          ),
        ),
    });
    await expect
      .poll(() => chooser().element().textContent)
      .toBe("Elegí un usuario...Otra Persona · Asesorvip@b.com · VIP(sin nombre) · rara");
    await userEvent.selectOptions(chooser(), "Otra Persona · Asesor");
    await expect.element(sheet()).toMatchTextContent(/2 empresas · 1 CUIT · sólo lectura/);
    await expect.element(sheet()).toMatchTextContent(/Mostrando 2DE OTRO SA30-71111111-1/);
    expect(sheet().element().textContent).not.toMatch(/MIA SA/);
    expect(harness.network.to("/rest/v1/padron_empresas").at(-1)?.query.get("user_id")).toBe(
      "eq.o1",
    );
    expect(
      sheet()
        .getByRole("button", { name: /Editar|Guardar|Subir/ })
        .query(),
    ).toBeNull();

    await userEvent.fill(sheet().getByRole("textbox", { name: "Filtrar empresas" }), "segunda");
    await expect.element(sheet()).toMatchTextContent(/Coincidencias: 1SEGUNDA SRL/);
    await userEvent.fill(sheet().getByRole("textbox", { name: "Filtrar empresas" }), "nada");
    await expect.element(sheet()).toMatchTextContent(/Sin resultados para "nada"\./);

    await sheet().getByRole("button", { name: "⬇ Descargar Excel" }).click();
    await expect.element(notice()).toHaveTextContent("Excel descargado (2 empresas)");
    expect(written).toEqual(["Empresas_Otra Persona.xlsx"]);
  });

  it("says when a person has none, and offers nothing to download", async () => {
    await openOn("padronotros");
    await userEvent.selectOptions(chooser(), "vip@b.com · VIP");
    await expect
      .element(sheet())
      .toMatchTextContent(/Este usuario todavía no cargó ninguna empresa\./);
    expect(sheet().getByRole("button", { name: "⬇ Descargar Excel" }).query()).toBeNull();
    await userEvent.selectOptions(chooser(), "Elegí un usuario...");
    expect(sheet().getByTestId("other-person").query()).toBeNull();
  });

  it("a list that could not be read says so, never that the person has none", async () => {
    let fails = true;
    await openOn("padronotros", {
      intercept: ({ path }) =>
        fails && path === "/rest/v1/padron_empresas"
          ? new Response(JSON.stringify({ message: "sin red" }), { status: 503 })
          : null,
    });
    await userEvent.selectOptions(chooser(), "Otra Persona · Asesor");
    await expect
      .element(sheet().getByTestId("read-problem"))
      .toMatchTextContent(/No se pudieron cargar esas empresas/);
    expect(sheet().element().textContent).not.toMatch(/no cargó ninguna/);
    fails = false;
    await sheet().getByRole("button", { name: "Reintentar" }).click();
    await expect.element(sheet()).toMatchTextContent(/no cargó ninguna/);
  });

  it("without people says so, and Recargar reads them again", async () => {
    const { harness } = await openOn("padronotros", { accounts: [] });
    await expect
      .element(sheet())
      .toMatchTextContent(/No hay usuarios \(además de los administradores\) todavía\./);
    const asked = () =>
      harness.network
        .to("/rest/v1/profiles", "GET")
        .filter(({ query }) => query.get("role") === "neq.admin").length;
    const before = asked();
    await sheet().getByRole("button", { name: "Recargar" }).click();
    await expect.poll(asked).toBe(before + 1);
  });

  it("a list of people that could not be read says so", async () => {
    await openOn("padronotros", {
      intercept: ({ path, query }) =>
        path === "/rest/v1/profiles" && query.get("role") === "neq.admin"
          ? new Response(JSON.stringify({ message: "sin red" }), { status: 503 })
          : null,
    });
    await expect
      .element(sheet().getByTestId("read-problem"))
      .toMatchTextContent(/No se pudo cargar la lista/);
  });
});

describe("Mis empresas and Mis asesores of the panel", () => {
  it("are the same lists of Base de datos, with their title", async () => {
    await openOn("varios", { companies: [company("PROPIA SA")] });
    await expect
      .element(panel().getByTestId("admin-companies"))
      .toMatchTextContent(/^Mis empresasTus empresas, privadas/);
    await expect.element(panel().getByTestId("admin-companies")).toMatchTextContent(/PROPIA SA/);
    await panel().getByRole("tab", { name: "Mis asesores" }).click();
    await expect.element(panel().getByTestId("admin-advisors")).toMatchTextContent(/^Mis asesores/);
  });
});
