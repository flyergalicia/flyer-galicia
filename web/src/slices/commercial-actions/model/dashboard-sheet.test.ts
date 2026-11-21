import { describe, expect, it, vi } from "vitest";
import type { SheetApi } from "@/shared/lib/sheet-library.ts";
import type { DashboardData } from "../api/dashboard.ts";
import { aListedAction, officer } from "../testing/fixtures.ts";
import { actionsOfSheet, type BookSheet, dashboardBook, writeBook } from "./dashboard-sheet.ts";
import { type DashboardFilters, initialDashboardFilters } from "./dashboard.ts";
import { addDays, today } from "./formatting.ts";

const NOTHING: DashboardData = {
  kpis: {
    visitas: 0,
    planificadas: 0,
    sin_asignar: 0,
    empresas: 0,
    asistentes: 0,
    prospectos: 0,
    altas: 0,
    datos: 0,
    contactados: 0,
  },
  byMonth: [],
  byHunter: [],
  byOfficer: [],
  officers: [],
  byCompany: [],
  byPackage: [],
  byReason: [],
  byType: [],
};

const ALL: DashboardFilters = { ...initialDashboardFilters(), period: "todo" };

function sheet(book: readonly BookSheet[], name: string): BookSheet {
  const found = book.find((one) => one.name === name);
  if (!found) throw new Error(`No sheet ${name}`);
  return found;
}

function valueOf(found: BookSheet, label: string): string | number | undefined {
  return found.lines?.find(([first]) => first === label)?.[1];
}

describe("the actions of the sheet", () => {
  const yesterday = addDays(today(), -1);
  const ids = (
    filters: DashboardFilters,
    withTrials = false,
    actions = [aListedAction({ id: "a", fecha: yesterday })],
  ) => actionsOfSheet(actions, filters, withTrials).map(({ id }) => id);

  it("are those of the filters", () => {
    const action = aListedAction({
      id: "a",
      fecha: yesterday,
      tipo: "feria",
      hunter_id: "h1",
      dueno_id: "o1",
    });
    const of = (filters: Partial<DashboardFilters>) => ids({ ...ALL, ...filters }, false, [action]);
    expect.soft(of({})).toEqual(["a"]);
    expect.soft(of({ type: "accion" })).toEqual([]);
    expect.soft(of({ type: "feria" })).toEqual(["a"]);
    expect.soft(of({ hunter: "h2" })).toEqual([]);
    expect.soft(of({ hunter: "h1" })).toEqual(["a"]);
    expect.soft(of({ officer: "o2" })).toEqual([]);
    expect.soft(of({ officer: "o1" })).toEqual(["a"]);
  });

  it("not before the period", () => {
    const old = aListedAction({ id: "old", fecha: addDays(today(), -40) });
    expect.soft(ids({ ...ALL, period: "30" }, false, [old])).toEqual([]);
    expect.soft(ids({ ...ALL, period: "90" }, false, [old])).toEqual(["old"]);
  });

  it("only the months chosen, by quarter", () => {
    const march = aListedAction({ id: "march", fecha: "2020-03-10" });
    const onMonths = (months: readonly string[]) =>
      ids({ ...ALL, period: "q", year: 2020, months }, false, [march]);
    expect.soft(onMonths(["03"])).toEqual(["march"]);
    expect.soft(onMonths(["04"])).toEqual([]);
  });

  it("what is to come does not count", () => {
    const later = aListedAction({ id: "later", fecha: addDays(today(), 3) });
    expect(ids(ALL, false, [later])).toEqual([]);
  });

  it("the tests, only if they are asked for", () => {
    const trial = aListedAction({ id: "trial", fecha: yesterday, prueba: true });
    expect.soft(ids(ALL, false, [trial])).toEqual([]);
    expect.soft(ids(ALL, true, [trial])).toEqual(["trial"]);
  });
});

