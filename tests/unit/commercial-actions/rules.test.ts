// Replaces pruebas/u05_gestiones_v2.mjs.
import { beforeEach, describe, expect, it } from "vitest";
import {
  chainableQuery,
  type CommercialActionsScript,
  loadCommercialActionsScript,
  passingSteps,
  type QueryResult,
  type Row,
  type ScriptHarness,
} from "../support/commercial-actions-script.ts";

const TEAM = {
  h1: { nombre: "Sofía Paz", rol: "hunter", lider_id: "l1" },
  h2: { nombre: "Tomás Ríos", rol: "hunter", lider_id: "l1" },
  h9: { nombre: "Otro Hunter", rol: "hunter", lider_id: "l9" },
  l1: { nombre: "Laura Méndez", rol: "lider" },
  l9: { nombre: "Otra Líder", rol: "lider" },
  o1: { nombre: "Mariana Costa", rol: "vip", lider_id: "l1" },
  a1: { nombre: "Admin", rol: "admin" },
};

const FORWARDED = {
  id: "g1",
  origen: "derivada",
  creada_por: "o1",
  dueno_id: "o1",
  hunter_id: "h1",
  estado: "planificada",
  lider_id: null,
};

let harness: ScriptHarness;
let script: CommercialActionsScript;

beforeEach(() => {
  harness = loadCommercialActionsScript();
  ({ script } = harness);
  harness.signInAs("vip", "o1");
  script.GES.personas = TEAM;
});

describe("CUIL or reference", () => {
  it.each([
    ["20-12345678-6", { cuil: "20123456786" }],
    ["Legajo 302", { referencia: "Legajo 302" }],
    ["30123456", { referencia: "30123456" }],
    ["", {}],
  ])("reads %j", (text, expected) => {
    expect(script.gesCuilORef(text)).toEqual(expected);
  });

  it("warns about 11 digits that are not a valid CUIL", () => {
    expect(script.gesCuilORef("20-12345678-0").error).toMatch(/no es válido/);
  });

  it.each([
    ["30900001118,30712345678", "CUIT 30-90000111-8 · 30-71234567-8"],
    [["30900001118"], "CUIT 30-90000111-8"],
    [null, ""],
  ])("writes the CUIT of the company %j with dashes", (value, expected) => {
    expect(script.gesCuitTxt(value)).toBe(expected);
  });
});

describe("the pasted list of a data list", () => {
  it("without titles: one person per line, in any order of columns", () => {
    const rows = script.gesPersonasParse(
      "Ana Pérez\t11 5555-1234\tLegajo 302\nramon@mail.com\tRamón Díaz\t27-11111111-7\nCarla Funes\nsólo un número\t\n\t11 4444-0000",
      false,
      [],
    );

    expect.soft(rows, "one person per line").toHaveLength(5);
    expect.soft(rows[0], "name, phone and reference in any order").toMatchObject({
      ok: true,
      nombre: "Ana Pérez",
      contacto: "11 5555-1234",
      referencia: "Legajo 302",
    });
    expect.soft(rows[1], "an email is a contact and 11 digits are a CUIL").toMatchObject({
      ok: true,
      nombre: "Ramón Díaz",
      contacto: "ramon@mail.com",
      cuil: "27111111117",
    });
    expect.soft(rows[2], "the name is enough").toMatchObject({ ok: true, nombre: "Carla Funes" });
    expect.soft(rows[2]?.contacto, "the name is enough").toBeFalsy();
    expect
      .soft(rows[4], "no name: with problems")
      .toMatchObject({ ok: false, motivo: "sin nombre" });
  });

  it("with titles: each column by its title, and an empty name stays empty", () => {
    const rows = script.gesPersonasParse(
      "Apellido y nombre\tCelular\tLegajo\nPaz, Inés\t1155551234\t1200\n\t11 2222-3333\tSector B",
      false,
      [],
    );

    expect.soft(rows, "the row of titles is skipped").toHaveLength(2);
    expect.soft(rows[0], "a short file number is a reference").toMatchObject({
      ok: true,
      nombre: "Paz, Inés",
      contacto: "1155551234",
      referencia: "1200",
    });
    expect
      .soft(rows[1], "another column does not become the name")
      .toMatchObject({ ok: false, motivo: "sin nombre", referencia: "Sector B" });
  });

  it("does not repeat a CUIL within the same list", () => {
    const rows = script.gesPersonasParse(
      "Juan Gil\t20-12345678-6\nPedro Ruiz\t20-12345678-6",
      false,
      [{ cuil: "27111111117" }],
    );

    expect.soft(rows[0]?.ok).toBe(true);
    expect.soft(rows[1]?.ok).toBe(false);
    expect.soft(rows[1]?.motivo).toMatch(/ya est/);
  });

  it("does not take a CUIL that was already there", () => {
    const rows = script.gesPersonasParse("Ana\t27-11111111-7", false, [{ cuil: "27111111117" }]);

    expect(rows[0]?.motivo).toBe("ya está en la lista");
  });
});

