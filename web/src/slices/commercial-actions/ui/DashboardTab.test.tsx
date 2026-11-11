// The dashboard over a simulated cloud: what it asks, what it shows and what a failure says.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { type Answer, deferred, jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import { thisYear, today } from "../model/formatting.ts";
import { type CommercialCloud, CUT, FAILS, fieldsOf, ME } from "../testing/commercial-cloud.ts";
import { openCommercial } from "../testing/commercial-on-screen.tsx";

const BOARD = "/rest/v1/rpc/gestiones_tablero";

const tab = (name: string) =>
  page.getByTestId("commercial-tabs").getByRole("tab", { name: new RegExp(`^${name}`) });
const filters = () => page.getByTestId("dashboard-filters");
const panel = () => page.getByTestId("quarter-panel");
const quarter = (number: number) =>
  panel()
    .getByTestId("quarter-button")
    .nth(number - 1);
const arrow = (number: number) =>
  panel()
    .getByTestId("quarter-arrow")
    .nth(number - 1);
const screen = () => page.getByTestId("commercial-screen");

const FULL = {
  kpis: {
    visitas: 3,
    planificadas: 2,
    sin_asignar: 1,
    empresas: 3,
    asistentes: 95,
    prospectos: 14,
    altas: 6,
    datos: 15,
    contactados: 5,
  },
  por_mes: [
    { mes: "2025-09", prospectos: 2, altas: 0 },
    { mes: `${String(thisYear())}-10`, prospectos: 14, altas: 6 },
  ],
  por_hunter: [
    { id: "h1", visitas: 2, prospectos: 9, altas: 5, paquetes: { plus: 2, gold: 1, caja: 2 } },
    { id: null, visitas: 9, prospectos: 9, altas: 9 },
    { id: "h2", visitas: 1, prospectos: 5, altas: 1, paquetes: null },
  ],
  por_dueno: [{ id: ME, visitas: 3, prospectos: 14, altas: 6 }],
  duenos: [
    { id: ME, n: 3 },
    { id: "o2", n: 1 },
  ],
  por_empresa: [
    {
      empresa: "ALIMENTOS SA",
      dueno: ME,
      cuit: "30900001118",
      visitas: 2,
      prospectos: 9,
      altas: 5,
    },
  ],
  por_paquete: [
    { paquete: "plus", altas: 2 },
    { paquete: "caja", altas: 2 },
    { paquete: null, altas: 2 },
  ],
  por_motivo: [
    { motivo: "no_contesta", n: 2 },
    { motivo: "raro", n: 1 },
  ],
  por_tipo: [
    { tipo: "feria", modalidad: "presencial", visitas: 1, prospectos: 5, altas: 1 },
    { tipo: "posicion", modalidad: "presencial", visitas: 2, prospectos: 9, altas: 5 },
  ],
};

function isAnswer(value: Answer | object): value is Answer {
  return typeof value === "function";
}

function boardOf(answer: Answer | object): CommercialCloud {
  return {
    functions_: {
      gestiones_tablero: isAnswer(answer) ? answer : () => jsonResponse(answer),
    },
  };
}