describe("the book", () => {
  it("has its sheets", () => {
    const book = dashboardBook(officer, NOTHING, ALL, []);
    expect(book.map(({ name }) => name)).toEqual([
      "Resumen",
      "Por hunter",
      "Por oficial",
      "Por empresa",
      "Gestiones",
    ]);
  });

  it("the summary carries the numbers on screen and the period", () => {
    const data: DashboardData = {
      ...NOTHING,
      kpis: {
        ...NOTHING.kpis,
        visitas: 3,
        planificadas: 2,
        prospectos: 4,
        altas: 1,
        datos: 15,
        contactados: 5,
      },
      byPackage: [
        { paquete: "plus", altas: 3 },
        { paquete: "caja", altas: 2 },
        { paquete: null, altas: 1 },
      ],
      byReason: [
        { motivo: "no_contesta", n: 2 },
        { motivo: null, n: 1 },
      ],
    };
    const summary = sheet(dashboardBook(officer, data, ALL, []), "Resumen");

    expect.soft(valueOf(summary, "Período")).toBe("Todo");
    expect.soft(valueOf(summary, "Acciones realizadas")).toBe(3);
    expect.soft(valueOf(summary, "Planificadas")).toBe(2);
    expect.soft(valueOf(summary, "Conversión")).toBe(0.25);
    expect.soft(valueOf(summary, "Altas con paquete")).toBe(3);
    expect.soft(valueOf(summary, "Altas sin paquete (Caja de Ahorro)")).toBe(2);
    expect.soft(valueOf(summary, "Altas sin paquete cargado")).toBe(1);
    expect.soft(valueOf(summary, "Plus")).toBe(3);
    expect.soft(valueOf(summary, "Plus Gold")).toBe(0);
    expect.soft(valueOf(summary, "Bases de datos: personas")).toBe(15);
    expect.soft(valueOf(summary, "Bases de datos: contactadas")).toBe(5);
    expect.soft(valueOf(summary, "No contesta")).toBe(2);
    expect.soft(valueOf(summary, "Otro motivo")).toBe(1);
  });

  it("leaves out of the summary what does not apply", () => {
    const summary = sheet(dashboardBook(officer, NOTHING, ALL, []), "Resumen");
    const labels = summary.lines?.map(([first]) => first);
    expect.soft(labels).not.toContain("Altas sin paquete cargado");
    expect.soft(labels).not.toContain("Bases de datos: personas");
    expect.soft(labels).not.toContain("Descartes por motivo");
    expect.soft(valueOf(summary, "Conversión")).toBe(0);
  });

  it.each([
    [{ ...ALL, period: "q", year: 2026, months: ["01", "02", "03"] }, "1Q de 2026"],
    [{ ...ALL, period: "todo" }, "Todo"],
  ])("the period reads as on screen", (filters, text) => {
    expect(valueOf(sheet(dashboardBook(officer, NOTHING, filters, []), "Resumen"), "Período")).toBe(
      text,
    );
  });

  it("the period of days says from when", () => {
    const summary = sheet(dashboardBook(officer, NOTHING, { ...ALL, period: "30" }, []), "Resumen");
    expect(valueOf(summary, "Período")).toBe(`Desde ${addDays(today(), -30)}`);
  });

  it("the hunters carry their packages, the officers do not, and no row goes without an owner", () => {
    const data: DashboardData = {
      ...NOTHING,
      byHunter: [
        { id: "h1", visitas: 2, prospectos: 4, altas: 2, paquetes: { plus: 1, gold: 1, caja: 3 } },
        { id: null, visitas: 9, prospectos: 9, altas: 9 },
        { id: "h2", visitas: 1, prospectos: 0, altas: 0 },
      ],
      byOfficer: [{ id: "o1", visitas: 2, prospectos: 4, altas: 1 }],
    };
    const book = dashboardBook(officer, data, ALL, []);
    const hunters = sheet(book, "Por hunter").rows ?? [];

    expect.soft(hunters).toHaveLength(2);
    expect.soft(hunters[0]).toMatchObject({
      Nombre: "Sofía Paz",
      Acciones: 2,
      Conversión: 0.5,
      "Con paquete": 2,
      "Sin paquete": 3,
      Plus: 1,
      "Plus Gold": 1,
      "Eminent Black": 0,
    });
    expect.soft(hunters[1]).toMatchObject({ Conversión: 0, "Con paquete": 0, "Sin paquete": 0 });
    expect.soft(sheet(book, "Por oficial").rows?.[0]).toEqual({
      Nombre: "Vos",
      Acciones: 2,
      Prospectos: 4,
      Altas: 1,
      Conversión: 0.25,
    });
  });

  it("the companies, with their tax ids and officer", () => {
    const data: DashboardData = {
      ...NOTHING,
      byCompany: [
        {
          empresa: "ACME SA",
          cuit: "30900001118",
          dueno: "o1",
          visitas: 1,
          prospectos: 2,
          altas: 1,
        },
      ],
    };
    expect(sheet(dashboardBook(officer, data, ALL, []), "Por empresa").rows?.[0]).toEqual({
      Empresa: "ACME SA",
      CUIT: "30-90000111-8",
      Oficial: "Vos",
      Acciones: 1,
      Prospectos: 2,
      Altas: 1,
    });
  });

  it("the detail says what each action is", () => {
    const actions = [
      aListedAction({
        id: "a",
        estado: "realizada",
        n_pros: 3,
        n_altas: 1,
        nota: "Bien",
        lugar: "Planta",
        no_puede_at: "2026-11-01",
        frecuencia: "repite",
        cada_dias: 7,
        origen: "propia",
        prueba: true,
      }),
      aListedAction({
        id: "b",
        tipo: "datos",
        hunter_id: null,
        n_datos: 8,
        vence: "2026-12-01",
        estado: "planificada",
      }),
    ];
    const [first, second] =
      sheet(dashboardBook(officer, NOTHING, ALL, actions), "Gestiones").rows ?? [];
    expect.soft(first).toMatchObject({
      Empresa: "ACME SA",
      CUIT: "30-90000111-8",
      Horario: "10:00–12:00",
      Lugar: "Planta",
      Tipo: "Acción",
      Modalidad: "Presencial",
      "Se repite": "Cada 7 días",
      Estado: "Realizada",
      Hunter: "Sofía Paz",
      "Oficial Payroll": "Vos",
      Origen: "Propia",
      "Pidió reasignación": "Sí",
      Personas: "",
      Prospectos: 3,
      Altas: 1,
      Nota: "Bien",
      Prueba: "Sí",
    });
    expect.soft(second).toMatchObject({
      Hasta: "2026-12-01",
      Tipo: "Base de datos",
      Modalidad: "",
      Estado: "En curso",
      Hunter: "Por asignar",
      Origen: "Derivada",
      "Pidió reasignación": "",
      Personas: 8,
      Prueba: "",
    });
  });
});