describe("what is missing to forward or assign", () => {
  it("asks to choose when there is no hunter nor leader", () => {
    expect(script.gesAsigError({ tipo: "accion", hunter_id: "", lider_id: null })).toMatch(
      /Elegí el hunter/,
    );
  });

  it("requires the time when a hunter is chosen", () => {
    expect(script.gesAsigError({ tipo: "accion", hunter_id: "h1", hora_desde: null })).toMatch(
      /Poné el horario/,
    );
  });

  it("lets the time wait for the leader who will assign it", () => {
    expect(
      script.gesAsigError({ tipo: "accion", hunter_id: null, lider_id: "l1", hora_desde: null }),
    ).toBeNull();
  });

  it('takes a data list without a time, but "hasta" cannot come before "desde"', () => {
    expect
      .soft(
        script.gesAsigError({
          tipo: "datos",
          hunter_id: "h1",
          hora_desde: null,
          fecha: "2026-11-01",
          vence: "2026-11-20",
        }),
      )
      .toBeNull();
    expect
      .soft(
        script.gesAsigError({
          tipo: "datos",
          hunter_id: "h1",
          fecha: "2026-11-20",
          vence: "2026-11-01",
        }),
      )
      .toMatch(/después/);
  });
});

describe("who changes the hunter and who forces a time", () => {
  it("the officer who forwarded it, while it is not done", () => {
    harness.signInAs("vip", "o1");

    expect.soft(script.gesPuedeReasignar(FORWARDED)).toBe(true);
    expect.soft(script.gesPuedeReasignar({ ...FORWARDED, estado: "realizada" })).toBe(false);
  });

  it("the hunter never, not even on what the hunter registered", () => {
    harness.signInAs("hunter", "h1");

    expect.soft(script.gesPuedeReasignar(FORWARDED)).toBe(false);
    expect
      .soft(script.gesPuedeReasignar({ ...FORWARDED, origen: "propia", creada_por: "h1" }))
      .toBe(false);
  });

  it("the leader, on the team and on what was sent to assign", () => {
    harness.signInAs("lider", "l1");

    expect.soft(script.gesPuedeReasignar(FORWARDED)).toBe(true);
    expect
      .soft(script.gesPuedeReasignar({ ...FORWARDED, hunter_id: null, lider_id: "l1" }))
      .toBe(true);
  });

  it("not another leader", () => {
    harness.signInAs("lider", "l9");

    expect(script.gesPuedeReasignar(FORWARDED)).toBe(false);
  });

  it("the administrator always", () => {
    harness.signInAs("admin", "a1", true);

    expect(script.gesPuedeReasignar({ ...FORWARDED, estado: "realizada" })).toBe(true);
  });

  it("the leader can save over an overlap only on the team", () => {
    harness.signInAs("lider", "l1");

    expect.soft(script.gesPuedeForzar("h1")).toBe(true);
    expect.soft(script.gesPuedeForzar("h9")).toBe(false);
  });

  it("the officer cannot save over an overlap", () => {
    harness.signInAs("vip", "o1");

    expect(script.gesPuedeForzar("h1")).toBe(false);
  });

  it("the officer can send it to a leader, their own first", () => {
    expect.soft(script.gesPuedeAlLider()).toBe(true);
    expect
      .soft(script.gesLideresOpts().indexOf("Laura"))
      .toBeLessThan(script.gesLideresOpts().indexOf("Otra"));
  });
});

