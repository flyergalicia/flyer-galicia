// Replaces pruebas/u03_gestiones_agenda.mjs.
import { beforeEach, describe, expect, it } from "vitest";
import {
  type CommercialActionsScript,
  loadCommercialActionsScript,
  type Row,
  type ScriptHarness,
  settle,
} from "../support/commercial-actions-script.ts";

const TEAM = {
  h1: { nombre: "Sofía Pérez", rol: "hunter", lider_id: "l1" },
  h2: { nombre: "Tomás Gil", rol: "hunter", lider_id: "l1" },
  h3: { nombre: "Otra Persona", rol: "hunter", lider_id: "l9" },
  l1: { nombre: "Líder", rol: "lider" },
  o1: { nombre: "Oficial", rol: "vip" },
};

const WEEK_ROWS: Row[] = [
  {
    id: "a",
    empresa: "ACME SA",
    tipo: "posicion",
    modalidad: "presencial",
    fecha: "2026-10-20",
    hora_desde: "15:00:00",
    hora_hasta: "17:00:00",
    lugar: "Piso 3",
    estado: "planificada",
    hunter_id: "h1",
    visto_hunter: true,
  },
  {
    id: "b",
    empresa: "BETA SRL",
    tipo: "accion",
    modalidad: "presencial",
    fecha: "2026-10-20",
    hora_desde: "09:00:00",
    hora_hasta: "11:00:00",
    lugar: null,
    estado: "planificada",
    hunter_id: "h1",
    visto_hunter: false,
  },
  {
    id: "c",
    empresa: "GAMA SA",
    tipo: "feria",
    modalidad: "presencial",
    fecha: "2026-10-22",
    hora_desde: null,
    hora_hasta: null,
    estado: "cancelada",
    hunter_id: "h2",
    visto_hunter: true,
  },
  {
    id: "d",
    empresa: "DELTA SA",
    tipo: "posicion",
    modalidad: "presencial",
    fecha: "2026-10-23",
    hora_desde: "10:00:00",
    hora_hasta: "12:00:00",
    estado: "realizada",
    hunter_id: "h2",
    visto_hunter: true,
  },
];

const PASTED_AGENDA =
  "Fecha\tHorario\tEmpresa\tHunter\tLugar\n21/10\t10 a 12\tACME SA\tSofía\tPiso 3\nTomás Gil\tBETA SRL\t22/10\t9hs a 11hs\tFeria\nSin Fecha SA\tSofía\n23/10\tACME SA\tNadie Conocido\n24/10\t11 a 13\tOtra SA\tSofía Pérez";

const WEEK_MONDAY = "2026-10-19";

const span = (from: string | null, to: string | null) => ({ hora_desde: from, hora_hasta: to });

describe("reading pasted times and dates", () => {
  let script: CommercialActionsScript;

  beforeEach(() => {
    ({ script } = loadCommercialActionsScript());
  });

  it.each([
    ["10 a 12", ["10:00", "12:00"]],
    ["10:00-12:30", ["10:00", "12:30"]],
    ["9hs a 13hs", ["09:00", "13:00"]],
    ["9.30 – 13", ["09:30", "13:00"]],
    ["9hs", ["09:00", null]],
  ])("reads %j as a time range", (text, expected) => {
    expect(script.gesHorarioDe(text)).toEqual(expected);
  });

  it.each(["12 a 10", "10", "ACME"])("does not read %j as a time range", (text) => {
    expect(script.gesHorarioDe(text)).toBeNull();
  });

  it.each([
    ["21/10/2026", "2026-10-21"],
    ["mar 3/11/26", "2026-11-03"],
    ["2026-10-21", "2026-10-21"],
  ])("reads %j as a date", (text, expected) => {
    expect(script.gesFechaDe(text)).toBe(expected);
  });

  it("takes a date with no year as this year", () => {
    expect(script.gesFechaDe("21/10")).toBe(`${String(new Date().getFullYear())}-10-21`);
  });

  it.each(["31/02", "10-12", "ACME"])("does not read %j as a date", (text) => {
    expect(script.gesFechaDe(text)).toBeNull();
  });
});

