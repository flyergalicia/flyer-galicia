// The agenda over a simulated cloud: what each one sees and asks, and what a failure says.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { type Answer, deferred, jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import { mondayOf } from "../model/agenda-dates.ts";
import { addDays, dateLabel, today } from "../model/formatting.ts";
import { agendaTable, type AgendaTable } from "../testing/agenda-cloud.ts";
import { type CommercialCloud, CUT, FAILS, ME } from "../testing/commercial-cloud.ts";
import { openCommercial } from "../testing/commercial-on-screen.tsx";
import { anAction, aPerson, TEAM } from "../testing/fixtures.ts";

const MONDAY = mondayOf(today());
const TUESDAY = addDays(MONDAY, 1);
const NEXT_MONDAY = addDays(MONDAY, 7);
const SUNDAY = addDays(MONDAY, 6);

const OCCUPANCY = "/rest/v1/rpc/gestiones_ocupacion";

const tabs = () => page.getByTestId("commercial-tabs");
const tab = (name: string) => tabs().getByRole("tab", { name: new RegExp(`^${name}`) });
const agenda = () => page.getByTestId("agenda");
const views = () => agenda().getByRole("group", { name: "Cómo ver la agenda" });
const view = (name: string) => views().getByRole("button", { name, exact: true });
const days = () => agenda().getByTestId("agenda-day");
const dayOf = (date: string) => {
  const found = days()
    .elements()
    .find((element) => element.dataset.day === date);
  if (!found) throw new Error(`No column for ${date}`);
  return page.elementLocator(found);
};
const blocks = () => agenda().getByTestId("agenda-block");
const windowOf = () => page.getByTestId("action-window");
const range = () => page.getByTestId("agenda-range");
const nav = (name: RegExp | string) => page.getByTestId("agenda-nav").getByRole("button", { name });
const tray = (id: string) => page.getByTestId(`tray-${id}`);
const TAKEN = "Ocupado: ya tiene algo a esa hora";
const detail = () => page.getByTestId("action-detail");

const OWN = anAction({
  id: "mine",
  empresa: "ALIMENTOS SA",
  fecha: TUESDAY,
  hunter_id: "h1",
  dueno_id: ME,
  creada_por: ME,
  hora_desde: "10:00:00",
  hora_hasta: "12:00:00",
});

const HIDDEN = {
  id: "other",
  hunter_id: "h1",
  fecha: TUESDAY,
  hora_desde: "15:00:00",
  hora_hasta: "17:00:00",
  tipo: "accion",
  empresa: null,
};

function cloudOf(table: AgendaTable, cloud: CommercialCloud = {}): CommercialCloud {
  const { tables, ...rest } = cloud;
  return {
    companies: [],
    ...rest,
    tables: { gestiones: agendaTable(table), ...tables },
  };
}

async function openAgenda(table: AgendaTable = {}, cloud: CommercialCloud = {}) {
  const opened = await openCommercial(cloudOf(table, cloud));
  const { role = "vip" } = cloud;
  if (role !== "hunter" && role !== "lider") await tab("Agenda").click();
  await expect.element(agenda()).toBeVisible();
  return opened;
}

const officerWithOccupancy = (occupied: readonly object[] | Answer) => ({
  functions_: {
    gestiones_ocupacion: typeof occupied === "function" ? occupied : () => jsonResponse(occupied),
  },
});

function ofMe(member: (typeof TEAM)[string]) {
  return member?.lider_id === "l1" ? { ...member, lider_id: ME } : member;
}

const TEAM_OF_ME = Object.values(TEAM).map((member) => ofMe(member));

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("how it starts", () => {
  it("whoever assigns, on the day of all the hunters", async () => {
    await openAgenda({}, officerWithOccupancy([]));

    await expect.element(view("Día del equipo")).toHaveAttribute("aria-pressed", "true");
    await expect.element(page.getByTestId("agenda-team")).toBeVisible();
    await expect.element(agenda().getByText("Sofía Paz")).toBeVisible();
    await expect.element(agenda().getByText("prueba", { exact: true })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Pegar desde Excel" })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "+ Asignar" })).toBeVisible();
    await expect.element(range()).toMatchTextContent(dateLabel(today()));
  });

  it("a hunter, on their week, with nothing to paste", async () => {
    await openAgenda({}, { role: "hunter" });

    await expect.element(view("Semana")).toHaveAttribute("aria-pressed", "true");
    await expect.element(view("Día")).toBeVisible();
    await expect.element(view("Día del equipo")).not.toBeInTheDocument();
    await expect.element(page.getByRole("button", { name: "+ Agendar" })).toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Pegar desde Excel" }))
      .not.toBeInTheDocument();
    await vi.waitFor(() => {
      expect(days().elements()).toHaveLength(6);
    });
  });

  it("what was chosen on this computer stays", async () => {
    localStorage.setItem("fg_ges_agver", "mes");
    await openAgenda({}, officerWithOccupancy([]));
    await expect.element(view("Mes")).toHaveAttribute("aria-pressed", "true");

    await view("Semana").click();

    await expect.element(view("Semana")).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem("fg_ges_agver")).toBe("sem");
  });

  it("a leader sees only the team, on the day of the team and on the week", async () => {
    await openAgenda({}, { role: "lider", personsOfTeam: TEAM_OF_ME });

    const team = page.getByTestId("agenda-team");
    await expect.element(team.getByRole("row").filter({ hasText: "Sofía Paz" })).toBeVisible();
    await expect.element(team.getByRole("row").filter({ hasText: "Tomás Ríos" })).toBeVisible();
    await expect.element(team.getByText("Otro Hunter")).not.toBeInTheDocument();

    await view("Semana").click();
    const whose = agenda().getByRole("combobox", { name: "Agenda de" });
    await expect.element(whose.getByRole("option", { name: "Sofía Paz" })).toBeInTheDocument();
    await expect.element(whose.getByRole("option", { name: "Tomás Ríos" })).toBeInTheDocument();
    await expect
      .element(whose.getByRole("option", { name: "Otro Hunter" }))
      .not.toBeInTheDocument();
  });

  it("touching the view it is on does nothing", async () => {
    await openAgenda({}, officerWithOccupancy([]));
    await view("Día del equipo").click();
    expect(localStorage.getItem("fg_ges_agver")).toBeNull();
  });
});

