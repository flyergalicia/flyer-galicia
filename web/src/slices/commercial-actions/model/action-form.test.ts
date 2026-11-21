import { describe, expect, it } from "vitest";
import { anAction } from "../testing/fixtures.ts";
import {
  assignmentProblem,
  initialForm,
  nextDateOf,
  daysToNextDate,
  readForm,
  repetitionProblem,
  restOfSeries,
  TO_LEADER,
  typesFor,
} from "./action-form.ts";
import { ACTION_TYPES } from "./labels.ts";

const BLANK = initialForm();

describe("the types each window offers", () => {
  it("forwarding offers the four", () => {
    expect(typesFor("derivar", "accion")).toEqual(ACTION_TYPES);
  });

  it("registering does not offer a data list", () => {
    expect(Object.keys(typesFor("registrar", "accion"))).toEqual(["accion", "feria", "posicion"]);
  });

  it("editing a data list stays a data list, and an action never becomes one", () => {
    expect.soft(Object.keys(typesFor("editar", "datos"))).toEqual(["datos"]);
    expect.soft(Object.keys(typesFor("editar", "feria"))).toEqual(["accion", "feria", "posicion"]);
  });
});

describe("what the form starts with", () => {
  it("an action to edit, with its times without seconds", () => {
    const form = initialForm(anAction({ dotacion: 40, cada_dias: 7, frecuencia: "repite" }));

    expect.soft(form.desde).toBe("10:00");
    expect.soft(form.dotacion).toBe("40");
    expect.soft(form.cadaDias).toBe("7");
    expect.soft(form.frecuencia).toBe("repite");
  });

  it("is done by default, with no time", () => {
    expect.soft(BLANK.estado).toBe("realizada");
    expect.soft(BLANK.tipo).toBe("accion");
    expect.soft(BLANK.desde).toBe("");
  });
});

describe("what it reads", () => {
  it("forwarding to a hunter stays planned for that hunter", () => {
    const values = readForm({ ...BLANK, hunter: "h1", desde: "10:00", nota: " x " }, "derivar");

    expect.soft(values).toMatchObject({ estado: "planificada", hunter_id: "h1", nota: "x" });
    expect.soft(values.hora_desde).toBe("10:00");
    expect.soft(values.hora_hasta).toBeNull();
    expect.soft(values).not.toHaveProperty("dotacion");
  });

  it("leaving it to the leader carries the leader and no hunter", () => {
    const values = readForm({ ...BLANK, hunter: TO_LEADER, lider: "l1" }, "derivar");

    expect(values).toMatchObject({ hunter_id: null, lider_id: "l1", estado: "planificada" });
  });

  it("a data list has no time, place nor repetition, and goes from a distance", () => {
    const values = readForm(
      {
        ...BLANK,
        tipo: "datos",
        desde: "10:00",
        hasta: "11:00",
        lugar: "Sede",
        frecuencia: "repite",
        cadaDias: "7",
        vence: "2026-12-01",
        hunter: "h1",
      },
      "derivar",
    );

    expect(values).toMatchObject({
      modalidad: "virtual",
      hora_desde: null,
      hora_hasta: null,
      lugar: null,
      frecuencia: "unica",
      cada_dias: null,
      veces: null,
      vence: "2026-12-01",
    });
  });

  it("what is not a data list does not keep a date to work it until", () => {
    expect(readForm({ ...BLANK, vence: "2026-12-01" }, "editar").vence).toBeNull();
  });

  it("registering or editing reads the numbers of the result", () => {
    const values = readForm(
      { ...BLANK, estado: "cancelada", dotacion: "1.200", asistentes: "abc" },
      "registrar",
    );

    expect(values).toMatchObject({ estado: "cancelada", dotacion: 1200, asistentes: null });
    expect(readForm({ ...BLANK, dotacion: "99999999" }, "editar").dotacion).toBe(1_000_000);
  });

  it("a repetition reads how often and how many times", () => {
    const values = readForm(
      { ...BLANK, frecuencia: "repite", cadaDias: "15", veces: "3", hunter: "h1" },
      "derivar",
    );

    expect(values).toMatchObject({ frecuencia: "repite", cada_dias: 15, veces: 3 });
  });

  it("in a series already built the number of times is not read", () => {
    const values = readForm({ ...BLANK, frecuencia: "repite", cadaDias: "15" }, "editar", false);

    expect(values.veces).toBeUndefined();
  });

  it("with no repetition the numbers of it go empty", () => {
    expect(readForm({ ...BLANK, cadaDias: "7", veces: "3" }, "editar")).toMatchObject({
      cada_dias: null,
      veces: null,
      vez: null,
    });
  });

  it("with no date it is today", () => {
    expect(readForm({ ...BLANK, fecha: "" }, "editar").fecha).toBe(initialForm().fecha);
  });
});

const planned = (fields: object) => ({ ...readForm(BLANK, "derivar"), ...fields });