describe("times that overlap", () => {
  let script: CommercialActionsScript;

  beforeEach(() => {
    ({ script } = loadCommercialActionsScript());
  });

  it("10-12 overlaps 11-13, but 10-12 does not overlap 12-13", () => {
    expect.soft(script.gesSePisan(span("10:00:00", "12:00:00"), span("11:00", "13:00"))).toBe(true);
    expect.soft(script.gesSePisan(span("10:00", "12:00"), span("12:00", "13:00"))).toBe(false);
  });

  it('without "hasta" it counts one hour; without a time it is not compared', () => {
    expect.soft(script.gesSePisan(span("10:00", null), span("10:30", "11:00"))).toBe(true);
    expect.soft(script.gesSePisan(span(null, null), span("10:00", "11:00"))).toBe(false);
  });

  it("warns about a missing start or an end before the start", () => {
    expect.soft(script.gesHorError(span(null, "12:00"))).toBeTruthy();
    expect.soft(script.gesHorError(span("12:00", "10:00"))).toBeTruthy();
    expect.soft(script.gesHorError(span("10:00", "12:00"))).toBeNull();
  });

  it('shows a time as "10:00–12:30" and the type Posición comercial exists', () => {
    expect.soft(script.gesHorario(span("10:00:00", "12:30:00"))).toBe("10:00–12:30");
    expect.soft(script.GES_TIPO.posicion).toBe("Posición comercial");
  });
});