function reads(opened: Awaited<ReturnType<typeof openAgenda>>) {
  return opened.harness.network
    .to("/rest/v1/gestiones", "GET")
    .filter(({ query }) => query.get("select")?.includes("modalidad"));
}

describe("what it asks", () => {
  it("a hunter only theirs, and never the occupation of others", async () => {
    const opened = await openAgenda({ period: [OWN] }, { role: "hunter" });

    await vi.waitFor(() => {
      expect(reads(opened).length).toBeGreaterThan(0);
    });
    expect.soft(reads(opened)[0]?.query.get("hunter_id")).toBe(`eq.${ME}`);
    expect.soft(opened.harness.network.to(OCCUPANCY)).toEqual([]);
  });

  it.each(["lider", "admin"])("%s does not ask for the hidden occupation", async (role) => {
    const opened = await openAgenda({}, { role, personsOfTeam: TEAM_OF_ME });
    await vi.waitFor(() => {
      expect(reads(opened).length).toBeGreaterThan(0);
    });
    expect(opened.harness.network.to(OCCUPANCY)).toEqual([]);
  });

  it("an officer does, for the week it looks at", async () => {
    const opened = await openAgenda({}, officerWithOccupancy([]));

    await vi.waitFor(() => {
      expect(opened.harness.network.to(OCCUPANCY)).toHaveLength(1);
    });
    expect(opened.harness.network.to(OCCUPANCY)[0]?.body).toEqual({
      p_desde: MONDAY,
      p_hasta: SUNDAY,
    });
  });

  it("but not on the month", async () => {
    localStorage.setItem("fg_ges_agver", "mes");
    const opened = await openAgenda({}, officerWithOccupancy([HIDDEN]));
    await expect.element(page.getByTestId("agenda-month")).toBeVisible();
    expect(opened.harness.network.to(OCCUPANCY)).toEqual([]);
  });

  it("going from the week to the day of the team asks nothing", async () => {
    const opened = await openAgenda({}, officerWithOccupancy([]));
    await view("Semana").click();
    await expect.element(days().first()).toBeVisible();
    const before = reads(opened).length;

    await view("Día del equipo").click();
    await expect.element(page.getByTestId("agenda-team")).toBeVisible();

    expect.soft(reads(opened)).toHaveLength(before);
    expect.soft(opened.harness.network.to(OCCUPANCY)).toHaveLength(1);
  });

  it("the month is another period, and it asks", async () => {
    const opened = await openAgenda({}, officerWithOccupancy([]));
    const before = reads(opened).length;
    await view("Mes").click();
    await expect.element(page.getByTestId("agenda-month")).toBeVisible();
    expect(reads(opened).length).toBeGreaterThan(before);
  });
});

async function openOnSofia(occupied: readonly object[] = [HIDDEN]) {
  localStorage.setItem("fg_ges_agver", "sem");
  await openAgenda({ period: [OWN] }, officerWithOccupancy([...occupied, { ...OWN }]));
  await agenda().getByRole("combobox", { name: "Agenda de" }).selectOptions("h1");
  await expect.element(blocks().first()).toBeVisible();
}

describe("what is not one's own", () => {
  it('shows as "Ocupado", without the company, and nothing to open', async () => {
    await openOnSofia();

    const taken = agenda().getByTitle(TAKEN);
    await expect.element(taken).toMatchTextContent("15–17Ocupado");
    await expect.element(taken).toHaveAttribute("title", "Ocupado: ya tiene algo a esa hora");
    expect(taken.element().tagName).toBe("SPAN");
    await expect.element(agenda().getByText(/En rojo/)).toBeVisible();
  });

  it("is not counted twice if it is also one's own", async () => {
    await openOnSofia();
    await vi.waitFor(() => {
      expect(blocks().elements()).toHaveLength(2);
    });
  });

  it("touching it asks to assign at that time, as any spot of the column", async () => {
    await openOnSofia();

    await agenda().getByTitle(TAKEN).click();

    await expect.element(windowOf()).toMatchTextContent("Asignar a un hunter");
    await expect.element(windowOf().getByLabelText("Desde", { exact: true })).toHaveValue("16:00");
    await expect.element(page.getByTestId("action-detail")).not.toBeInTheDocument();
  });

  it("the block that is one's own opens its action", async () => {
    await openOnSofia();

    await blocks().filter({ hasText: "ALIMENTOS SA" }).click();

    await expect.element(detail()).toHaveAttribute("data-action-id", "mine");
    await expect.element(windowOf()).not.toBeInTheDocument();
  });
});

async function openWeek(period: readonly object[], occupied: readonly object[] = []) {
  localStorage.setItem("fg_ges_agver", "sem");
  await openAgenda({ period }, officerWithOccupancy(occupied));
  await expect.element(days().first()).toBeVisible();
  await agenda().getByRole("combobox", { name: "Agenda de" }).selectOptions("h1");
}

