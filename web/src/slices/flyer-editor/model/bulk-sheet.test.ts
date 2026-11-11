import { describe, expect, it } from "vitest";
import { richTextOf } from "@/shared/domain/rich-text.ts";
import { bulkTemplate, readBulkRows, rowNumber, validateBulkRows } from "./bulk-sheet.ts";

const NAMES = ["BAU", "Config 1", "Config 2"];

/** A row as the reader gives it: the number of its line, out of its columns. */
function read(cells: Record<string, unknown>, position?: number) {
  const row = { ...cells };
  if (position !== undefined) {
    Object.defineProperty(row, "__rowNum__", { value: position, enumerable: false });
  }
  return row;
}

function rowsOf(...lines: Record<string, unknown>[]) {
  return readBulkRows(lines.map((cells, index) => read(cells, index + 1)));
}

function report(lines: Record<string, unknown>[], isCategoryTab = false) {
  const { lines: said, ...others } = validateBulkRows(rowsOf(...lines), {
    names: NAMES,
    isCategoryTab,
  });
  return { ...others, text: said.map(richTextOf) };
}

describe("reading the sheet of Masivo", () => {
  it("knows the number each line has in the Excel of the person", () => {
    const rows = readBulkRows([
      read({ empresa: "A" }, 1),
      read({ empresa: "" }, 2),
      read({ empresa: "C" }, 3),
    ]);
    expect(rows.map(({ empresa, sheetRow }) => [empresa, sheetRow])).toEqual([
      ["A", 2],
      ["C", 4],
    ]);
  });

  it("the number is not a column", () => {
    const [row] = rowsOf({ empresa: "A" });
    expect(Object.keys(row?.cells ?? {})).toEqual(["empresa"]);
  });

  it("a line with only blanks is not a line", () => {
    expect(rowsOf({ empresa: "   ", nombre: "" })).toEqual([]);
  });

  it("whatever is in a cell is read as it is written", () => {
    const [row] = rowsOf({ empresa: " ACME ", celular: 1144445555, nada: null });
    expect(row?.cells).toEqual({ empresa: "ACME", celular: "1144445555", nada: "" });
  });

  it("recognizes the headers even if they are written otherwise", () => {
    const [row] = rowsOf({
      EMPRESA: "Acme",
      "Asesor1_Nombre ": "Ana",
      "Asesor 1 Celular": "11 4444 5555",
      "ASESOR 1 EMAIL": "a@x.com",
      Cashback: "BAU",
    });
    expect(row).toMatchObject({
      empresa: "Acme",
      config: "BAU",
      officers: [{ nombre: "Ana", celular: "11 4444 5555", email: "a@x.com" }, {}, {}, {}],
    });
  });

  it("the company goes by the names it has in the list, and the first one wins", () => {
    expect(rowsOf({ "razón social": "Uno" })[0]?.empresa).toBe("Uno");
    expect(rowsOf({ cliente: "Dos", empresa: "Tres" })[0]?.empresa).toBe("Tres");
  });

  it("the first officer can come without a number; the others cannot", () => {
    const [row] = rowsOf({ empresa: "A", Nombre: "Ana", Cel: "11", Mail: "a@x.com" });
    expect(row?.officers[0]).toEqual({ nombre: "Ana", celular: "11", email: "a@x.com" });
    expect(row?.officers[1]).toEqual({ nombre: "", celular: "", email: "" });
  });

  it("a numbered first officer wins over the one without a number", () => {
    const [row] = rowsOf({ empresa: "A", asesor1_nombre: "Ana", nombre: "Otra" });
    expect(row?.officers[0]?.nombre).toBe("Ana");
  });

  it("reads the four officers", () => {
    const [row] = rowsOf({
      empresa: "A",
      asesor2_nombre: "Dos",
      asesor3_celular: "33",
      asesor4_email: "cuatro@x.com",
    });
    expect(row?.officers.map(({ nombre, celular, email }) => nombre || celular || email)).toEqual([
      "",
      "Dos",
      "33",
      "cuatro@x.com",
    ]);
  });

  it('"tipo" does not count as cashback: in a sheet of clients it usually is something else', () => {
    const [row] = rowsOf({ empresa: "A", tipo: "BAU" });
    expect(row?.config).toBe("");
    expect(report([{ empresa: "A", tipo: "BAU" }]).text[0]).toMatch(
      /No encontré la columna del cashback/,
    );
  });

  it.each(["config", "Configuración", "cashback", "Tipo Cashback", "tipo de cashback"])(
    "%s does count as cashback",
    (column) => {
      expect(rowsOf({ empresa: "A", [column]: "BAU" })[0]?.config).toBe("BAU");
    },
  );

  it("the columns of the sign are recognized by how they start", () => {
    const [row] = rowsOf({
      empresa: "A",
      "beneficio ": "Cartel",
      "importe (Tope supermercado)": "24.000",
      "importe2 (Tope combustible)": "30.000",
    });
    expect(row?.benefit).toEqual({ beneficio: "Cartel", importe: "24.000", importe2: "30.000" });
  });

  it("the first one with something is the one that counts", () => {
    const [row] = rowsOf({ empresa: "A", importe: "", tope: "1", tope2: "2", segundo: "3" });
    expect(row?.benefit).toEqual({ beneficio: "", importe: "1", importe2: "2" });
  });

  it("names a line by the number of its sheet, or by its place if the reader did not say", () => {
    const [withNumber] = rowsOf({ empresa: "A" });
    const [withoutNumber] = readBulkRows([{ empresa: "A" }]);
    if (!withNumber || !withoutNumber) throw new Error("No rows");
    expect(rowNumber(withNumber, 5)).toBe(2);
    expect(rowNumber(withoutNumber, 5)).toBe(7);
    expect(withoutNumber.sheetRow).toBeNull();
  });
});