async function openBoard(answer: Answer | object = FULL, cloud: CommercialCloud = {}) {
  const opened = await openCommercial({ ...boardOf(answer), ...cloud });
  const { role = "vip" } = cloud;
  const name = role === "lider" ? "Tablero del equipo" : "Tablero";
  await tab(name).click();
  await expect.element(filters()).toBeVisible();
  const asked = () => opened.harness.network.to(BOARD).map(({ body }) => fieldsOf(body));
  return { ...opened, asked };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("what it asks", () => {
  it("the last 90 days by default, always with the months, null if it is not by quarter", async () => {
    const { asked } = await openBoard();

    expect(asked()[0]).toEqual({
      p_desde: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      p_hasta: null,
      p_tipo: null,
      p_hunter: null,
      p_dueno: null,
      p_prueba: false,
      p_solo_mio: false,
      p_meses: null,
    });
  });

  it("what the filters say", async () => {
    const { asked } = await openBoard();

    await filters().getByRole("combobox", { name: "Tipo" }).selectOptions("feria");
    await filters().getByRole("combobox", { name: "Hunter" }).selectOptions("h1");
    await filters().getByRole("combobox", { name: "Oficial Payroll" }).selectOptions("o2");
    await filters().getByRole("combobox", { name: "Período" }).selectOptions("todo");

    await vi.waitFor(() => {
      expect(asked().at(-1)).toMatchObject({
        p_desde: null,
        p_tipo: "feria",
        p_hunter: "h1",
        p_dueno: "o2",
        p_meses: null,
      });
    });
  });

  it("the tests, for whoever can see them and while they are ticked", async () => {
    const { asked } = await openBoard(FULL, { role: "admin" });
    await vi.waitFor(() => {
      expect(asked().at(-1)).toMatchObject({ p_prueba: true, p_solo_mio: true });
    });

    await filters().getByLabelText("Incluir pruebas").click();

    await vi.waitFor(() => {
      expect(asked().at(-1)).toMatchObject({ p_prueba: false });
    });
  });

  it("by quarter, the months of the year", async () => {
    const { asked } = await openBoard();

    await filters().getByRole("combobox", { name: "Período" }).selectOptions("q");
    await quarter(1).click();

    await vi.waitFor(() => {
      expect(asked().at(-1)).toMatchObject({
        p_desde: null,
        p_meses: [1, 2, 3].map((month) => `${String(thisYear())}-0${String(month)}`),
      });
    });
  });
});

describe("the numbers", () => {
  it("say what was done, and what nobody has been assigned goes apart", async () => {
    await openBoard();

    await expect.element(screen()).toMatchTextContent("Acciones32 planificadas");
    await expect.element(screen()).toMatchTextContent("Prospectos1415% de los asistentes");
    await expect.element(screen()).toMatchTextContent("Altas62 con paquete · 2 sin");
    await expect.element(screen()).toMatchTextContent("Conversión43%altas ÷ prospectos");
    await expect
      .element(page.getByTestId("dashboard-unassigned"))
      .toMatchTextContent("1 acción derivada sin asignar. No cuenta en los números de arriba");
    await expect
      .element(screen())
      .toMatchTextContent("Bases de datos: 15 personas, 5 ya contactadas (33%).");
    await expect
      .element(screen())
      .toMatchTextContent("El tablero cuenta los últimos 90 días y sólo acciones con hunter");
    await expect.element(screen()).toMatchTextContent("En la solapa Gestiones se ve todo");
  });

  it("several unassigned, in plural; nothing done, in other words", async () => {
    await openBoard({
      kpis: { visitas: 0, planificadas: 1, sin_asignar: 2, asistentes: 0, altas: 0 },
    });

    await expect.element(screen()).toMatchTextContent("2 acciones derivadas sin asignar.");
    await expect.element(screen()).toMatchTextContent("Acciones01 planificadas");
    await expect.element(screen()).toMatchTextContent("Altas0sueldos en Galicia");
  });

  it("with nothing on the period, it says to try a longer one", async () => {
    await openBoard({ kpis: {} }, { role: "admin" });
    await filters().getByLabelText("Incluir pruebas").click();

    await expect
      .element(screen())
      .toMatchTextContent(
        "No hay gestiones en este período. Probá con un período más largo o tildá «Incluir pruebas».",
      );
    await expect.element(page.getByTestId("dashboard-content")).not.toBeInTheDocument();
    await expect.element(screen()).toMatchTextContent("Acciones0realizadas");
  });

  it("whoever cannot see tests is not told to tick them", async () => {
    await openBoard({});
    await expect
      .element(screen())
      .toMatchTextContent("No hay gestiones en este período. Probá con un período más largo.");
    await expect.element(filters().getByLabelText("Incluir pruebas")).not.toBeInTheDocument();
  });

  it("the explanation names the solapa of each one", async () => {
    await openBoard({}, { role: "lider" });
    await expect
      .element(screen())
      .toMatchTextContent("En la solapa Gestiones del equipo se ve todo");
  });

  it("a hunter has no filter of hunters, and the solapa of theirs", async () => {
    await openBoard({}, { role: "hunter" });
    await expect
      .element(filters().getByRole("combobox", { name: "Hunter" }))
      .not.toBeInTheDocument();
    await expect.element(screen()).toMatchTextContent("En la solapa Mis gestiones se ve todo");
  });

  it("nothing missing prints as NaN or undefined", async () => {
    await openBoard({
      kpis: { visitas: 1 },
      por_mes: [{}],
      por_hunter: [{ id: "h1" }],
      por_tipo: [{}],
    });
    expect(screen().element().innerHTML).not.toMatch(/NaN|undefined/);
  });

  it("an answer that is not a dashboard is nothing", async () => {
    await openBoard(() => jsonResponse(null));
    await expect.element(screen()).toMatchTextContent("No hay gestiones en este período");
  });
});

describe("what it draws", () => {
  it("the months, the funnel, the packages and the reasons", async () => {
    await openBoard();
    const content = page.getByTestId("dashboard-content");

    await expect.element(content).toMatchTextContent("Evolución mensual");
    await expect.element(page.getByLabelText("Prospectos y altas por mes")).toBeVisible();
    expect.soft(content.element().textContent).toMatch(/sep 25/);
    await expect.element(content).toMatchTextContent("Asistentes95");
    await expect.element(content).toMatchTextContent("Con paquete: 2 (33%) · Sin paquete: 2 (33%)");
    await expect.element(content).toMatchTextContent("Plus2 · 33%");
    await expect.element(content).toMatchTextContent("2 altas sin paquete cargado");
    await expect.element(screen()).toMatchTextContent("No contesta2 · 67%");
    await expect.element(screen()).toMatchTextContent("Otro motivo1 · 33%");
  });

  it("the signups by package, all five even with none, and no income ranges", async () => {
    await openBoard();
    const content = page.getByTestId("dashboard-content");

    await expect.element(content).toMatchTextContent("Altas por paquete");
    await expect.element(content).toMatchTextContent("Sin paquete2 · 33%");
    await expect.element(content).toMatchTextContent("Plus Gold0 · 0%");
    await expect.element(content).toMatchTextContent("Eminent Platinum0 · 0%");
    await expect.element(content).toMatchTextContent("Eminent Black0 · 0%");
    expect(content.element().textContent).not.toMatch(/renta/i);
  });

  it("the rankings, with no row without an owner, and the packages of each hunter", async () => {
    await openBoard();

    await expect
      .element(screen())
      .toMatchTextContent("Sofía Paz3 con paquete (2 Plus · 1 Plus Gold) · 2 sin paquete25");
    expect(screen().element().textContent).not.toMatch(/—99/);
    await expect.element(screen()).toMatchTextContent("Oficiales Payroll");
    await expect.element(screen()).toMatchTextContent("ALIMENTOS SAVos · CUIT 30-90000111-8");
  });

  it("the types in their order, with signups per action", async () => {
    await openBoard();
    const text = screen().element().textContent;
    expect
      .soft(text.indexOf("Posición comercial presencial"))
      .toBeLessThan(text.indexOf("Feria presencial"));
    await expect.element(screen()).toMatchTextContent("Posición comercial presencial2952,556%");
  });

  it("with no data, says so on each one", async () => {
    await openBoard({ kpis: { visitas: 1 } });
    await expect.element(screen()).toMatchTextContent("Sin datos.");
    await expect.element(screen()).toMatchTextContent("Todavía no hay descartes con motivo.");
  });

  it("a hunter's ranking is called by them", async () => {
    await openBoard(FULL, { role: "hunter" });
    await expect.element(screen()).toMatchTextContent("Por hunter");
  });
});

describe("the officers to choose", () => {
  it("are everybody who forwards something, and the one chosen stays among them", async () => {
    const { asked } = await openBoard((request) =>
      jsonResponse(
        fieldsOf(request.body) && Reflect.get(fieldsOf(request.body), "p_dueno")
          ? { ...FULL, duenos: [], por_dueno: [] }
          : FULL,
      ),
    );
    const field = filters().getByRole("combobox", { name: "Oficial Payroll" });
    const options = () => field.element().querySelectorAll("option").length;
    expect(options()).toBe(3);

    await field.selectOptions("o2");

    await vi.waitFor(() => {
      expect(asked().at(-1)).toMatchObject({ p_dueno: "o2" });
    });
    await expect.element(field).toHaveValue("o2");
    // The answer of that officer has nobody else: the chosen one stays.
    await vi.waitFor(() => {
      expect(options()).toBe(2);
    });
  });

  it("without the list of everybody, those it counts", async () => {
    await openBoard({ ...FULL, duenos: [] });
    expect(
      filters()
        .getByRole("combobox", { name: "Oficial Payroll" })
        .element()
        .querySelectorAll("option"),
    ).toHaveLength(2);
  });
});

async function openQuarters() {
  const opened = await openBoard();
  await filters().getByRole("combobox", { name: "Período" }).selectOptions("q");
  await expect.element(panel()).toBeVisible();
  return opened;
}

const months = () => panel().element().getAttribute("data-months");

describe("the period by quarter", () => {
  it("starts on the quarter of today, and says what it counts", async () => {
    await openQuarters();
    expect(months()?.split(",")).toHaveLength(3);
    await expect.element(screen()).toMatchTextContent(`Q de ${String(thisYear())}`);
  });

  it("one touch chooses only that; with Shift it adds, and takes away", async () => {
    await openQuarters();

    await quarter(1).click();
    expect(months()).toBe("01,02,03");
    await expect.element(quarter(1)).toHaveAttribute("aria-pressed", "true");

    await quarter(3).click({ modifiers: ["Shift"] });
    expect(months()).toBe("01,02,03,07,08,09");
    await expect
      .element(screen())
      .toMatchTextContent(`El tablero cuenta 1Q y 3Q de ${String(thisYear())}`);

    await quarter(1).click({ modifiers: ["Shift"] });
    expect(months()).toBe("07,08,09");
  });

  it("the arrow opens the months, and a month alone is chosen", async () => {
    await openQuarters();

    await arrow(2).click();
    await expect.element(arrow(2)).toHaveAttribute("aria-expanded", "true");
    await panel().getByRole("button", { name: "Mayo" }).click();

    expect(months()).toBe("05");
    await expect.element(quarter(2)).toHaveAttribute("aria-pressed", "false");
    await expect.element(screen()).toMatchTextContent(`mayo de ${String(thisYear())}`);

    await panel()
      .getByRole("button", { name: "Junio" })
      .click({ modifiers: ["Shift"] });
    expect(months()).toBe("05,06");

    await arrow(2).click();
    await expect.element(panel().getByRole("button", { name: "Mayo" })).not.toBeInTheDocument();
  });

  it("the last month cannot be taken away", async () => {
    await openQuarters();
    await arrow(2).click();
    await panel().getByRole("button", { name: "Mayo" }).click();
    await panel()
      .getByRole("button", { name: "Mayo" })
      .click({ modifiers: ["Shift"] });
    expect(months()).toBe("05");
  });

  it("another year asks for it", async () => {
    const { asked } = await openQuarters();
    await quarter(1).click();

    await panel()
      .getByRole("combobox", { name: "Año" })
      .selectOptions(String(thisYear() - 2));

    await vi.waitFor(() => {
      expect(asked().at(-1)).toMatchObject({
        p_meses: [
          `${String(thisYear() - 2)}-01`,
          `${String(thisYear() - 2)}-02`,
          `${String(thisYear() - 2)}-03`,
        ],
      });
    });
  });

  it("goes away with another period, and its months stay", async () => {
    await openQuarters();
    await quarter(2).click();
    await filters().getByRole("combobox", { name: "Período" }).selectOptions("30");
    await expect.element(panel()).not.toBeInTheDocument();
    await filters().getByRole("combobox", { name: "Período" }).selectOptions("q");
    expect(months()).toBe("04,05,06");
  });
});

describe("while a new answer comes", () => {
  it("what is on screen stays", async () => {
    const slow = deferred<Response>();
    let first = true;
    await openBoard((request) => {
      if (first) {
        first = false;
        return jsonResponse(FULL);
      }
      void request;
      return slow.promise;
    });
    await expect.element(screen()).toMatchTextContent("Acciones3");

    await filters().getByRole("combobox", { name: "Período" }).selectOptions("todo");

    await expect.element(screen()).toMatchTextContent("Acciones3");
    slow.resolve(jsonResponse({ ...FULL, kpis: { ...FULL.kpis, visitas: 7 } }));
    await expect.element(screen()).toMatchTextContent("Acciones7");
  });
});

describe("a failure", () => {
  it.each([
    ["the server answers with an error", FAILS],
    ["the connection drops", CUT],
  ])("when %s says so, with no numbers, and offers to try again", async (_case, failure) => {
    let online = false;
    await openCommercial(boardOf((request) => (online ? jsonResponse(FULL) : failure(request))));
    await tab("Tablero").click();

    await expect.element(page.getByTestId("commercial-problem")).toBeVisible();
    await expect.element(filters()).not.toBeInTheDocument();

    online = true;
    await page.getByRole("button", { name: "Reintentar" }).click();
    await expect.element(screen()).toMatchTextContent("Acciones3");
  });
});

function downloads() {
  const names: string[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function record(
    this: HTMLAnchorElement,
  ) {
    names.push(this.download);
  });
  return names;
}

describe("the Excel", () => {
  it("goes down with the name of the day, and the actions of whoever asks", async () => {
    const names = downloads();
    const { harness } = await openBoard(FULL, { role: "admin", list: [] });

    await filters().getByRole("button", { name: "Descargar Excel" }).click();

    await vi.waitFor(() => {
      expect(names).toEqual([`Gestiones_${today()}.xlsx`]);
    });
    const [listed] = harness.network.to("/rest/v1/rpc/gestiones_lista");
    expect(listed?.body).toEqual({ p_limit: 500, p_solo_mio: true });
  });

  it("if the actions cannot be read, it says so and nothing goes down", async () => {
    const names = downloads();
    await openBoard(FULL, { list: FAILS });

    await filters().getByRole("button", { name: "Descargar Excel" }).click();

    await expect
      .element(page.getByRole("status"))
      .toMatchTextContent(/^No se pudo armar el Excel: /);
    expect(names).toEqual([]);
  });
});

function probe(): unknown {
  return Reflect.get(Object(window["__flyerProbe"]), "commercialDashboard");
}

describe("what a test can read", () => {
  it("is nothing while the numbers come", async () => {
    const slow = deferred<Response>();
    await openCommercial(boardOf(() => slow.promise));
    await tab("Tablero").click();
    await expect.element(page.getByText("Cargando…")).toBeVisible();
    const reader = probe();
    expect(typeof reader === "function" ? Reflect.apply(reader, undefined, []) : "none").toBeNull();
    slow.resolve(jsonResponse(FULL));
  });

  it("are the numbers of the answer on screen", async () => {
    await openBoard();
    await expect.element(screen()).toMatchTextContent("Acciones3");
    const reader = probe();
    const read: unknown =
      typeof reader === "function" ? Reflect.apply(reader, undefined, []) : null;
    expect(read).toEqual({
      actions: 3,
      unassigned: 1,
      hunterIds: ["h1", null, "h2"],
      countedOfficerIds: [ME],
    });
  });
});