describe("the calendar by hours", () => {
  it("goes from 8 to 18 with nothing on it", async () => {
    await openWeek([]);
    await expect.element(agenda().getByText("08:00")).toBeVisible();
    await expect.element(agenda().getByText("17:00")).toBeVisible();
    await expect.element(agenda().getByText("07:00")).not.toBeInTheDocument();
    await expect.element(agenda().getByText("18:00")).not.toBeInTheDocument();
  });

  it("stretches by itself, so nothing stays out", async () => {
    await openWeek([
      { ...OWN, id: "early", hora_desde: "07:00:00", hora_hasta: "08:00:00" },
      { ...OWN, id: "late", hora_desde: "19:00:00", hora_hasta: "20:00:00" },
    ]);
    await expect.element(agenda().getByText("07:00")).toBeVisible();
    await expect.element(agenda().getByText("19:00")).toBeVisible();
  });

  it("shares out in columns what overlaps", async () => {
    await openWeek([
      OWN,
      { ...OWN, id: "second", empresa: "BETA SA", hora_desde: "11:00:00", hora_hasta: "13:00:00" },
    ]);
    const first = blocks().filter({ hasText: "ALIMENTOS SA" }).element();
    const second = blocks().filter({ hasText: "BETA SA" }).element();
    if (!(first instanceof HTMLElement) || !(second instanceof HTMLElement)) {
      throw new Error("No blocks");
    }

    expect.soft(first.style.width).toBe("50%");
    expect.soft(second.style.width).toBe("50%");
    expect.soft(first.style.left).toBe("0%");
    expect.soft(second.style.left).toBe("50%");
  });

  it("what has no time goes apart, and it opens", async () => {
    await openWeek([
      { ...OWN, id: "loose", empresa: "SUELTA SA", hora_desde: null, hora_hasta: null },
    ]);

    await expect.element(agenda().getByText("Sin horario", { exact: true }).first()).toBeVisible();
    await agenda()
      .getByRole("button", { name: /SUELTA SA/ })
      .click();

    await expect.element(detail()).toHaveAttribute("data-action-id", "loose");
  });

  it("nothing without a time leaves no row for it", async () => {
    await openWeek([OWN]);
    await expect
      .element(agenda().getByText("Sin horario", { exact: true }))
      .not.toBeInTheDocument();
  });

  it("nothing missing prints as NaN or undefined, on any view", async () => {
    const sparse = [
      { ...OWN, id: "no-end", hora_hasta: null, lugar: null, cuit: null, fecha: today() },
      { ...OWN, id: "no-time", hora_desde: null, hora_hasta: null, fecha: today() },
    ];
    await openWeek(sparse, [{ ...HIDDEN, fecha: today(), hora_hasta: null }]);
    await expect.element(blocks().first()).toBeVisible();
    const printed = () => agenda().element().innerHTML;
    expect.soft(printed()).not.toMatch(/NaN|undefined/);

    await view("Día del equipo").click();
    await expect.element(page.getByTestId("agenda-team")).toBeVisible();
    expect.soft(printed()).not.toMatch(/NaN|undefined/);

    await view("Mes").click();
    await expect.element(page.getByTestId("agenda-month")).toBeVisible();
    await expect.element(agenda().getByText("ALIMENTOS SA").first()).toBeVisible();
    expect.soft(printed()).not.toMatch(/NaN|undefined/);
  });

  it("Sunday shows only if it has something", async () => {
    await openWeek([{ ...OWN, fecha: SUNDAY }]);
    await vi.waitFor(() => {
      expect(days().elements()).toHaveLength(7);
    });
  });

  it("each state has its look, and asking for another reads as such", async () => {
    await openWeek([
      { ...OWN, id: "done", estado: "realizada", empresa: "HECHA SA" },
      {
        ...OWN,
        id: "cancelled",
        estado: "cancelada",
        empresa: "CANCELADA SA",
        hora_desde: "14:00:00",
        hora_hasta: "15:00:00",
      },
      {
        ...OWN,
        id: "cannot",
        empresa: "NO PUEDE SA",
        no_puede_at: "2026-01-01",
        lugar: "Planta",
        hora_desde: "16:00:00",
        hora_hasta: "17:00:00",
      },
    ]);

    await expect
      .element(blocks().filter({ hasText: "NO PUEDE SA" }))
      .toHaveAttribute("title", "Acción · NO PUEDE SA · Planta");
    const classes = (name: string) => blocks().filter({ hasText: name }).element().className;
    expect.soft(classes("HECHA SA")).toMatch(/blockDone/);
    expect.soft(classes("CANCELADA SA")).toMatch(/blockCancelled/);
    expect.soft(classes("NO PUEDE SA")).toMatch(/blockCannot/);
  });

  it("whose agenda it is, chosen above; the first by default", async () => {
    localStorage.setItem("fg_ges_agver", "sem");
    await openAgenda(
      { period: [OWN, { ...OWN, id: "of-tomas", empresa: "DE TOMAS SA", hunter_id: "h2" }] },
      officerWithOccupancy([]),
    );

    await expect.element(agenda().getByRole("combobox", { name: "Agenda de" })).toHaveValue("h9");
    await expect.element(agenda().getByText("ALIMENTOS SA")).not.toBeInTheDocument();

    const whose = agenda().getByRole("combobox", { name: "Agenda de" });
    await whose.selectOptions("h1");
    await expect.element(agenda().getByText("ALIMENTOS SA")).toBeVisible();
    await expect.element(agenda().getByText("DE TOMAS SA")).not.toBeInTheDocument();

    await whose.selectOptions("h2");
    await expect.element(agenda().getByText("DE TOMAS SA")).toBeVisible();
  });

  it("a hunter of nobody's team, with something on the agenda, can be chosen", async () => {
    localStorage.setItem("fg_ges_agver", "sem");
    await openAgenda({ period: [{ ...OWN, hunter_id: "gone" }] }, officerWithOccupancy([]));
    await expect
      .element(
        agenda()
          .getByRole("combobox", { name: "Agenda de" })
          .getByRole("option", { name: "Usuario dado de baja" }),
      )
      .toBeInTheDocument();
  });

  it("touching a free spot asks to assign that hunter at that time", async () => {
    await openWeek([]);

    await dayOf(TUESDAY).click({ position: { x: 5, y: 46 * 2 + 5 } });

    await expect.element(windowOf()).toMatchTextContent("Asignar a un hunter");
    await expect.element(page.getByTestId("form-date")).toHaveValue(TUESDAY);
    await expect.element(windowOf().getByLabelText("Desde", { exact: true })).toHaveValue("10:00");
    await expect.element(windowOf().getByLabelText("Hasta", { exact: true })).toHaveValue("11:00");
    await expect.element(page.getByTestId("form-hunter")).toHaveValue("h1");
  });

  it("a hunter schedules for themselves, one single day if they ask", async () => {
    await openAgenda({ period: [] }, { role: "hunter" });

    await view("Día").click();
    await vi.waitFor(() => {
      expect(days().elements()).toHaveLength(1);
    });
    await expect.element(range()).toMatchTextContent(dateLabel(today()));

    await days()
      .first()
      .click({ position: { x: 5, y: 5 } });

    await expect.element(windowOf()).toMatchTextContent("Agendar");
    await expect.element(page.getByTestId("form-hunter")).not.toBeInTheDocument();
    await expect.element(windowOf().getByLabelText("Desde", { exact: true })).toHaveValue("08:00");
  });
});

