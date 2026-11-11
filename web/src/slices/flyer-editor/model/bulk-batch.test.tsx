import { describe, expect, it } from "vitest";
import {
  DEFAULT_CASHBACK_CONFIGS,
  type DestinationRules,
} from "@/shared/domain/company-registry/index.ts";
import { sanitizeFlyerOptions } from "@/shared/domain/flyer-options.ts";
import {
  bulkErrors,
  bulkPlan,
  bulkSummaryText,
  bulkFlyerValues,
  drawnLine,
  nothingCameOutText,
  zipDoneNotice,
  zipDoneText,
} from "./bulk-batch.ts";
import { paintedCanvas, testScene } from "@/shared/flyer-engine/testing/test-scene.ts";
import { readBulkRows } from "./bulk-sheet.ts";

const NAMES = DEFAULT_CASHBACK_CONFIGS.map(({ nombre }) => nombre);
const OPTIONS = sanitizeFlyerOptions([
  { n: 9, nombre: "Combustible", solapa: "flyer" },
  { n: 10, nombre: "Sin cashback", solapa: "flyer", sinCB: 9 },
  { n: 4, nombre: "Otra", solapa: "flyer" },
]);
const RULES: DestinationRules = {
  options: OPTIONS,
  cashbackNames: NAMES,
  can: () => true,
  tabLabel: () => "Flyer Galicia",
  hasFlyer: () => undefined,
};
const CONTEXT = {
  configs: DEFAULT_CASHBACK_CONFIGS,
  names: NAMES,
  legal: "El legal",
  singleCashback: false,
  hasBenefit: false,
  formCap: "$24.000",
  formSecondCap: "",
};

function rowsOf(...lines: Record<string, unknown>[]) {
  return readBulkRows(
    lines.map((cells, index) =>
      Object.defineProperty(structuredClone(cells), "__rowNum__", {
        value: index + 1,
        enumerable: false,
      }),
    ),
  );
}

function row(cells: Record<string, unknown>) {
  const [read] = rowsOf(cells);
  if (!read) throw new Error("No row");
  return read;
}

const LINES = rowsOf(
  { empresa: "A con", config: "BAU" },
  { empresa: "B sin", config: "" },
  { empresa: "C con", config: "Config 1" },
  { empresa: "D sin", config: "SIN" },
);

function planned(origin: number, isFree = true, rules = RULES) {
  return bulkPlan(LINES, origin, isFree, rules).rows.map(({ row: { empresa }, option }) => [
    empresa,
    option,
  ]);
}

describe("which flyer each line goes on", () => {
  it("from the original: first the ones on screen, then the ones of the version without cashback", () => {
    expect(planned(9)).toEqual([
      ["A con", 9],
      ["C con", 9],
      ["B sin", 10],
      ["D sin", 10],
    ]);
  });

  it("from the version without cashback: each one to its own, those of the screen first", () => {
    expect(planned(10)).toEqual([
      ["B sin", 10],
      ["D sin", 10],
      ["A con", 9],
      ["C con", 9],
    ]);
  });

  it("in a draft or with a crop everything goes on what is being built", () => {
    expect(planned(9, false).every(([, option]) => option === 9)).toBe(true);
    expect(planned(10, false).every(([, option]) => option === 10)).toBe(true);
  });

  it("with no version without cashback everything stays", () => {
    expect(planned(4).every(([, option]) => option === 4)).toBe(true);
  });

  it("a version known to have no flyer is not offered", () => {
    const rules = { ...RULES, hasFlyer: (n: number) => (n === 10 ? false : undefined) };
    expect(planned(9, true, rules).every(([, option]) => option === 9)).toBe(true);
  });

  it("a version this person cannot use is not offered", () => {
    const rules = { ...RULES, can: (key: string) => key !== "opcion_10" };
    expect(planned(9, true, rules).every(([, option]) => option === 9)).toBe(true);
  });

  it("from the version, an original this person cannot use leaves them all there", () => {
    const rules = { ...RULES, can: (key: string) => key !== "opcion_9" };
    expect(planned(10, true, rules).every(([, option]) => option === 10)).toBe(true);
  });

  it("a line keeps the number of its sheet, whatever the order", () => {
    const { rows } = bulkPlan(LINES, 9, true, RULES);
    expect(rows.map(({ number }) => number)).toEqual([2, 4, 3, 5]);
  });
});