describe("the agenda", () => {
  let harness: ScriptHarness;
  let script: CommercialActionsScript;
  const bodyHtml = () => harness.element("ges-body").innerHTML;

  beforeEach(() => {
    harness = loadCommercialActionsScript();
    ({ script } = harness);
    script.GES.personas = TEAM;
    harness.setTableRows(WEEK_ROWS);
    harness.element("ges-body");
    // The agenda only paints while that tab is being looked at, or it would cover another one.
    script.GES.tab = "agenda";
    script.GES.det = null;
    script.GES.ag.lunes = WEEK_MONDAY;
    script.gesModal = (html) => {
      harness.element("modal").innerHTML = html;
    };
    script.gesCerrar = () => undefined;
    script.gesPersonas = () => Promise.resolve(script.GES.personas);
  });

  it.each(["2026-10-21", "2026-10-25", "2026-10-19"])(
    "starts the week of %s on Monday the 19th",
    (date) => {
      expect(script.gesLunes(date)).toBe(WEEK_MONDAY);
    },
  );

  describe("of a hunter", () => {
    beforeEach(async () => {
      harness.signInAs("hunter", "h1");
      script.GES.ag.data = null;
      script.gesAgenda();
      await settle();
    });

    it("is sorted by time", () => {
      const html = bodyHtml();
      expect.soft(html.indexOf("BETA SRL")).toBeGreaterThan(0);
      expect.soft(html.indexOf("BETA SRL")).toBeLessThan(html.indexOf("ACME SA"));
    });

    it("shows only what is theirs", () => {
      expect.soft(bodyHtml()).not.toContain("DELTA SA");
      expect.soft(bodyHtml()).not.toContain("GAMA SA");
    });

    it("draws each action at its time in the grid", () => {
      expect.soft(bodyHtml()).toContain("15–17");
      expect.soft(bodyHtml()).toContain("ACME SA");
      expect.soft(bodyHtml()).toContain("ges-hbl");
    });

    it('goes Monday to Saturday, with "+ Agendar" and the range of the week', () => {
      expect.soft(bodyHtml().match(/data-d="/g) ?? []).toHaveLength(6);
      expect.soft(bodyHtml()).toContain("+ Agendar");
      expect.soft(bodyHtml()).toContain("19 al 24 de oct");
    });

    it("has a time band that starts at 8 and reaches 18", () => {
      expect.soft(bodyHtml()).toContain("08:00");
      expect.soft(bodyHtml()).toContain("17:00");
    });

    it("prints no NaN or undefined", () => {
      expect(bodyHtml()).not.toMatch(/NaN|undefined/);
    });
  });

  describe("of a leader", () => {
    beforeEach(() => {
      harness.signInAs("lider", "l1");
      script.GES.ag.data = null;
    });

    it("opens, with no view chosen, on the day of the whole team", async () => {
      script.GES.ag.ver = null;
      script.GES.ag.dia = null;

      script.gesAgenda();
      await settle();

      expect.soft(script.GES.ag.ver).toBe("equipo");
      expect.soft(bodyHtml()).toContain("ges-eqh");
      expect.soft(bodyHtml(), "one row per hunter in charge").toContain("Sofía Pérez");
      expect.soft(bodyHtml(), "one row per hunter in charge").toContain("Tomás Gil");
    });

    it("offers only the leader's hunters on the week", async () => {
      script.GES.ag.ver = "sem";

      script.gesAgenda();
      await settle();

      expect.soft(bodyHtml()).toContain("Sofía Pérez");
      expect.soft(bodyHtml()).toContain("Tomás Gil");
      expect.soft(bodyHtml()).not.toContain("Otra Persona");
    });

    it("shows on the week the agenda of the hunter chosen above", async () => {
      script.GES.ag.ver = "sem";
      script.gesAgenda();
      await settle();

      script.GES.ag.hun = "h2";
      script.gesAgPintar();

      const html = bodyHtml();
      expect.soft(html, "what is theirs, at its time").toContain("DELTA SA");
      expect.soft(html, "what is theirs, at its time").toContain("10–12");
      expect.soft(html, "the cancelled shows struck out").toMatch(/est-cancelada/);
      expect.soft(html, "the one with no time shows apart").toMatch(/Sin horario/);
      expect.soft(html, "the cancelled shows struck out").toContain("GAMA SA");
      expect.soft(html).toContain("Pegar desde Excel");
      expect.soft(html).toContain("+ Asignar");
    });

    it("lists the hunters and their free hours on the day of the team", async () => {
      script.GES.ag.ver = "sem";
      script.gesAgenda();
      await settle();

      script.GES.ag.ver = "equipo";
      script.GES.ag.dia = "2026-10-23";
      script.gesAgPintar();

      const html = bodyHtml();
      expect.soft(html).toContain("ges-eqh");
      expect.soft(html).toContain("Sofía Pérez");
      expect.soft(html).toContain("Tomás Gil");
      expect.soft(html, "what is taken").toContain("DELTA SA");
      expect
        .soft((html.match(/>Libre</g) ?? []).length, "free hours per hour")
        .toBeGreaterThanOrEqual(8);
      expect.soft(html).not.toMatch(/NaN|undefined/);
    });

    it("does not paint over another tab if the tab changes while it loads", async () => {
      harness.element("ges-body").innerHTML = "OTRA COSA";
      script.GES.ag.ver = "sem";

      script.gesAgenda();
      script.GES.tab = "lista";
      await settle();

      expect(bodyHtml()).toBe("OTRA COSA");
    });
  });

  describe("warning about overlapping times", () => {
    beforeEach(() => {
      harness.signInAs("lider", "l1");
      harness.rpc.gestiones_ocupado = () => [
        {
          id: "x",
          hora_desde: "10:00:00",
          hora_hasta: "12:00:00",
          tipo: "posicion",
          empresa: "ACME SA",
        },
        { id: "y", hora_desde: "15:00:00", hora_hasta: "16:00:00", tipo: "accion", empresa: null },
      ];
    });

    it("saves without asking when nothing overlaps", async () => {
      const saved = await script.gesChoque("h1", {
        fecha: "2026-10-21",
        hora_desde: "13:00",
        hora_hasta: "14:00",
      });

      expect.soft(saved).toBe(true);
      expect.soft(harness.confirmations).toHaveLength(0);
    });

    it("says with what it overlaps, without the company it cannot see, and lets it save", async () => {
      const saved = await script.gesChoque("h1", {
        fecha: "2026-10-21",
        hora_desde: "11:00",
        hora_hasta: "15:30",
      });

      expect.soft(saved).toBe(true);
      expect.soft(harness.confirmations).toHaveLength(1);
      expect.soft(harness.confirmations[0]).toMatch(/Sofía Pérez ya tiene algo a esa hora/);
      expect.soft(harness.confirmations[0]).toMatch(/10:00–12:00 en ACME SA/);
      expect.soft(harness.confirmations[0]).toMatch(/15:00–16:00 \(otra acción\)/);
    });

    it("does not clash with itself when editing", async () => {
      await script.gesChoque(
        "h1",
        { fecha: "2026-10-21", hora_desde: "11:00", hora_hasta: "12:00" },
        "x",
      );

      expect(harness.confirmations).toHaveLength(0);
    });
  });

  describe("assigning from the grid", () => {
    beforeEach(async () => {
      harness.signInAs("lider", "l1");
      harness.offerHunters(["h1", "h2"]);
      script.gesAgendar(1, "2026-10-24");
      await settle();
    });

    it("opens with that hunter and that day, with time and place", () => {
      const html = harness.element("modal").innerHTML;
      expect.soft(html).toContain("Asignar a un hunter");
      expect.soft(html).toMatch(/value="h2" selected/);
      expect.soft(html).toContain('value="2026-10-24"');
      expect.soft(html).toContain('id="gf-hd"');
      expect.soft(html).toContain('id="gf-lugar"');
    });

    it("lets the leader choose only hunters of the team", () => {
      expect(harness.element("modal").innerHTML).not.toContain("Otra Persona");
    });

    it("saves the company with its officer, hunter, time, place, planned and forwarded", async () => {
      harness.chooseCompany({ empresa: "ACME SA", dueno_id: "o1" });
      harness.element("gf-hunter", "h2");
      harness.element("gf-fecha", "2026-10-24");
      harness.element("gf-hd", "09:00");
      harness.element("gf-hh", "13:00");
      harness.element("gf-lugar", "Planta");
      harness.element("gf-nota", "");
      harness.element("ges-ag-ok");
      harness.rpc.gestiones_ocupado = () => [];
      harness.inserted.length = 0;

      script.gesAgendarOk();
      await settle();

      expect(harness.inserted[0]).toMatchObject({
        empresa: "ACME SA",
        dueno_id: "o1",
        hunter_id: "h2",
        origen: "derivada",
        estado: "planificada",
        hora_desde: "09:00",
        hora_hasta: "13:00",
        lugar: "Planta",
      });
    });
  });

  describe("pasting the agenda from Excel", () => {
    beforeEach(() => {
      harness.signInAs("lider", "l1");
    });

    it("skips the titles and reads each row, in any order of columns", () => {
      const rows = script.gesAgPasteParse(PASTED_AGENDA);

      expect.soft(rows, "the row of titles is skipped").toHaveLength(5);
      expect.soft(rows[0], "date, time, company, hunter by first name and place").toMatchObject({
        ok: true,
        hora_desde: "10:00",
        empresaTxt: "ACME SA",
        hunter_id: "h1",
        lugar: "Piso 3",
        tipo: "posicion",
      });
      expect.soft(rows[0]?.fecha, "the date of that row").toMatch(/-10-21$/);
      expect
        .soft(rows[1], "columns in another order, and the type if it comes")
        .toMatchObject({ ok: true, hunter_id: "h2", tipo: "feria", hora_hasta: "11:00" });
      expect
        .soft(rows[2], "no date: with problems")
        .toMatchObject({ ok: false, motivo: "sin fecha" });
      expect.soft(rows[3]?.ok, "a hunter who does not exist: with problems").toBe(false);
      expect.soft(rows[3]?.motivo, "a hunter who does not exist: with problems").toMatch(/hunter/);
    });

    describe("after reviewing it against the database", () => {
      beforeEach(async () => {
        harness.rpc.gestiones_empresas = ({ p_q: query }) =>
          [
            { empresa: "ACME SA", dueno_id: "o1" },
            { empresa: "BETA SRL", dueno_id: "o1" },
          ].filter(({ empresa }) => empresa.toLowerCase().includes(String(query).toLowerCase()));
        harness.rpc.gestiones_ocupado = ({ p_hunter: hunter, p_fecha: date }) =>
          hunter === "h1" && String(date).endsWith("-10-21")
            ? [
                {
                  id: "z",
                  hora_desde: "11:00:00",
                  hora_hasta: "12:00:00",
                  tipo: "accion",
                  empresa: "ZETA",
                },
              ]
            : [];
        harness.element("ga-paste", PASTED_AGENDA);
        harness.element("ga-prev");
        harness.element("ga-ok");
        script.gesAgPasteRevisar();
        await settle();
        await settle();
      });

      it("finds each company and its officer, and warns about what overlaps", () => {
        const [first, second] = harness.pastedAgenda();
        expect.soft(first?.dueno_id).toBe("o1");
        expect.soft(first?.aviso).toMatch(/se pisa con 11:00–12:00 en ZETA/);
        expect.soft(second?.dueno_id).toBe("o1");
        expect.soft(second?.aviso).toBeFalsy();
      });

      it("does not add a company that is not in the database", () => {
        const unknownCompany = harness.pastedAgenda()[4];
        expect.soft(unknownCompany?.ok).toBe(false);
        expect.soft(unknownCompany?.motivo).toMatch(/no está en la base/);
      });

      it('sums it up and offers "Agregar 2 a la agenda"', () => {
        const preview = harness.element("ga-prev").innerHTML;
        expect.soft(preview).toContain("2 listas");
        expect.soft(preview).toContain("1 se pisan");
        expect.soft(preview).toContain("3 con problemas");
        expect.soft(harness.element("ga-ok").textContent).toBe("Agregar 2 a la agenda");
        expect.soft(harness.element("ga-ok").disabled).toBe(false);
      });

      it("adds together only the ready ones, planned, with time and place", async () => {
        harness.inserted.length = 0;

        script.gesAgPasteOk();
        await settle();

        const batch = harness.inserted[0];
        expect.soft(batch).toHaveLength(2);
        expect.soft(batch).toEqual([
          expect.objectContaining({
            origen: "derivada",
            estado: "planificada",
            dueno_id: "o1",
            hora_desde: "10:00",
            lugar: "Piso 3",
          }),
          expect.objectContaining({ origen: "derivada", estado: "planificada", dueno_id: "o1" }),
        ]);
      });
    });
  });
});