describe("the day of the team", () => {
  const onToday = { fecha: today() };

  it("one place per hour, joining what is the same thing", async () => {
    await openAgenda(
      { period: [{ ...OWN, ...onToday }] },
      officerWithOccupancy([{ ...HIDDEN, ...onToday }]),
    );

    const row = agenda().getByRole("row").filter({ hasText: "Sofía Paz" });
    await expect.element(row.getByRole("button", { name: "ALIMENTOS SA" })).toBeVisible();
    const taken = row.getByTitle(TAKEN);
    await expect.element(taken).toMatchTextContent("Ocupado");
    await expect.element(taken).toHaveAttribute("colspan", "2");
    await expect.element(row.getByRole("button", { name: "Libre" }).first()).toBeVisible();
    await vi.waitFor(() => {
      expect(row.getByRole("button", { name: "Libre" }).elements()).toHaveLength(6);
    });
  });

  it("what was cancelled does not take a place", async () => {
    await openAgenda(
      { period: [{ ...OWN, ...onToday, estado: "cancelada" }] },
      officerWithOccupancy([]),
    );
    await expect
      .element(agenda().getByRole("button", { name: "ALIMENTOS SA" }))
      .not.toBeInTheDocument();
  });

  it("the company opens its action", async () => {
    await openAgenda({ period: [{ ...OWN, ...onToday }] }, officerWithOccupancy([]));
    await agenda().getByRole("button", { name: "ALIMENTOS SA" }).click();
    await expect.element(detail()).toHaveAttribute("data-action-id", "mine");
  });

  it("Libre asks to assign that hunter at that time, an hour long", async () => {
    await openAgenda({}, officerWithOccupancy([]));

    await agenda()
      .getByRole("row")
      .filter({ hasText: "Tomás Ríos" })
      .getByTitle("Libre: asignarle algo a las 09:00")
      .click();

    await expect.element(page.getByTestId("form-hunter")).toHaveValue("h2");
    await expect.element(page.getByTestId("form-date")).toHaveValue(today());
    await expect.element(windowOf().getByLabelText("Desde", { exact: true })).toHaveValue("09:00");
    await expect.element(windowOf().getByLabelText("Hasta", { exact: true })).toHaveValue("10:00");
  });

  it("the legend speaks of red only to whoever has it", async () => {
    await openAgenda({}, { role: "lider", personsOfTeam: TEAM_OF_ME });
    await expect.element(agenda().getByText(/Tocá/)).toBeVisible();
    await expect.element(agenda().getByText(/En rojo/)).not.toBeInTheDocument();
  });

  it("the arrows go day by day, and the pills choose one on a phone", async () => {
    await page.viewport(390, 800);
    await openAgenda({}, officerWithOccupancy([]));
    const pills = agenda().getByRole("tablist");
    await expect.element(pills).toBeVisible();

    await pills.getByRole("tab").nth(1).click();

    await expect.element(pills.getByRole("tab").nth(1)).toHaveAttribute("aria-selected", "true");
    await expect.element(range()).toMatchTextContent(dateLabel(TUESDAY));
    await page.viewport(1280, 800);
  });
});