describe("what a flyer of Masivo says", () => {
  it("what its line says, with the amounts of its cashback and the legal of the flyer", () => {
    const values = bulkFlyerValues(
      row({
        empresa: "ACME",
        config: "Config 1",
        asesor1_nombre: "Ana",
        asesor1_celular: "11 4444 5555",
        asesor1_email: "a@x.com",
      }),
      CONTEXT,
    );
    expect(values).toMatchObject({
      empresa: "ACME",
      nocb: false,
      m1: "$350.000",
      legal: "El legal",
      cashUnico: false,
      has1: true,
      nombre: "Ana",
      celular: "Cel: 11 4444 5555",
      email: "a@x.com",
      has2: false,
      nombre2: "",
      celular2: "",
      email2: "",
    });
    expect(values.benef).toBeUndefined();
  });

  it("a mail is not made up: the sheet is what the person has", () => {
    expect(bulkFlyerValues(row({ empresa: "A", nombre: "Ana" }), CONTEXT).email).toBe("");
  });

  it("no cashback it understands: without amounts", () => {
    expect(bulkFlyerValues(row({ empresa: "A", config: "" }), CONTEXT).nocb).toBe(true);
    expect(bulkFlyerValues(row({ empresa: "A", config: "Raro" }), CONTEXT).nocb).toBe(true);
  });

  it("a list of configurations with nothing in it does not break anything", () => {
    expect(bulkFlyerValues(row({ empresa: "A" }), { ...CONTEXT, configs: [] }).m1).toBeNull();
  });

  describe("on Rubros", () => {
    const SIGN = { ...CONTEXT, hasBenefit: true };

    it("the sign says the company, or what the line says, and the caps of the line", () => {
      expect(
        bulkFlyerValues(row({ empresa: "ACME", importe: "30000", importe2: "45000" }), SIGN),
      ).toMatchObject({
        benef: true,
        benefNombre: "ACME",
        importe: "$30.000",
        importe2: "$45.000",
      });
      expect(bulkFlyerValues(row({ empresa: "ACME", beneficio: "Otro" }), SIGN).benefNombre).toBe(
        "Otro",
      );
    });

    it('"-" leaves the sign without a name', () => {
      expect(bulkFlyerValues(row({ empresa: "ACME", beneficio: "-" }), SIGN).benefNombre).toBe("");
    });

    it("with no caps in the line, those of the form", () => {
      expect(bulkFlyerValues(row({ empresa: "ACME" }), SIGN)).toMatchObject({
        importe: "$24.000",
        importe2: "$24.000",
      });
      expect(
        bulkFlyerValues(row({ empresa: "ACME" }), { ...SIGN, formSecondCap: "$99.000" }).importe2,
      ).toBe("$99.000");
    });
  });
});

describe("what did not come out", () => {
  const [line] = bulkPlan(LINES, 9, true, RULES).rows;

  it("says the row, the company and why", () => {
    if (!line) throw new Error("No line");
    expect(
      bulkErrors(
        [
          { row: line, option: 9, reason: "drawing", detail: "falla" },
          { row: line, option: 10, reason: "network" },
          { row: line, option: 10, reason: "no-flyer" },
          { row: line, option: 9, reason: "drawing" },
        ],
        (option) => `Flyer ${String(option)}`,
      ).map(({ number, company, reason }) => `${String(number)} ${company} ${reason}`),
    ).toEqual([
      "2 A con no se pudo dibujar (falla)",
      "2 A con no se pudo cargar el flyer «Flyer 10»",
      "2 A con no se pudo cargar el flyer «Flyer 10»",
      "2 A con no se pudo dibujar ()",
    ]);
  });

  it("a line with no company is named by its row", () => {
    if (!line) throw new Error("No line");
    const nameless = { ...line, row: { ...line.row, empresa: "" } };
    expect(bulkErrors([{ row: nameless, option: 9, reason: "network" }], String)[0]?.company).toBe(
      "(fila 2)",
    );
  });
});

