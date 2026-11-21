import { describe, expect, it } from "vitest";
import { aListedAction, administrator, hunter, leader, officer } from "../testing/fixtures.ts";
import {
  asksForAttention,
  filterActions,
  hasFilters,
  hunterFilterIds,
  isNew,
  type ListFilters,
  NO_FILTERS,
  NO_HUNTER,
  repetitionText,
  stateChoices,
  type UnreadByAction,
  whenText,
} from "./action-list.ts";

const NONE: UnreadByAction = new Map();
const ids = (filters: Partial<ListFilters>, rows: Parameters<typeof filterActions>[1]) =>
  filterActions(officer, rows, { ...NO_FILTERS, ...filters }, NONE).map(({ id }) => id);

const ROWS = [
  aListedAction({ id: "a", empresa: "ALIMENTOS SA", cuit: "30900001118", fecha: "2026-11-10" }),
  aListedAction({
    id: "b",
    empresa: "TEXTIL SA",
    cuit: null,
    hunter_id: null,
    lider_id: "l1",
    estado: "planificada",
    fecha: "2026-11-20",
  }),
  aListedAction({
    id: "c",
    empresa: "CLINICA SA",
    cuit: null,
    tipo: "datos",
    estado: "realizada",
    hunter_id: "h2",
    fecha: "2026-11-01",
    vence: "2026-12-15",
  }),
  aListedAction({
    id: "d",
    empresa: "METALURGICA SA",
    cuit: null,
    no_puede_at: "2026-11-02",
    hunter_id: "h2",
    fecha: "2026-11-15",
  }),
];

describe("the filters of the list", () => {
  it("know whether there is one", () => {
    expect.soft(hasFilters(NO_FILTERS)).toBe(false);
    expect.soft(hasFilters({ ...NO_FILTERS, type: "feria" })).toBe(true);
  });

  it("by state", () => {
    expect.soft(ids({ state: "realizada" }, ROWS)).toEqual(["c"]);
    expect.soft(ids({ state: "por_asignar" }, ROWS)).toEqual(["b"]);
    expect.soft(ids({ state: "no_puede" }, ROWS)).toEqual(["d"]);
    expect.soft(ids({ state: "datos" }, ROWS)).toEqual(["c"]);
  });

  it("what was done is not pending, even with no hunter or having warned", () => {
    const done = [
      aListedAction({ id: "x", estado: "realizada", hunter_id: null }),
      aListedAction({ id: "y", estado: "realizada", no_puede_at: "2026-11-02" }),
    ];
    expect.soft(ids({ state: "por_asignar" }, done)).toEqual([]);
    expect.soft(ids({ state: "no_puede" }, done)).toEqual([]);
  });

  it("by type and by hunter", () => {
    expect.soft(ids({ type: "datos" }, ROWS)).toEqual(["c"]);
    expect.soft(ids({ hunter: "h2" }, ROWS)).toEqual(["c", "d"]);
    expect.soft(ids({ hunter: NO_HUNTER }, ROWS)).toEqual(["b"]);
  });

  it("by date, a data list by the span it covers", () => {
    expect
      .soft(ids({ from: "2026-11-16" }, ROWS), "until the 15th of the next month")
      .toEqual(["b", "c"]);
    expect.soft(ids({ until: "2026-11-09" }, ROWS)).toEqual(["c"]);
  });

  it("by text: company, person, or part of a CUIT", () => {
    expect.soft(ids({ search: "alimentos" }, ROWS)).toEqual(["a"]);
    expect.soft(ids({ search: "Tomás" }, ROWS)).toEqual(["c", "d"]);
    expect.soft(ids({ search: "9000011" }, ROWS)).toEqual(["a"]);
    expect.soft(ids({ search: "900" }, ROWS), "fewer than 4 digits is not a CUIT").toEqual([]);
  });
});

describe("what asks for attention", () => {
  const forHunter = aListedAction({ id: "n", visto_hunter: false });

  it("is new for the hunter until opened, and for the owner when it changed", () => {
    expect.soft(isNew(hunter, forHunter)).toBe(true);
    expect.soft(isNew(officer, forHunter)).toBe(false);
    expect.soft(isNew(officer, aListedAction({ visto_dueno: false }))).toBe(true);
    expect.soft(isNew(hunter, aListedAction({ visto_dueno: false }))).toBe(false);
  });

  it("also messages not read", () => {
    const unread: UnreadByAction = new Map([["m", { gestion_id: "m", n: 1 }]]);
    expect.soft(asksForAttention(officer, aListedAction({ id: "m" }), unread)).toBe(true);
    expect.soft(asksForAttention(officer, aListedAction({ id: "z" }), unread)).toBe(false);
  });

  it("goes first", () => {
    const rows = [aListedAction({ id: "old" }), aListedAction({ id: "new", visto_dueno: false })];
    expect(filterActions(officer, rows, NO_FILTERS, NONE).map(({ id }) => id)).toEqual([
      "new",
      "old",
    ]);
  });
});

const labels = (role: string) => stateChoices(role).map(({ label }) => label);

describe("what the filters offer", () => {
  it("a hunter has no states of the team", () => {
    expect.soft(labels("hunter")).not.toContain("Por asignar");
    expect.soft(labels("vip")).toContain("Pidieron que se la pasen a otro");
  });

  it("the hunters: the leader, the team plus who has something on the list", () => {
    const rows = [aListedAction({ hunter_id: "h9" })];
    expect.soft(hunterFilterIds(leader, [])).toEqual(["h1", "h2"]);
    expect.soft(hunterFilterIds(leader, rows)).toEqual(["h1", "h2", "h9"]);
    expect.soft(hunterFilterIds(officer, [])).toEqual(["h9", "h1", "h2"]);
    expect.soft(hunterFilterIds(administrator, [])).toHaveLength(3);
  });
});

describe("what a row says", () => {
  it("the day, the time, the place and how it repeats", () => {
    expect(
      whenText(
        aListedAction({
          tipo: "feria",
          fecha: "2026-11-10",
          lugar: "Sede",
          frecuencia: "repite",
          cada_dias: 7,
          veces: 3,
          vez: 2,
        }),
      ),
    ).toBe("Feria presencial · 10 nov 10:00–12:00 · Sede · Cada 7 días · vez 2 de 3");
  });

  it("a data list goes from and until", () => {
    const list = aListedAction({ tipo: "datos", fecha: "2026-11-10", vence: "2026-12-01" });
    expect.soft(whenText(list)).toBe("Base de datos · desde el 10 nov hasta el 1 dic");
    expect.soft(whenText({ ...list, vence: null })).toBe("Base de datos · desde el 10 nov");
  });

  it("without a time it says only the day", () => {
    expect(whenText(aListedAction({ hora_desde: null, hora_hasta: null }))).toBe(
      "Acción presencial · 10 nov",
    );
  });

  it.each([
    [{ frecuencia: "unica", cada_dias: null, veces: null, vez: null }, ""],
    [{ frecuencia: "repite", cada_dias: null, veces: null, vez: null }, "Cada ? días"],
    [{ frecuencia: "repite", cada_dias: 7, veces: null, vez: 3 }, "Cada 7 días · vez 3"],
    [{ frecuencia: "repite", cada_dias: 7, veces: null, vez: 1 }, "Cada 7 días"],
    [{ frecuencia: "repite", cada_dias: 7, veces: 2, vez: null }, "Cada 7 días · vez 1 de 2"],
  ])("%j: %j", (fields, text) => {
    expect(repetitionText(fields)).toBe(text);
  });
});