describe("the month", () => {
  beforeEach(() => {
    localStorage.setItem("fg_ges_agver", "mes");
  });

  it("is a calendar of whole weeks, that says which day is today", async () => {
    await openAgenda({ period: [{ ...OWN, fecha: today() }] }, officerWithOccupancy([]));

    const month = page.getByTestId("agenda-month");
    await expect.element(month).toMatchTextContent("· hoy");
    await expect.element(month.getByRole("button", { name: /10–12.*ALIMENTOS SA/ })).toBeVisible();
    await expect.element(agenda().getByText(/En el mes se ve lo que tenés cargado/)).toBeVisible();
  });

  it("filters by hunter", async () => {
    await openAgenda({ period: [{ ...OWN, fecha: today() }] }, officerWithOccupancy([]));
    await agenda().getByRole("combobox", { name: "Hunter" }).selectOptions("h2");

    await expect.element(agenda().getByText("ALIMENTOS SA")).not.toBeInTheDocument();
    await expect.element(agenda().getByText("No hay nada agendado este mes.")).toBeVisible();
  });

  it("says when a hunter has nothing, with no filter of hunters", async () => {
    await openAgenda({}, { role: "hunter" });
    await expect.element(agenda().getByText("Este mes no tenés nada agendado.")).toBeVisible();
    await expect
      .element(agenda().getByRole("combobox", { name: "Hunter" }))
      .not.toBeInTheDocument();
  });

  it("the arrows go month by month, and Hoy comes back", async () => {
    await openAgenda({}, officerWithOccupancy([]));
    const month = agenda().element().getAttribute("data-month") ?? "";

    await nav(/Mes siguiente/).click();
    await vi.waitFor(() => {
      expect(agenda().element().getAttribute("data-month")).not.toBe(month);
    });

    await nav("Hoy").click();
    await vi.waitFor(() => {
      expect(agenda().element().getAttribute("data-month")).toBe(month);
    });
  });

  it("a block of the month says what it is, and it opens", async () => {
    await openAgenda(
      {
        period: [
          {
            ...OWN,
            fecha: today(),
            id: "np",
            visto_dueno: false,
            no_puede_at: "2026-01-01",
            lugar: "Planta",
            cuit: "30900001118",
          },
          { ...OWN, fecha: today(), id: "done", estado: "realizada", empresa: "HECHA SA" },
          { ...OWN, fecha: today(), id: "gone", estado: "cancelada", empresa: "CANCELADA SA" },
        ],
      },
      officerWithOccupancy([]),
    );

    const block = agenda().getByRole("button", { name: /ALIMENTOS SA/ });
    await expect
      .element(block)
      .toHaveAttribute(
        "title",
        "Acción · ALIMENTOS SA · CUIT 30-90000111-8 · Planta · Sofía Paz · pidió que se la pasen a otro",
      );
    expect.soft(block.element().className).toMatch(/actionNew/);
    expect.soft(block.element().className).toMatch(/actionCannot/);
    const classes = (name: RegExp) => agenda().getByRole("button", { name }).element().className;
    expect.soft(classes(/HECHA SA/)).toMatch(/actionDone/);
    expect.soft(classes(/CANCELADA SA/)).toMatch(/actionCancelled/);

    await block.click();
    await expect.element(detail()).toHaveAttribute("data-action-id", "np");
  });
});

describe("the arrows on the week", () => {
  beforeEach(() => {
    localStorage.setItem("fg_ges_agver", "sem");
  });

  it("go a week at a time, and Hoy comes back", async () => {
    await openAgenda(
      { period: [{ ...OWN, fecha: NEXT_MONDAY, empresa: "SIGUIENTE SA" }] },
      officerWithOccupancy([]),
    );
    await expect.element(agenda().getByText("SIGUIENTE SA")).not.toBeInTheDocument();
    const before = range().element().textContent;

    await nav(/Semana siguiente/).click();
    await expect.element(agenda().getByText("Tomás Ríos")).toBeInTheDocument();
    await agenda().getByRole("combobox", { name: "Agenda de" }).selectOptions("h1");
    await expect.element(agenda().getByText("SIGUIENTE SA")).toBeVisible();

    await nav("Hoy").click();
    await vi.waitFor(() => {
      expect(range().element().textContent).toBe(before);
    });
    await nav(/Semana anterior/).click();
    await vi.waitFor(() => {
      expect(range().element().textContent).not.toBe(before);
    });
  });

  it("the late answer of another week does not step on the one being looked at", async () => {
    const late = deferred<Response>();
    const table = agendaTable({ period: [OWN] });
    const opened = await openAgenda(
      {},
      {
        ...officerWithOccupancy([]),
        tables: {
          gestiones: (request) => {
            const isNextWeek = request.query.getAll("fecha").includes(`gte.${NEXT_MONDAY}`);
            return isNextWeek ? late.promise : table(request);
          },
        },
      },
    );
    await agenda().getByRole("combobox", { name: "Agenda de" }).selectOptions("h1");
    await expect.element(agenda().getByText("ALIMENTOS SA")).toBeVisible();
    expect(opened).toBeTruthy();

    await nav(/Semana siguiente/).click();
    await expect.element(page.getByText("Cargando…")).toBeVisible();
    // The arrows go with what is loading; another solapa and back is how a person returns to it.
    await tab("Gestiones").click();
    await tab("Agenda").click();
    late.resolve(jsonResponse([{ ...OWN, id: "tarde", empresa: "TARDE SA", fecha: NEXT_MONDAY }]));

    await expect.element(agenda().getByText("TARDE SA")).toBeVisible();
    await nav("Hoy").click();
    await expect.element(agenda().getByText("TARDE SA")).not.toBeInTheDocument();
  });

  it("going to another week and coming back reads it again, once the other arrived", async () => {
    const opened = await openAgenda({ period: [OWN] }, officerWithOccupancy([]));
    const ofThisWeek = () =>
      opened.harness.network
        .to("/rest/v1/gestiones", "GET")
        .filter(({ query }) => query.getAll("fecha").includes(`gte.${MONDAY}`));
    await vi.waitFor(() => {
      expect(ofThisWeek().length).toBeGreaterThan(0);
    });
    const before = ofThisWeek().length;

    await nav(/Semana siguiente/).click();
    await expect.element(range()).not.toMatchTextContent("Cargando");
    await nav(/Semana anterior/).click();

    await vi.waitFor(() => {
      expect(ofThisWeek().length).toBeGreaterThan(before);
    });
  });
});