describe("what is missing to forward or assign", () => {
  it("asks to choose when there is no hunter nor leader", () => {
    expect(assignmentProblem(planned({ hunter_id: "", lider_id: null }))).toMatch(
      /Elegí el hunter/,
    );
  });

  it("requires the time when a hunter is chosen", () => {
    expect(assignmentProblem(planned({ hunter_id: "h1", hora_desde: null }))).toMatch(
      /Poné el horario/,
    );
  });

  it("lets the time wait for the leader who will assign it", () => {
    expect(
      assignmentProblem(planned({ hunter_id: null, lider_id: "l1", hora_desde: null })),
    ).toBeNull();
  });

  it('takes a data list without a time, but "hasta" cannot come before "desde"', () => {
    const list = { tipo: "datos", hunter_id: "h1", hora_desde: null, fecha: "2026-11-20" };
    expect.soft(assignmentProblem(planned({ ...list, vence: "2026-12-01" }))).toBeNull();
    expect.soft(assignmentProblem(planned({ ...list, vence: "2026-11-01" }))).toMatch(/después/);
  });
});

describe("a repetition", () => {
  it.each([
    [{ frecuencia: "unica", cada_dias: null }],
    [{ frecuencia: "repite", cada_dias: 7 }],
    [{ frecuencia: "repite", cada_dias: 7, veces: null }],
    [{ frecuencia: "repite", cada_dias: 7, veces: 24 }],
  ])("%j is right", (values) => {
    expect(repetitionProblem(values)).toBeNull();
  });

  it.each([
    [{ frecuencia: "repite", cada_dias: null }, /cada cuántos días/],
    [{ frecuencia: "repite", cada_dias: 0 }, /cada cuántos días/],
    [{ frecuencia: "repite", cada_dias: 366 }, /cada cuántos días/],
    [{ frecuencia: "repite", cada_dias: 7, veces: 1 }, /de 2 a 24/],
    [{ frecuencia: "repite", cada_dias: 7, veces: 25 }, /de 2 a 24/],
  ])("%j says %s", (values, expected) => {
    expect(repetitionProblem(values)).toMatch(expected);
  });
});

describe("a series", () => {
  const SERIES = anAction({
    frecuencia: "repite",
    veces: 3,
    cada_dias: 7,
    fecha: "2026-11-05",
    serie_id: "s1",
  });

  it("creates the other dates, in the same series and already planned", () => {
    const rest = restOfSeries(SERIES);

    expect.soft(rest.map(({ fecha }) => fecha)).toEqual(["2026-11-12", "2026-11-19"]);
    expect.soft(rest.map(({ vez }) => vez)).toEqual([2, 3]);
    expect
      .soft(rest.every(({ serie_id: id, estado }) => id === "s1" && estado === "planificada"))
      .toBe(true);
  });

  it("carries the leader on every date of a series for the leader to assign", () => {
    const [next] = restOfSeries({ ...SERIES, hunter_id: null, lider_id: "l1" });

    expect.soft(next?.lider_id).toBe("l1");
    expect.soft(next?.hunter_id).toBeNull();
  });

  it("with a hunter it does not carry the leader", () => {
    expect(restOfSeries({ ...SERIES, lider_id: "l1" })[0]).not.toHaveProperty("lider_id");
  });

  it("what is the hunter's own keeps only its owner", () => {
    const [next] = restOfSeries({ ...SERIES, origen: "propia" });

    expect.soft(next?.dueno_id).toBe("o1");
    expect.soft(next).not.toHaveProperty("hunter_id");
  });

  it("has nothing to create without a number of times, or with just one", () => {
    expect.soft(restOfSeries({ ...SERIES, veces: null })).toEqual([]);
    expect.soft(restOfSeries({ ...SERIES, veces: 1 })).toEqual([]);
    expect.soft(restOfSeries({ ...SERIES, frecuencia: "unica" })).toEqual([]);
  });
});

describe("an endless series", () => {
  const ENDLESS = anAction({
    frecuencia: "repite",
    veces: null,
    cada_dias: 7,
    estado: "realizada",
    fecha: "2026-11-05",
    vez: 2,
  });

  it("offers the next date only when one is done", () => {
    expect.soft(daysToNextDate(ENDLESS)).toBe(7);
    expect.soft(daysToNextDate({ ...ENDLESS, estado: "planificada" })).toBeNull();
    expect.soft(daysToNextDate({ ...ENDLESS, veces: 3 })).toBeNull();
    expect.soft(daysToNextDate({ ...ENDLESS, cada_dias: null })).toBeNull();
    expect.soft(daysToNextDate({ ...ENDLESS, frecuencia: "unica" })).toBeNull();
  });

  it("the officer who forwarded it keeps it for the same hunter", () => {
    const { action, hunter } = nextDateOf(ENDLESS, "o1");

    expect.soft(hunter).toBe("h1");
    expect.soft(action).toMatchObject({
      origen: "derivada",
      hunter_id: "h1",
      dueno_id: "o1",
      fecha: "2026-11-12",
      vez: 3,
      estado: "planificada",
    });
    expect.soft(action.nota).toBe("Repetición de la del 5 nov");
  });

  it("the hunter makes it theirs, and the owner stays", () => {
    const { action, hunter } = nextDateOf(ENDLESS, "h1");

    expect.soft(hunter).toBe("h1");
    expect.soft(action).toMatchObject({ origen: "propia", dueno_id: "o1" });
    expect.soft(action).not.toHaveProperty("hunter_id");
  });

  it("goes 30 days ahead without knowing how often", () => {
    expect(nextDateOf({ ...ENDLESS, cada_dias: null, vez: null }, "h1").action).toMatchObject({
      fecha: "2026-12-05",
      vez: 2,
      cada_dias: 30,
    });
  });
});
