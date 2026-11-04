// Replaces pruebas/u02_gestiones_paquetes.mjs.
import { beforeEach, describe, expect, it } from "vitest";
import {
  type CommercialActionsScript,
  loadCommercialActionsScript,
  type ScriptHarness,
} from "../support/commercial-actions-script.ts";

const DASHBOARD = {
  kpis: { visitas: 4, planificadas: 0, empresas: 2, asistentes: 100, prospectos: 40, altas: 10 },
  por_mes: [{ mes: "2026-10", visitas: 4, prospectos: 40, altas: 10 }],
  por_hunter: [
    { id: "h1", visitas: 3, prospectos: 30, altas: 8, paquetes: { plus: 5, gold: 2 } },
    { id: "h2", visitas: 1, prospectos: 10, altas: 2, paquetes: {} },
  ],
  por_dueno: [{ id: "d1", visitas: 4, prospectos: 40, altas: 10 }],
  por_empresa: [{ empresa: "ACME", dueno: "d1", visitas: 4, prospectos: 40, altas: 10 }],
  por_paquete: [
    { paquete: "plus", altas: 5 },
    { paquete: "gold", altas: 2 },
    { paquete: "black", altas: 1 },
    { paquete: null, altas: 2 },
  ],
  por_tipo: [{ tipo: "feria", modalidad: "presencial", visitas: 4, prospectos: 40, altas: 10 }],
};

describe("commercial actions are told apart by package", () => {
  let harness: ScriptHarness;
  let script: CommercialActionsScript;

  beforeEach(() => {
    harness = loadCommercialActionsScript();
    ({ script } = harness);
    harness.signInAs("lider", "yo");
  });

  it("offers the five packages, in order, where Caja de Ahorro means no package", () => {
    expect(Object.values(script.GES_PAQ)).toEqual([
      "Sin paquete (Caja de Ahorro)",
      "Plus",
      "Plus Gold",
      "Eminent Platinum",
      "Eminent Black",
    ]);
  });

  it.each([
    ["Caja de Ahorro", "caja"],
    ["CA", "caja"],
    ["caja de ahorros", "caja"],
    ["Sin paquete", "caja"],
    ["Sin paquete (Caja de Ahorro)", "caja"],
    ["Plus", "plus"],
    ["PAQUETE PLUS", "plus"],
    ["Plus Gold", "gold"],
    ["gold", "gold"],
    ["Eminent Platinum", "platinum"],
    ["Platino", "platinum"],
    ["eminent black", "black"],
    ["Black", "black"],
  ])("reads %j as the package %s", (text, expected) => {
    expect(script.gesPaqDe(text)).toBe(expected);
  });

  it.each(["Eminent", "Ana Plus", "2500000", ""])(
    "does not read %j as a package, because it is not only a package",
    (text) => {
      expect(script.gesPaqDe(text)).toBeNull();
    },
  );

  describe("pasting a list of people", () => {
    it("skips the row of titles, places each cell and warns about repeated CUILs", () => {
      script.GES.detPros = [{ cuil: "27111111117" }];

      const rows = script.gesPasteParse(
        "Nombre\tCUIL\tPaquete\nAna Pérez\t20-12345678-6\tPlus Gold\nEminent Black\tLuis Gómez\nPedro Sin\t27-11111111-7\nJuan Black",
      );

      expect.soft(rows, "the row of titles is skipped").toHaveLength(4);
      expect
        .soft(rows[0], "name, CUIL and package in their place")
        .toMatchObject({ ok: true, nombre: "Ana Pérez", cuil: "20123456786", paquete: "gold" });
      expect
        .soft(rows[1], "the package may come before the name")
        .toMatchObject({ ok: true, nombre: "Luis Gómez", paquete: "black" });
      expect.soft(rows[2]?.ok, "a CUIL already on the list is not taken").toBeFalsy();
      expect.soft(rows[2]?.motivo, "and it says so").toMatch(/ya est/);
      expect
        .soft(rows[3], "a surname that looks like a package stays as the name")
        .toMatchObject({ ok: true, nombre: "Juan Black", paquete: null });
    });
  });

  describe("the dashboard", () => {
    let html: string;

    beforeEach(() => {
      script.GES.personas = {
        h1: { nombre: "Sofía", rol: "hunter" },
        h2: { nombre: "Tomás", rol: "hunter" },
        d1: { nombre: "Oficial", rol: "vip" },
      };
      script.GES.tablero = DASHBOARD;
      const body = harness.element("ges-body");
      script.gesTableroPintar();
      html = body.innerHTML;
    });

    it('shows "Altas por paquete" instead of income ranges', () => {
      expect.soft(html).toContain("Altas por paquete");
      expect.soft(html).not.toMatch(/renta/i);
    });

    it.each(["Sin paquete", "Plus", "Plus Gold", "Eminent Platinum", "Eminent Black"])(
      "lists %s, even with no signups",
      (name) => {
        expect(html).toContain(`>${name}<`);
      },
    );

    it("tells signups with a package from those without", () => {
      expect.soft(html).toContain("Con paquete: 8");
      expect.soft(html).toContain("Sin paquete: 0");
    });

    it("gives amounts and the percentage of all signups", () => {
      expect.soft(html).toContain("5 &middot; 50%");
      expect.soft(html).toContain("2 altas sin paquete cargado");
    });

    it("shows under each hunter their signups by package", () => {
      expect(html).toContain("5 Plus &middot; 2 Plus Gold");
    });

    it("prints no NaN or undefined", () => {
      expect(html).not.toMatch(/NaN|undefined/);
    });
  });
});