describe("while it loads", () => {
  it("another solapa does not get painted over", async () => {
    const slow = deferred<Response>();
    await openCommercial(
      cloudOf(
        {},
        {
          list: [],
          tables: {
            gestiones: () => slow.promise,
          },
        },
      ),
    );
    await tab("Agenda").click();
    await expect.element(page.getByText("Cargando…")).toBeVisible();

    await tab("Gestiones").click();
    await expect.element(page.getByTestId("actions-list")).toBeVisible();
    slow.resolve(jsonResponse([]));

    await expect.element(page.getByTestId("actions-list")).toBeVisible();
    await expect.element(agenda()).not.toBeInTheDocument();
  });
});

describe("a failure", () => {
  it("of the period says so, and offers to try again", async () => {
    let online = false;
    await openCommercial(
      cloudOf(
        {},
        {
          ...officerWithOccupancy([]),
          tables: {
            gestiones: (request) => (online ? agendaTable({})(request) : FAILS(request)),
          },
        },
      ),
    );
    await tab("Agenda").click();

    await expect.element(page.getByTestId("commercial-problem")).toBeVisible();
    await expect.element(agenda()).not.toBeInTheDocument();

    online = true;
    await page.getByRole("button", { name: "Reintentar" }).click();
    await expect.element(agenda()).toBeVisible();
  });

  it("of what others have does not say they are free", async () => {
    let online = false;
    await openAgenda(
      { period: [] },
      officerWithOccupancy((request) => (online ? jsonResponse([HIDDEN]) : CUT(request))),
    );

    const missing = page.getByTestId("agenda-missing");
    await expect.element(missing).toMatchTextContent("No se pudieron traer los horarios ocupados");

    online = true;
    await missing.getByRole("button", { name: "Reintentar" }).click();
    await expect.element(missing).not.toBeInTheDocument();
  });

  it("of the trays does not say there is nothing on them", async () => {
    await openAgenda(
      {},
      {
        ...officerWithOccupancy([]),
        tables: {
          gestiones: (request) =>
            request.query.get("hunter_id") === "is.null"
              ? FAILS(request)
              : agendaTable({})(request),
        },
      },
    );
    await expect
      .element(page.getByTestId("agenda-missing"))
      .toMatchTextContent("No se pudieron traer las bandejas");
  });

  it("of how the lists are going counts as one of the trays", async () => {
    await openAgenda(
      {},
      {
        ...officerWithOccupancy([]),
        tables: {
          gestiones: agendaTable({
            dataLists: [anAction({ id: "list", tipo: "datos", hunter_id: "h1" })],
          }),
          gestion_prospectos: FAILS,
        },
      },
    );
    await expect
      .element(page.getByTestId("agenda-missing"))
      .toMatchTextContent("No se pudieron traer las bandejas");
  });

  it("of the people does not say there are no hunters", async () => {
    localStorage.setItem("fg_ges_agver", "sem");
    await openAgenda({}, { ...officerWithOccupancy([]), personsOfTeam: FAILS });
    await expect.element(agenda().getByText("No se pudieron traer los hunters.")).toBeVisible();
  });
});

describe("with nobody", () => {
  it("a leader is told who gives them a team", async () => {
    await openAgenda({}, { role: "lider", personsOfTeam: [] });
    await expect.element(agenda().getByText(/Todavía no tenés hunters en tu equipo/)).toBeVisible();
  });

  it("an officer is told there are none", async () => {
    localStorage.setItem("fg_ges_agver", "sem");
    await openAgenda({}, { ...officerWithOccupancy([]), personsOfTeam: [] });
    await expect.element(agenda().getByText("No hay hunters activos.")).toBeVisible();
  });
});