describe("writing the book", () => {
  it("each sheet, with its name, under that file name", () => {
    const appended: string[] = [];
    const toLines = vi.fn<SheetApi["utils"]["aoa_to_sheet"]>(() => ({}));
    const toRows = vi.fn<SheetApi["utils"]["json_to_sheet"]>(() => ({}));
    const write = vi.fn<SheetApi["writeFile"]>();
    const api: SheetApi = {
      read: vi.fn<SheetApi["read"]>(),
      writeFile: write,
      utils: {
        book_new: () => ({ SheetNames: [], Sheets: {} }),
        book_append_sheet: (_book, _sheet, name) => {
          appended.push(name);
        },
        aoa_to_sheet: toLines,
        json_to_sheet: toRows,
        sheet_to_json: () => [],
      },
    };

    writeBook(
      api,
      [
        { name: "Lines", lines: [["a", 1]] },
        { name: "Rows", rows: [{ a: 1 }] },
        { name: "Nothing" },
      ],
      "x.xlsx",
    );

    expect.soft(appended).toEqual(["Lines", "Rows", "Nothing"]);
    expect.soft(toLines).toHaveBeenCalledWith([["a", 1]]);
    expect.soft(toRows).toHaveBeenCalledWith([{ a: 1 }]);
    expect.soft(toRows).toHaveBeenCalledWith([]);
    expect.soft(write).toHaveBeenCalledTimes(1);
  });
});
