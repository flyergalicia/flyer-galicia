import { describe, expect, it } from "vitest";
import { sanitizeFlyerOptions } from "../flyer-options.ts";
import { richTextOf } from "../rich-text.ts";
import { type SheetContext, validateSheet } from "./sheet-report.ts";

const CONTEXT: SheetContext = {
  options: sanitizeFlyerOptions([
    { n: 1 },
    { n: 4, nombre: "Combustible", solapa: "rubros" },
    { n: 5, nombre: "Supermercado", solapa: "rubros" },
  ]),
  cashbackNames: ["BAU", "Config 1", "Config 2"],
};

function report(rows: readonly Record<string, string>[]) {
  const result = validateSheet(rows, CONTEXT);
  return { ...result, texts: result.problems.map(({ text }) => richTextOf(text)) };
}

const GOOD = { empresa: "ACME", config: "BAU", cuit: "30-71111111-1" };

describe("a sheet that is fine", () => {
  it("says nothing", () => {
    const { rows, texts, serious, discarded } = report([GOOD]);

    expect(rows).toHaveLength(1);
    expect(texts).toEqual([]);
    expect(serious).toBe(0);
    expect(discarded).toBe(0);
  });
});

describe("what is serious", () => {
  it("nothing could be read", () => {
    const { texts, serious, rows } = report([{ otra: "x", config: "BAU" }]);

    expect(rows).toEqual([]);
    expect(texts.join(" ")).toMatch(/No se pudo leer ninguna empresa/);
    expect(serious).toBe(1);
  });

  it("no column of the company, with rows by their tax id", () => {
    const { texts, serious } = report([{ cuit: "30711111111", config: "BAU" }]);

    expect(texts.join(" ")).toMatch(/No encontré la columna empresa\./);
    expect(texts.join(" ")).toMatch(/1 fila sin razón social \(fila 2\)/);
    expect(serious).toBe(1);
  });

  it("no column of the cashback", () => {
    const { texts, serious } = report([{ empresa: "ACME" }]);

    expect(texts.join(" ")).toMatch(/No encontré la columna del cashback/);
    expect(serious).toBe(1);
  });
});

describe("what it warns about", () => {
  it("a cashback it does not know, with the row of the sheet", () => {
    const one = report([GOOD, { ...GOOD, empresa: "OTRA", config: "Premium" }]);
    expect(one.texts[0]).toMatch(/1 cashback que no reconozco/);
    expect(one.texts[0]).toMatch(/esa empresa va a salir sin montos/);
    expect(one.texts[0]).toMatch(/fila 3 \("Premium"\)/);

    const many = report(
      ["A", "B", "C", "D", "E", "F"].map((empresa) => ({ empresa, config: "Premium" })),
    );
    expect(many.texts[0]).toMatch(/6 cashbacks que no reconozco/);
    expect(many.texts[0]).toMatch(/esas empresas van a salir/);
    expect(many.texts[0]).toMatch(/y 2 más/);
  });

  it("the ones marked on purpose are not a complaint", () => {
    expect(report([{ empresa: "A", config: "SIN" }]).texts[0]).toMatch(
      /1 empresa marcada SIN cashback/,
    );
    expect(
      report([
        { empresa: "A", config: "SIN" },
        { empresa: "B", config: "" },
      ]).texts[0],
    ).toMatch(/2 empresas marcadas SIN cashback/);
  });

  it("a category it does not know", () => {
    const { texts } = report([{ ...GOOD, rubro: "Premium" }]);

    expect(texts[0]).toMatch(/1 rubro que no reconozco/);
    expect(texts[0]).toMatch(/fila 2 \("Premium"\)/);
    expect(texts[0]).toMatch(/\(Combustible, Supermercado\)/);
    const none = validateSheet(
      [
        { ...GOOD, rubro: "X" },
        { ...GOOD, rubro: "Y" },
      ],
      {
        ...CONTEXT,
        options: sanitizeFlyerOptions([{ n: 1 }]),
      },
    ).problems.map(({ text }) => richTextOf(text));
    expect(none[0]).toMatch(/2 rubros que no reconozco/);
    expect(none[0]).toMatch(/quedan sin rubro/);
    expect(none[0]).toMatch(/ninguna configurada/);
  });

  it("a cap in the column of the other category", () => {
    const { texts, rows } = report([
      { ...GOOD, rubro: "Combustible", tope_supermercado: "24000" },
      { ...GOOD, empresa: "BIEN", rubro: "Combustible", tope_combustible: "24000" },
      { ...GOOD, empresa: "OTRA", rubro: "Supermercado", tope_combustible: "1000" },
    ]);

    expect(rows[0]?.rubro.importe).toBe("24000");
    expect(texts[0]).toMatch(/2 topes en la columna del otro rubro/);
    expect(texts[0]).toMatch(
      /fila 2 \(rubro Combustible, pero el tope está en tope_supermercado\)/,
    );
    expect(texts[0]).toMatch(
      /fila 4 \(rubro Supermercado, pero el tope está en tope_combustible\)/,
    );
    expect(texts[0]).not.toMatch(/fila 3/);
    expect(report([{ ...GOOD, rubro: "Combustible", tope_supermercado: "1" }]).texts[0]).toMatch(
      /1 tope en la columna/,
    );
  });

  it("a tax id without 11 digits", () => {
    expect(report([{ ...GOOD, cuit: "307" }]).texts[0]).toMatch(/1 CUIT sin 11 dígitos: fila 2/);
  });

  it("rows without a name, and empty rows", () => {
    const { texts, discarded, rows } = report([
      { ...GOOD, empresa: "", cuit: "30711111111" },
      { ...GOOD, empresa: "", cuit: "30722222222" },
      { empresa: "", config: "BAU" },
      { empresa: "", config: "BAU" },
    ]);

    expect(rows).toHaveLength(2);
    expect(discarded).toBe(2);
    expect(texts.join(" ")).toMatch(/2 filas sin razón social \(filas 2, 3\)/);
    expect(texts.join(" ")).toMatch(/2 filas vacías \(sin empresa ni CUIT\): se descartan/);
    expect(report([{ ...GOOD }, { empresa: "", config: "" }]).texts.join(" ")).toMatch(
      /1 fila vacía \(sin empresa ni CUIT\): se descarta\./,
    );
  });

  it("columns it ignored, by the name they had", () => {
    expect(report([{ ...GOOD, Vendedor: "x" }]).texts[0]).toMatch(
      /Columnas que ignoré: Vendedor\./,
    );
    const many = Object.fromEntries(
      Array.from({ length: 8 }, (_, position) => [`otra${String(position)}`, "x"]),
    );
    expect(report([{ ...GOOD, ...many }]).texts[0]).toMatch(/y 2 más/);
  });

  it("a row number comes from the reader when it says it", () => {
    const row = { ...GOOD, cuit: "307" };
    Object.defineProperty(row, "__rowNum__", { value: 41, enumerable: false });

    expect(richTextOf(validateSheet([row], CONTEXT).problems[0]?.text ?? [])).toMatch(/fila 42/);
  });
});