describe("the trays", () => {
  const UNASSIGNED = anAction({
    id: "free-one",
    empresa: "SIN NADIE SA",
    hunter_id: null,
    lider_id: ME,
    fecha: TUESDAY,
    hora_desde: null,
    hora_hasta: null,
    creada_por: "o1",
  });
  const CANNOT = anAction({
    id: "cannot-one",
    empresa: "NO PUEDE SA",
    hunter_id: "h1",
    fecha: TUESDAY,
    no_puede_at: "2026-01-01",
    no_puede_motivo: "Tengo otra cosa",
    creada_por: ME,
  });
  const LIST = anAction({
    id: "list-one",
    empresa: "LISTA SA",
    tipo: "datos",
    hunter_id: "h2",
    vence: addDays(today(), 3),
    fecha: TUESDAY,
  });
  const leaderCloud = {
    role: "lider",
    personsOfTeam: TEAM_OF_ME,
    prospects: [
      aPerson({ id: "p1", gestion_id: "list-one", estado: "a_contactar" }),
      aPerson({ id: "p2", gestion_id: "list-one", estado: "prospecto" }),
      aPerson({ id: "p3", gestion_id: "list-one", estado: "alta" }),
    ],
    tables: {
      gestion_prospectos: () =>
        jsonResponse([
          aPerson({ id: "p1", gestion_id: "list-one", estado: "a_contactar" }),
          aPerson({ id: "p2", gestion_id: "list-one", estado: "prospecto" }),
          aPerson({ id: "p3", gestion_id: "list-one", estado: "alta" }),
        ]),
    },
  };

  it("say what they have, with who and how it goes", async () => {
    await openAgenda(
      { unassigned: [UNASSIGNED], cannotAttend: [CANNOT], dataLists: [LIST] },
      leaderCloud,
    );

    await expect.element(tray("unassigned")).toMatchTextContent("Por asignar (1)");
    await expect.element(tray("unassigned")).toMatchTextContent("SIN NADIE SA");
    await expect.element(tray("unassigned")).toMatchTextContent("de Mariana Costa");
    await expect
      .element(tray("reassign-requests"))
      .toMatchTextContent("Piden que se la pasen a otro (1)");
    await expect.element(tray("reassign-requests")).toMatchTextContent("Tengo otra cosa");
    await expect.element(tray("reassign-requests")).toMatchTextContent("Sofía Paz");
    await expect.element(tray("data-lists")).toMatchTextContent("Bases para trabajar (1)");
    await expect.element(tray("data-lists")).toMatchTextContent("2 de 3 contactados · 1 alta");
    await expect.element(tray("data-lists")).toMatchTextContent("hasta el");
  });

  it("the signups of a list, in plural", async () => {
    await openAgenda(
      { dataLists: [LIST] },
      {
        ...leaderCloud,
        tables: {
          gestion_prospectos: () =>
            jsonResponse([
              aPerson({ id: "p1", gestion_id: "list-one", estado: "alta" }),
              aPerson({ id: "p2", gestion_id: "list-one", estado: "alta" }),
            ]),
        },
      },
    );
    await expect.element(tray("data-lists")).toMatchTextContent("2 de 2 contactados · 2 altas");
  });

  it("with no trays, nothing on top", async () => {
    await openAgenda({}, leaderCloud);
    await expect.element(tray("unassigned")).not.toBeInTheDocument();
    await expect.element(tray("reassign-requests")).not.toBeInTheDocument();
    await expect.element(tray("data-lists")).not.toBeInTheDocument();
  });

  it("what has no hunter opens on the window that assigns it, and comes back to the agenda", async () => {
    await openAgenda({ unassigned: [UNASSIGNED] }, leaderCloud);

    await tray("unassigned")
      .getByRole("button", { name: /SIN NADIE SA/ })
      .click();

    await expect.element(page.getByTestId("confirm-assignment")).toBeVisible();
    await expect.element(windowOf()).toMatchTextContent("Asignar a un hunter");
    await page.getByTestId("window-dismiss").click();

    await page.getByTestId("action-back").click();
    await expect.element(agenda()).toBeVisible();
  });

  it("who asked to be replaced opens on the window that changes it", async () => {
    await openAgenda({ cannotAttend: [CANNOT] }, leaderCloud);

    await tray("reassign-requests")
      .getByRole("button", { name: /NO PUEDE SA/ })
      .click();

    await expect.element(windowOf()).toMatchTextContent("Cambiar el hunter");
  });

  it("a list opens on its action, with no window", async () => {
    await openAgenda({ dataLists: [LIST] }, leaderCloud);

    await tray("data-lists")
      .getByRole("button", { name: /LISTA SA/ })
      .click();

    await expect.element(detail()).toHaveAttribute("data-action-id", "list-one");
    await expect.element(windowOf()).not.toBeInTheDocument();
  });

  it("show six, and say how many more", async () => {
    const many = Array.from({ length: 8 }, (_, index) => ({
      ...UNASSIGNED,
      id: `u${String(index)}`,
      empresa: `EMPRESA ${String(index)}`,
    }));
    await openAgenda({ unassigned: many }, leaderCloud);

    await expect.element(tray("unassigned")).toMatchTextContent("Por asignar (8)");
    await expect.element(tray("unassigned")).toMatchTextContent("Y 2 más.");
    await vi.waitFor(() => {
      expect(tray("unassigned").getByRole("button").elements()).toHaveLength(6);
    });
  });

  it("looking at one hunter they show what is theirs, once something is touched", async () => {
    localStorage.setItem("fg_ges_agver", "sem");
    const ofOther = { ...CANNOT, id: "cannot-two", empresa: "DE TOMAS SA", hunter_id: "h2" };
    await openAgenda({ cannotAttend: [CANNOT, ofOther], unassigned: [UNASSIGNED] }, leaderCloud);

    await expect.element(tray("reassign-requests")).toMatchTextContent("(2)");

    await agenda().getByRole("combobox", { name: "Agenda de" }).selectOptions("h1");

    await expect.element(tray("reassign-requests")).toMatchTextContent("(1)");
    await expect.element(tray("reassign-requests")).toMatchTextContent("NO PUEDE SA");
    // What has no hunter still shows.
    await expect.element(tray("unassigned")).toMatchTextContent("SIN NADIE SA");
  });

  it("whoever cannot change it sees the reason, with nothing to do", async () => {
    const ofAnother = { ...CANNOT, creada_por: "o9", lider_id: "l9" };
    await openAgenda(
      { cannotAttend: [ofAnother], unassigned: [{ ...UNASSIGNED, creada_por: "o9" }] },
      officerWithOccupancy([]),
    );

    await expect.element(tray("reassign-requests")).not.toMatchTextContent("Cambiar hunter");
    await expect.element(tray("unassigned")).not.toMatchTextContent("Asignar");
  });

  it("a hunter reads what they said they cannot do, and it does not offer the window", async () => {
    const mine = { ...CANNOT, hunter_id: ME };
    await openAgenda({ cannotAttend: [mine] }, { role: "hunter" });
    await expect.element(tray("reassign-requests")).not.toBeInTheDocument();
  });
});

function person(id: string, nombre: string, proximo: string, contacto: string | null = null) {
  return aPerson({ id, gestion_id: "the-list", nombre, proximo, contacto, estado: "prospecto" });
}

function peopleAnswer(people: readonly object[]): Answer {
  return ({ query }) => (query.has("proximo") ? jsonResponse(people) : jsonResponse([]));
}

function hunterCloud(people: readonly object[]): CommercialCloud {
  return { role: "hunter", tables: { gestion_prospectos: peopleAnswer(people) } };
}