describe("what a test reads of a flyer that was drawn", () => {
  const scene = testScene({ art: paintedCanvas(10, 10) });

  it("what it said", () => {
    expect(
      drawnLine({ empresa: "A", nombre: "Ana", celular: "Cel: 1", m1: "$1", nocb: true }, 9, scene),
    ).toEqual({
      company: "A",
      officer: "Ana",
      phone: "Cel: 1",
      firstAmount: "$1",
      noCashback: true,
      option: 9,
      hasAmounts: true,
    });
  });

  it("what it did not say stays empty", () => {
    expect(drawnLine({ empresa: "A" }, 9, scene)).toMatchObject({
      officer: "",
      phone: "",
      firstAmount: "",
      noCashback: false,
    });
  });
});

describe("what is told after a batch", () => {
  const ERROR = { number: 7, company: "Rota", reason: "no se pudo dibujar (falla)" };

  it("Resumen.txt, with nothing to say", () => {
    const text = bulkSummaryText(
      {
        total: 1,
        generated: 1,
        date: new Date(),
        perOption: new Map([[9, 1]]),
        noCashback: [],
        noOfficers: [],
        errors: [],
      },
      RULES,
    );
    expect(text).toBe(
      [
        "FLYERS GENERADOS DESDE EL EXCEL (MASIVO)",
        "Fecha: hace un momento",
        "Filas del Excel: 1",
        "Flyers generados: 1",
        "No se generaron: 0",
        "",
        "POR FORMATO",
        "  Flyer Galicia · Combustible: 1",
        "",
        "OBSERVACIONES",
        "  Ninguna.",
        "",
        "FILAS QUE NO SE GENERARON",
        "  Ninguna.",
      ].join("\n"),
    );
  });

  it("Resumen.txt, with each thing in its place and the flyers by number", () => {
    const names = Array.from({ length: 14 }, (_, index) => `E${String(index)}`);
    const text = bulkSummaryText(
      {
        total: 3,
        generated: 2,
        date: new Date(),
        perOption: new Map([
          [10, 1],
          [9, 1],
        ]),
        noCashback: ["Beta"],
        noOfficers: names,
        errors: [ERROR],
      },
      RULES,
    );
    expect(text).toContain("  1 sin cashback (importes en blanco): Beta");
    expect(text).toContain(
      "  14 sin oficiales (salen sin datos de contacto): E0, E1, E2, E3, E4, E5, E6, E7, E8, E9, E10, E11 y 2 más",
    );
    expect(text).toContain("  Fila 7 — Rota: no se pudo dibujar (falla)");
    expect(text.indexOf("Combustible")).toBeLessThan(text.indexOf("Sin cashback"));
  });

  it("under the bar, what came out and what did not", () => {
    expect(zipDoneText(1, [])).toBe("✓ ZIP con 1 flyer!");
    expect(zipDoneText(2, [])).toBe("✓ ZIP con 2 flyers!");
    expect(zipDoneText(2, [ERROR])).toBe(
      "✓ ZIP con 2 flyers — 1 no salió: fila 7 (Rota): no se pudo dibujar (falla) (el detalle está en Resumen.txt, dentro del ZIP)",
    );
    const many = [ERROR, ERROR, ERROR, ERROR];
    expect(zipDoneText(1, many)).toMatch(/^✓ ZIP con 1 flyer — 4 no salieron: /);
    expect(zipDoneText(1, many)).toMatch(/ … \(el detalle/);
  });

  it("with nothing out, it says why", () => {
    expect(nothingCameOutText([ERROR])).toBe(
      "No se generó ningún flyer — fila 7 (Rota): no se pudo dibujar (falla)",
    );
  });

  it("the notice counts what did not come out", () => {
    expect(zipDoneNotice([])).toBe("ZIP descargado!");
    expect(zipDoneNotice([ERROR, ERROR])).toBe("ZIP descargado: 2 fila(s) no se pudieron generar");
  });
});