describe("a time that overlaps", () => {
  const ATTEMPT = {
    fecha: "2026-10-29",
    hora_desde: "16:00",
    hora_hasta: "18:00",
    tipo: "accion",
  };

  beforeEach(() => {
    harness.rpc.gestiones_ocupado = () => [
      { id: "x", hora_desde: "15:00:00", hora_hasta: "17:00:00", tipo: "posicion", empresa: null },
    ];
  });

  it("stops an officer and says with what it overlaps", async () => {
    harness.signInAs("vip", "o1");

    const saved = await script.gesChoque("h1", ATTEMPT);

    expect.soft(saved).toBe(false);
    expect.soft(harness.confirmations).toHaveLength(0);
    expect.soft(harness.toasts[0]).toMatch(/Sofía Paz ya tiene algo a esa hora/);
  });

  it("asks the leader, who can save anyway", async () => {
    harness.signInAs("lider", "l1");

    const saved = await script.gesChoque("h1", ATTEMPT);

    expect.soft(saved).toBe(true);
    expect.soft(harness.confirmations).toHaveLength(1);
    expect.soft(harness.confirmations[0]).toMatch(/Guardar igual/);
  });

  it("does not stop a data list or a time that does not cross", async () => {
    expect.soft(await script.gesChoque("h1", { ...ATTEMPT, tipo: "datos" })).toBe(true);
    expect
      .soft(await script.gesChoque("h1", { ...ATTEMPT, hora_desde: "17:00", hora_hasta: "18:00" }))
      .toBe(true);
  });

  it("offers as free at that time those with nothing that crosses", async () => {
    harness.rpc.gestiones_dia = () => [
      { hunter_id: "h1", hora_desde: "15:00:00", hora_hasta: "17:00:00" },
      { hunter_id: "h9", hora_desde: "16:30:00", hora_hasta: null },
    ];

    const free = await script.gesLibres("2026-10-29", "16:00", "18:00", "h1");

    expect([...free]).toEqual(["h2"]);
  });
});

describe("with or without a package, reasons and texts", () => {
  it("counts signups with a package, without one and not loaded", () => {
    expect(
      script.gesConSin([
        { paquete: "plus", altas: 3 },
        { paquete: "caja", altas: 2 },
        { paquete: null, altas: 1 },
      ]),
    ).toEqual({ con: 3, sin: 2, nada: 1 });
  });

  it("writes under each hunter which packages and how many without", () => {
    expect
      .soft(script.gesPaqTxt({ plus: 2, gold: 1, caja: 1 }))
      .toBe("3 con paquete (2 Plus &middot; 1 Plus Gold) &middot; 1 sin paquete");
    expect.soft(script.gesPaqTxt({})).toBe("");
  });

  it("sums up the signups of an action", () => {
    expect
      .soft(
        script.gesPaqResumen([
          { estado: "alta", paquete: "plus" },
          { estado: "alta", paquete: "caja" },
          { estado: "prospecto" },
        ]),
      )
      .toMatch(/con paquete/);
    expect
      .soft(script.gesPaqResumen([{ estado: "alta", paquete: "caja" }]))
      .toMatch(/1 sin paquete/);
  });

  it("has five reasons for discarding", () => {
    expect.soft(script.GES_MOTIVO.ya_galicia).toBe("Ya cobra en Galicia");
    expect.soft(Object.keys(script.GES_MOTIVO)).toHaveLength(5);
  });

  it("tells the refusals of the database in Spanish", () => {
    const overlap = { message: "GES_PISA: ese hunter ya tiene algo de 15:00 a 17:00 ese día" };

    expect.soft(script.gesErrTxt(overlap)).toMatch(/se pisa con otra acción/);
    expect.soft(script.gesErrTxt(overlap)).toMatch(/15:00 a 17:00/);
    expect.soft(script.gesErrTxt({ message: "GES_PAQ: x" })).toMatch(/paquete/);
  });

  it("tells in the history who passed it from whom to whom", () => {
    expect(script.gesEvTxt({ que: "hunter", quien: "l1", detalle: { de: "h2", a: "h1" } })).toBe(
      "Laura Méndez se la pasó de Tomás Ríos a Sofía Paz.",
    );
  });

  it("tells in the history signups with a package and discards with a reason", () => {
    expect
      .soft(
        script.gesEvTxt({ que: "alta", quien: "h1", detalle: { nombre: "Ana", paquete: "caja" } }),
      )
      .toBe("Sofía Paz marcó el alta de Ana (Sin paquete).");
    expect
      .soft(
        script.gesEvTxt({
          que: "descarte",
          quien: "h1",
          detalle: { nombre: "Ana", motivo: "no_contesta" },
        }),
      )
      .toMatch(/No contesta/);
  });

  it('tells in the history "la mandó al equipo para que la asigne…"', () => {
    expect(script.gesEvTxt({ que: "por_asignar", quien: "o1", detalle: { lider: "l1" } })).toMatch(
      /mandó al equipo para que la asigne Laura/,
    );
  });
});

function createSeries(action: Row): Promise<{ created: number; failed: Row[] }> {
  return new Promise((resolve) => {
    script.gesCrearSerie(action, (created, failed) => {
      resolve({ created, failed });
    });
  });
}