describe("what is said about the sheet", () => {
  const GOOD = { empresa: "A", asesor1_nombre: "Ana", asesor1_email: "a@x.com", config: "BAU" };

  it("all good: how many flyers, and it can generate", () => {
    expect(report([GOOD])).toMatchObject({
      severity: "ok",
      text: ["Todo OK — 1 flyer"],
      canGenerate: true,
      countText: "1 fila",
    });
    expect(report([GOOD, GOOD])).toMatchObject({
      text: ["Todo OK — 2 flyers"],
      countText: "2 filas",
    });
  });

  it("no column of the company is one error and not one per line, and it does not generate", () => {
    const { severity, text, canGenerate } = report([
      { razon: "A" },
      { razon: "B" },
      { razon: "C" },
    ]);
    expect(severity).toBe("error");
    expect(text).toEqual([
      "No encontré la columna empresa. Renombrá esa columna a «empresa» (como en la plantilla).",
    ]);
    expect(canGenerate).toBe(false);
  });

  it("an empty company says the row of the sheet, and an error hides the warnings", () => {
    const { severity, text, canGenerate } = report([
      { empresa: "A", rara: "x" },
      { empresa: "", rara: "y" },
    ]);
    expect(severity).toBe("error");
    expect(text).toEqual(["Fila 3: empresa vacía"]);
    expect(canGenerate).toBe(false);
  });

  it("many rows are named up to five", () => {
    const lines = Array.from({ length: 8 }, () => ({ empresa: "", nombre: "x" }));
    expect(report([{ empresa: "A", nombre: "x" }, ...lines]).text).toEqual([
      "Fila 3, 4, 5, 6, 7 y 3 más: empresa vacía",
    ]);
  });

  it("no column of the cashback warns and lets it generate", () => {
    const { severity, text, canGenerate } = report([{ empresa: "A", asesor1_nombre: "Ana" }]);
    expect(severity).toBe("warning");
    expect(text).toEqual([
      "No encontré la columna del cashback (config): todos los flyers van a salir sin montos. Si tienen cashback, llamá a esa columna «config» (como en la plantilla).",
    ]);
    expect(canGenerate).toBe(true);
  });

  it("no column of officers warns", () => {
    expect(report([{ empresa: "A", config: "BAU" }]).text).toEqual([
      "No encontré columnas de oficiales (asesor1_nombre, asesor1_celular…): los flyers salen sin datos de contacto.",
    ]);
  });

  it("a cashback it does not understand says which one", () => {
    expect(
      report([
        { ...GOOD, config: "BAU" },
        { ...GOOD, config: "Rarísimo" },
      ]).text,
    ).toEqual([
      'Cashback que no reconozco (1): fila 3 ("rarísimo") → esos flyers salen sin cashback.',
    ]);
  });

  it("names up to four cashbacks it does not understand", () => {
    const lines = ["a1x", "b1x", "c1x", "d1x", "e1x", "f1x"].map((config) =>
      Object.assign(structuredClone(GOOD), { config }),
    );
    expect(report(lines).text).toEqual([
      'Cashback que no reconozco (6): fila 2 ("a1x"), fila 3 ("b1x"), fila 4 ("c1x"), fila 5 ("d1x") y 2 más → esos flyers salen sin cashback.',
    ]);
  });

  it("a row without cashback says which one; all of them says all of them", () => {
    expect(report([GOOD, { ...GOOD, config: "" }]).text).toEqual([
      "1 fila sin cashback (celda vacía o SIN): esos flyers salen sin montos (fila 3).",
    ]);
    expect(
      report([
        { ...GOOD, config: "SIN" },
        { ...GOOD, config: "" },
      ]).text,
    ).toEqual([
      "2 filas sin cashback (celda vacía o SIN): todos los flyers salen sin montos (fila 2, 3).",
    ]);
  });

  it("with many rows without cashback it does not name them", () => {
    const lines = Array.from({ length: 5 }, () => ({ ...GOOD, config: "" }));
    expect(report([GOOD, ...lines]).text).toEqual([
      "5 filas sin cashback (celda vacía o SIN): esos flyers salen sin montos.",
    ]);
  });

  it("a mail without its at sign warns", () => {
    expect(report([{ ...GOOD, asesor1_email: "sin arroba" }]).text).toEqual([
      "Fila 2: email sin @",
    ]);
  });

  it("a mail of another officer counts too", () => {
    expect(report([{ ...GOOD, asesor3_email: "sin arroba" }]).text).toEqual([
      "Fila 2: email sin @",
    ]);
  });

  it("no cap matters only in Rubros", () => {
    expect(report([GOOD]).severity).toBe("ok");
    expect(report([GOOD], true).text).toEqual([
      "Fila 2: sin importe (se usa el tope del formulario)",
    ]);
    expect(report([{ ...GOOD, importe: "24.000" }], true).severity).toBe("ok");
  });

  it("the columns it ignores are named, up to six", () => {
    const [text] = report([
      { ...GOOD, a1: "x", b1: "x", c1: "x", d1: "x", e1: "x", f1: "x", g1: "x" },
    ]).text;
    expect(text).toBe(
      "Columnas que ignoré: a1, b1, c1, d1, e1, f1 y 1 más. Si alguna debería usarse, revisá el nombre contra la plantilla.",
    );
  });

  it("a column of the list of companies is not ignored", () => {
    expect(report([{ ...GOOD, cuit: "30", cuit2: "31", importe: "1", tope2: "2" }]).severity).toBe(
      "ok",
    );
  });

  it("all the warnings together, in their order", () => {
    const { text } = report([{ empresa: "A", nada: "x", asesor2_email: "no" }]);
    expect(text.map((line) => line.slice(0, 18))).toEqual([
      "No encontré la col",
      "Fila 2: email sin ",
      "Columnas que ignor",
    ]);
  });

  it("shows the first five lines and says how many more there are", () => {
    const lines = Array.from({ length: 7 }, (_, index) => ({
      ...GOOD,
      empresa: `E${String(index)}`,
    }));
    const { columns, preview, notShown } = report(lines);
    expect(columns).toEqual(["empresa", "asesor1_nombre", "asesor1_email", "config"]);
    expect(preview).toHaveLength(5);
    expect(preview[4]?.[0]).toBe("E4");
    expect(notShown).toBe(2);
  });

  it("a column the first line does not have stays out of the preview", () => {
    const { columns, preview } = report([{ empresa: "A" }, { empresa: "B", otra: "x" }]);
    expect(columns).toEqual(["empresa"]);
    expect(preview).toEqual([["A"], ["B"]]);
  });

  it("a sheet with nothing in it has nothing to show", () => {
    expect(validateBulkRows([], { names: NAMES, isCategoryTab: false }).columns).toEqual([]);
  });
});