describe("Para contactar", () => {
  const ACTION_OF_LIST = anAction({
    id: "the-list",
    empresa: "LISTA SA",
    tipo: "datos",
    hunter_id: ME,
  });
  const LATE = person("late", "Ana Atrasada", addDays(today(), -2), "11 5555-0000");
  const NOW = person("now", "Beto Hoy", today());

  it("shows who, of which company, and since when", async () => {
    await openAgenda({ dataLists: [ACTION_OF_LIST] }, hunterCloud([LATE, NOW]));

    await expect.element(tray("contact")).toMatchTextContent("Para contactar (2)");
    await expect.element(tray("contact")).toMatchTextContent("Ana Atrasada");
    await expect.element(tray("contact")).toMatchTextContent("LISTA SA · 11 5555-0000 · desde el");
    await expect
      .element(tray("contact").getByRole("button", { name: /Beto Hoy/ }))
      .not.toMatchTextContent("desde el");
  });

  it("with six or less there is no window to open", async () => {
    await openAgenda({ dataLists: [ACTION_OF_LIST] }, hunterCloud([LATE, NOW]));
    await expect
      .element(tray("contact").getByRole("button", { name: /Ver todas/ }))
      .not.toBeInTheDocument();
  });

  it("touching one opens its action, with that person marked", async () => {
    await openAgenda(
      { dataLists: [ACTION_OF_LIST] },
      {
        ...hunterCloud([LATE, NOW]),
        tables: {
          gestion_prospectos: (request) =>
            request.query.has("proximo") ? jsonResponse([LATE, NOW]) : jsonResponse([LATE, NOW]),
        },
      },
    );

    await tray("contact")
      .getByRole("button", { name: /Beto Hoy/ })
      .click();

    await expect.element(detail()).toHaveAttribute("data-action-id", "the-list");
    await expect
      .element(page.getByTestId("person-row").filter({ hasText: "Beto Hoy" }))
      .toHaveAttribute("data-highlighted", "true");
  });

  describe("with more than six", () => {
    const MANY = [
      LATE,
      ...Array.from({ length: 6 }, (_, index) =>
        person(`p${String(index)}`, `Persona ${String(index)}`, today()),
      ),
    ];

    async function openAll() {
      await openAgenda({ dataLists: [ACTION_OF_LIST] }, hunterCloud(MANY));
      await tray("contact").getByRole("button", { name: "Ver todas (7)" }).click();
    }

    it("the window sets those left behind apart", async () => {
      await openAll();

      await expect.element(windowOf()).toMatchTextContent("Para contactar");
      await expect
        .element(windowOf())
        .toMatchTextContent("Vencidas (1)tenían fecha anterior a hoy");
      await expect.element(windowOf()).toMatchTextContent("Hoy (6)les toca hoy");
      await expect.element(windowOf()).not.toMatchTextContent("Son muchas");
    });

    it("closes, and the agenda is there", async () => {
      await openAll();
      await page.getByTestId("window-dismiss").click();
      await expect.element(windowOf()).not.toBeInTheDocument();
      await expect.element(agenda()).toBeVisible();
    });

    it("touching one closes it, and goes to that person", async () => {
      await openAll();

      await windowOf()
        .getByRole("button", { name: /Ana Atrasada/ })
        .click();

      await expect.element(windowOf()).not.toBeInTheDocument();
      await expect.element(detail()).toHaveAttribute("data-action-id", "the-list");
    });
  });

  it("at the limit it says that only the first show", async () => {
    const limit = Array.from({ length: 1000 }, (_, index) =>
      person(`p${String(index)}`, `Persona ${String(index)}`, today()),
    );
    await openAgenda({ dataLists: [ACTION_OF_LIST] }, hunterCloud(limit));
    await tray("contact")
      .getByRole("button", { name: /Ver todas/ })
      .click();
    await expect
      .element(windowOf())
      .toMatchTextContent("Son muchas: se muestran las primeras 1.000.");
  });

  it("a person of an action it did not list asks for its company", async () => {
    const other = aPerson({ id: "o", gestion_id: "elsewhere", nombre: "Otra", proximo: today() });
    const opened = await openAgenda(
      { period: [] },
      {
        ...hunterCloud([other]),
      },
    );
    await expect.element(tray("contact")).toMatchTextContent("Otra");
    expect(
      opened.harness.network
        .to("/rest/v1/gestiones", "GET")
        .some(({ query }) => query.get("id") === "in.(elsewhere)"),
    ).toBe(true);
  });
});

describe("coming back from an action", () => {
  it("reads the agenda again: it may have changed", async () => {
    localStorage.setItem("fg_ges_agver", "sem");
    const opened = await openAgenda({ period: [OWN] }, officerWithOccupancy([]));
    await agenda().getByRole("combobox", { name: "Agenda de" }).selectOptions("h1");
    await blocks().filter({ hasText: "ALIMENTOS SA" }).click();
    await expect.element(detail()).toBeVisible();
    const before = reads(opened).length;

    await page.getByTestId("action-back").click();

    await expect.element(agenda()).toBeVisible();
    await vi.waitFor(() => {
      expect(reads(opened).length).toBeGreaterThan(before);
    });
  });

  it("going to another solapa and back does not read it again", async () => {
    const opened = await openAgenda({ period: [OWN] }, { ...officerWithOccupancy([]), list: [] });
    const before = reads(opened).length;

    await tab("Gestiones").click();
    await expect.element(page.getByTestId("actions-list")).toBeVisible();
    await tab("Agenda").click();
    await expect.element(agenda()).toBeVisible();

    expect(reads(opened).length).toBe(before);
  });
});