describe("a series that repeats is created one date at a time", () => {
  const OVERLAPPING_DATE = "2026-11-12";
  const inserted: Row[] = [];

  beforeEach(() => {
    inserted.length = 0;
    harness.answerQueriesWith(() => {
      let row: Row = {};
      return chainableQuery(
        () =>
          row.fecha === OVERLAPPING_DATE
            ? { error: { message: "GES_PISA: ese hunter ya tiene algo de 10:00 a 12:00 ese día" } }
            : { data: { id: "x" } },
        {
          ...passingSteps("select", "single"),
          insert: (body: Row) => {
            row = body;
            inserted.push(body);
          },
        },
      );
    });
  });

  it("creates the others when one date clashes and says which one is missing", async () => {
    const { created, failed } = await createSeries({
      frecuencia: "repite",
      veces: 4,
      cada_dias: 7,
      fecha: "2026-11-05",
      origen: "derivada",
      hunter_id: "h1",
      dueno_id: "o1",
      empresa: "ACME",
      tipo: "feria",
      serie_id: "s1",
      hora_desde: "10:00",
    });

    expect.soft(inserted).toHaveLength(3);
    expect.soft(created).toBe(2);
    expect.soft(failed).toHaveLength(1);
    expect.soft(harness.toasts[0]).toMatch(/Se crearon 3 de 4 fechas/);
    expect.soft(harness.toasts[0]).toMatch(/12 nov/);
    expect.soft(harness.toasts[0]).toMatch(/se pisa/);
  });

  it("carries the leader on every date of a series for the leader to assign", async () => {
    await createSeries({
      frecuencia: "repite",
      veces: 2,
      cada_dias: 7,
      fecha: "2026-11-06",
      origen: "derivada",
      hunter_id: null,
      lider_id: "l1",
      dueno_id: "o1",
      empresa: "ACME",
      tipo: "feria",
      serie_id: "s2",
    });

    expect.soft(inserted).toHaveLength(1);
    expect.soft(inserted[0]?.lider_id).toBe("l1");
    expect.soft(inserted[0]?.hunter_id).toBeNull();
  });
});

describe("which period of the agenda is asked for", () => {
  it("on a week, the seven days from Monday", () => {
    script.GES.ag.ver = "sem";
    script.GES.ag.lunes = "2026-11-02";

    expect(script.gesAgRangoAct()).toMatchObject({ desde: "2026-11-02", hasta: "2026-11-08" });
  });

  it("on a month, from the first to the last day", () => {
    script.GES.ag.ver = "mes";
    script.GES.ag.mes = "2026-11";

    expect(script.gesAgRangoAct()).toMatchObject({ desde: "2026-11-01", hasta: "2026-11-30" });
  });

  it.each([
    ["2026-02", "2026-02-28"],
    ["2024-02", "2024-02-29"],
  ])("ends February %s on %s", (month, lastDay) => {
    script.GES.ag.ver = "mes";
    script.GES.ag.mes = month;

    expect(script.gesAgRangoAct().hasta).toBe(lastDay);
  });

  it("the arrow of the month changes the year", () => {
    expect.soft(script.gesMesSumar("2026-12", 1)).toBe("2027-01");
    expect.soft(script.gesMesSumar("2026-01", -1)).toBe("2025-12");
  });

  it("the label of the month has a capital and the year", () => {
    script.GES.ag.ver = "mes";
    script.GES.ag.mes = "2024-02";

    expect(script.gesAgTitulo([])).toBe("Febrero 2024");
  });

  it("counts the days between two dates, 0 if one is missing", () => {
    expect.soft(script.gesDias("2026-11-02", "2026-11-09")).toBe(7);
    expect.soft(script.gesDias("2026-11-09", "2026-11-02")).toBe(-7);
    expect.soft(script.gesDias(null, "2026-11-02")).toBe(0);
  });
});

describe("who is asked for the masked occupation", () => {
  it.each([
    ["hunter", false, false],
    ["vip", false, true],
    ["asesor", false, true],
    ["pro", false, true],
    ["lider", false, false],
    ["admin", true, false],
  ])("role %s (admin: %s) is asked: %s", (role, admin, asked) => {
    harness.signInAs(role, "o1", admin);

    expect(script.gesAgPideOcup()).toBe(asked);
  });
});