describe("the template of Masivo", () => {
  const SIGN = {
    firstCapLabel: "Tope supermercado",
    secondCapLabel: "Tope combustible",
    usesSecondCap: false,
  };

  it("carries the four officers, with generic data", () => {
    const { lines, widths, sheetName, fileName } = bulkTemplate({
      ...SIGN,
      isCategoryTab: false,
    });
    const [head, first, second] = lines;
    expect(head?.slice(0, 4)).toEqual([
      "empresa",
      "asesor1_nombre",
      "asesor1_celular",
      "asesor1_email",
    ]);
    expect(head?.slice(10, 14)).toEqual([
      "asesor4_nombre",
      "asesor4_celular",
      "asesor4_email",
      "config",
    ]);
    expect(first).toHaveLength(head?.length ?? 0);
    expect(second).toHaveLength(head?.length ?? 0);
    expect(first?.at(-1)).toBe("BAU");
    expect(second?.at(-1)).toBe("Config 1");
    expect(widths).toHaveLength(head?.length ?? 0);
    expect(sheetName).toBe("Flyers");
    expect(fileName).toBe("Plantilla_Flyers_Galicia.xlsx");
  });

  it("in Rubros it adds the sign, with one cap", () => {
    const { lines, widths, fileName } = bulkTemplate({ ...SIGN, isCategoryTab: true });
    expect(lines[0]?.slice(-2)).toEqual(["beneficio", "importe"]);
    expect(lines[1]?.slice(-2)).toEqual(["EMPRESA EJEMPLO", "24.000"]);
    expect(lines[2]?.slice(-2)).toEqual(["-", "24.000"]);
    expect(widths.slice(-2)).toEqual([22, 12]);
    expect(fileName).toBe("Plantilla_Flyers_Rubros.xlsx");
  });

  it("with two caps each column says which one it is, and is read back as such", () => {
    const { lines, widths } = bulkTemplate({
      ...SIGN,
      isCategoryTab: true,
      usesSecondCap: true,
    });
    expect(lines[0]?.slice(-3)).toEqual([
      "beneficio",
      "importe (Tope supermercado)",
      "importe2 (Tope combustible)",
    ]);
    expect(lines[1]?.slice(-2)).toEqual(["24.000", "30.000"]);
    expect(lines[2]?.slice(-2)).toEqual(["24.000", ""]);
    expect(widths.slice(-3)).toEqual([22, 28, 34]);
    const [head = [], first = []] = lines;
    const [row] = rowsOf(Object.fromEntries(head.map((column, index) => [column, first[index]])));
    expect(row?.benefit).toEqual({
      beneficio: "EMPRESA EJEMPLO",
      importe: "24.000",
      importe2: "30.000",
    });
  });
});