describe("the agenda by hours", () => {
  it("goes from 8 to 18 with nothing in it", () => {
    expect([...script.gesHorRango([])]).toEqual([8, 18]);
  });

  it("stretches so that nothing is hidden", () => {
    expect([
      ...script.gesHorRango([
        { hora_desde: "07:30:00", hora_hasta: "09:00:00" },
        { hora_desde: "19:00:00", hora_hasta: "20:30:00" },
      ]),
    ]).toEqual([7, 21]);
  });

  it('counts one hour without "hasta", which still fits the band', () => {
    expect([...script.gesHorRango([{ hora_desde: "10:00:00", hora_hasta: null }])]).toEqual([
      8, 18,
    ]);
  });

  it("puts two actions that overlap side by side", () => {
    const [first, second] = script.gesHorColumnas([
      { hora_desde: "10:00", hora_hasta: "12:00" },
      { hora_desde: "11:00", hora_hasta: "13:00" },
    ]);

    expect.soft(first?.n).toBe(2);
    expect.soft(second?.n).toBe(2);
    expect.soft(first?.col).not.toBe(second?.col);
  });

  it("gives each action the whole width when they do not overlap", () => {
    const columns = script.gesHorColumnas([
      { hora_desde: "09:00", hora_hasta: "10:00" },
      { hora_desde: "11:00", hora_hasta: "12:00" },
    ]);

    expect.soft(columns).toHaveLength(2);
    expect.soft(columns[0]?.n).toBe(1);
    expect.soft(columns[1]?.n).toBe(1);
  });

  it("leaves out of the grid what has no time", () => {
    expect(script.gesHorColumnas([{ hora_desde: null, hora_hasta: null }])).toHaveLength(0);
  });

  it("writes hours with two digits", () => {
    expect.soft(script.gesHorHHMM(630)).toBe("10:30");
    expect.soft(script.gesHorEtiqueta(9)).toBe("09:00");
  });

  const BLOCK = { id: "y", hora_desde: "10:00", hora_hasta: "12:00", estado: "planificada" };

  it("marks a time taken with another company and does not open it", () => {
    const html = script.gesHorCol(
      "2026-11-02",
      [{ ...BLOCK, id: "x", empresa: null, _tapado: true }],
      8,
      18,
      null,
      null,
    );

    expect.soft(html).toMatch(/tapado/);
    expect.soft(html).toMatch(/Ocupado/);
    expect.soft(html).not.toMatch(/<button/);
  });

  it("shows what is one's own with its company, and it opens", () => {
    const html = script.gesHorCol(
      "2026-11-02",
      [{ ...BLOCK, empresa: "ACME SA" }],
      8,
      18,
      null,
      null,
    );

    expect.soft(html).toMatch(/<button/);
    expect.soft(html).toMatch(/ACME SA/);
  });

  it("makes the blocks of the side panel only for looking", () => {
    const html = script.gesHorCol(
      "2026-11-02",
      [{ ...BLOCK, empresa: "ACME SA" }],
      8,
      18,
      null,
      null,
      true,
    );

    expect(html).not.toMatch(/<button/);
  });

  it('draws "Ocupado" with the time, no company, and it is not a button', () => {
    const html = script.gesAgOcupado({ hora_desde: "10:00", hora_hasta: "12:00", empresa: null });

    expect.soft(html).toMatch(/Ocupado/);
    expect.soft(html).toMatch(/10–12/);
    expect.soft(html).not.toMatch(/<button/);
    expect.soft(html).not.toMatch(/onclick/);
  });
});

describe("going to another week and coming right back", () => {
  it("shows the week already loaded, and the late answer does not overwrite it", async () => {
    const waiting: ((result: QueryResult) => void)[] = [];
    harness.answerQueriesWith(() =>
      chainableQuery(
        () =>
          new Promise<QueryResult>((resolve) => {
            waiting.push(resolve);
          }),
        passingSteps("select", "gte", "lte", "order", "limit", "eq", "is", "not", "in"),
      ),
    );
    // The memory of the agenda goes by range.
    script.GES.ag = {
      ver: "sem",
      lunes: "2026-11-02",
      mes: "2026-11",
      dia: null,
      data: [{ id: "vieja", fecha: "2026-11-02", tipo: "accion", hunter_id: "h1" }],
      dataL: "2026-11-02|2026-11-08",
      ocup: null,
      hun: "",
      turno: 0,
    };

    script.GES.ag.lunes = "2026-11-09";
    void script.gesAgCargar();
    script.GES.ag.lunes = "2026-11-02";
    const shown = await script.gesAgCargar();

    expect.soft(shown?.[0]?.id, "the week loaded before shows at once").toBe("vieja");

    for (const answer of waiting) {
      answer({ data: [{ id: "otra", fecha: "2026-11-09", tipo: "accion", hunter_id: "h1" }] });
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect.soft(script.GES.ag.data?.[0]?.id, "the late answer does not overwrite it").toBe("vieja");
    expect.soft(script.GES.ag.dataL).toBe("2026-11-02|2026-11-08");
  });
});
