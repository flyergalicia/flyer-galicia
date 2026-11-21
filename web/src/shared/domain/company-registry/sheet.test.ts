import { describe, expect, it } from "vitest";
import { sanitizeFlyerOptions } from "../flyer-options.ts";
import { type Company, newCompany, sanitizeCategory } from "./company.ts";
import {
  categoryTextOfRow,
  companyOfSheetRow,
  crossedCap,
  isCashbackColumn,
  isCompanyColumn,
  isKnownColumn,
  SHEET_COLUMNS,
  SHEET_WIDTHS,
  sheetLines,
  templateCompanies,
} from "./sheet.ts";

const OPTIONS = sanitizeFlyerOptions([
  { n: 1 },
  { n: 4, nombre: "Combustible", solapa: "rubros" },
  { n: 5, nombre: "Supermercado", solapa: "rubros" },
  { n: 6, nombre: "Ambos", solapa: "rubros" },
]);

function company(fields: Partial<Company> = {}): Company {
  return { ...newCompany(), empresa: "ACME", ...fields };
}

function caps(cells: Record<string, string>) {
  return companyOfSheetRow({ empresa: "A", ...cells }, OPTIONS)?.rubro;
}

function lineOf(row: Company) {
  return sheetLines([row], OPTIONS)[1] ?? [];
}

describe("the columns of the sheet", () => {
  it("have their names, and the widths go with them", () => {
    expect(SHEET_COLUMNS.slice(0, 3)).toEqual(["empresa", "cuit", "config"]);
    expect(SHEET_COLUMNS).toContain("asesor4_email");
    expect(SHEET_COLUMNS.slice(-3)).toEqual(["rubro", "tope_combustible", "tope_supermercado"]);
    expect(SHEET_WIDTHS).toHaveLength(SHEET_COLUMNS.length);
  });

  it("are recognized by their clean names", () => {
    expect(isCompanyColumn("razonsocial")).toBe(true);
    expect(isCompanyColumn("cuit")).toBe(false);
    expect(isCashbackColumn("tipodecashback")).toBe(true);
    for (const known of ["asesor3celular", "cuit7", "tope2", "topesuper", "mail", "rubro"]) {
      expect(isKnownColumn(known)).toBe(true);
    }
    for (const unknown of ["asesor5nombre", "cuit11", "otra"]) {
      expect(isKnownColumn(unknown)).toBe(false);
    }
  });
});

describe("a row of the sheet", () => {
  it("is read whatever its headers say", () => {
    const row = companyOfSheetRow(
      {
        "RAZÓN SOCIAL": " ACME ",
        CUIT: "30-71111111-1, 30722222222",
        Cashback: "Config 2",
        "Asesor1_Nombre ": "Ana Perez",
        asesor1_celular: "11 4444 5555",
        asesor2_email: "x@y.z",
      },
      OPTIONS,
    );

    expect(row?.empresa).toBe("ACME");
    expect(row?.cuits).toEqual(["30711111111", "30722222222"]);
    expect(row?.config).toBe("Config 2");
    expect(row?.asesores[0]).toEqual({
      nombre: "Ana Perez",
      celular: "11 4444 5555",
      email: "",
    });
    expect(row?.asesores[1]?.email).toBe("x@y.z");
    expect(row?.asesores).toHaveLength(4);
  });

  it("the first officer also goes by the loose columns of the bulk sheet", () => {
    const row = companyOfSheetRow(
      { empresa: "A", nombre: "Ana", celular: "11", mail: "a@b.c" },
      OPTIONS,
    );

    expect(row?.asesores[0]).toEqual({ nombre: "Ana", celular: "11", email: "a@b.c" });
    expect(row?.asesores[1]?.nombre).toBe("");
  });

  it("the tax ids of numbered columns add up, without repeating", () => {
    const row = companyOfSheetRow(
      { empresa: "A", cuit: "307", cuit1: "307", cuit2: "308", cuit10: "309" },
      OPTIONS,
    );

    expect(row?.cuits).toEqual(["307", "308", "309"]);
  });

  it("without a name or a tax id it is an empty row", () => {
    expect(companyOfSheetRow({ config: "BAU" }, OPTIONS)).toBeNull();
    expect(companyOfSheetRow({ cuit: "307" }, OPTIONS)?.cuits).toEqual(["307"]);
  });

  it("no digit of a tax id or a phone changes on the way", () => {
    const row = companyOfSheetRow(
      { empresa: "A", cuit: 30_711_111_119, asesor1_nombre: "Ana", asesor1_celular: 1_144_445_555 },
      OPTIONS,
    );

    expect(row?.cuits).toEqual(["30711111119"]);
    expect(row?.asesores[0]?.celular).toBe("1144445555");
  });

  it("says what its category column said", () => {
    expect(categoryTextOfRow({ Beneficio: " Súper " })).toBe("Súper");
  });
});

describe("the caps of a row", () => {
  it("each named cap goes where its category says", () => {
    expect(caps({ rubro: "Combustible", tope_combustible: "24.000" })).toMatchObject({
      opcion: 4,
      importe: "24000",
      importe2: "",
    });
    expect(caps({ rubro: "Ambos", tope_combustible: "30000", tope_supermercado: "20000" })).toEqual(
      { opcion: 6, importe: "20000", importe2: "30000", txt: "Ambos" },
    );
  });

  it("a cap in the column of the other category is taken as its own", () => {
    expect(caps({ rubro: "Combustible", tope_supermercado: "24000" })?.importe).toBe("24000");
  });

  it("an old sheet is read the same", () => {
    expect(caps({ rubro: "Ambos", tope: "20000", tope2: "30000" })).toMatchObject({
      importe: "20000",
      importe2: "30000",
    });
    expect(caps({ importe: "1", importe2: "2" })).toMatchObject({ importe: "1", importe2: "2" });
  });

  it("without any it has none", () => {
    expect(caps({})).toEqual(sanitizeCategory(null));
  });
});

describe("a cap in the column of the other category", () => {
  const fuel = sanitizeCategory({ opcion: 4 });
  const grocery = sanitizeCategory({ opcion: 5 });

  it("is said, with its category", () => {
    expect(crossedCap({ tope_supermercado: "1" }, { rubro: fuel }, OPTIONS)).toBe("combustible");
    expect(crossedCap({ tope_combustible: "1" }, { rubro: grocery }, OPTIONS)).toBe("supermercado");
  });

  it("the right column, or both, say nothing", () => {
    expect(crossedCap({ tope_combustible: "1" }, { rubro: fuel }, OPTIONS)).toBe("");
    expect(
      crossedCap({ tope_combustible: "1", tope_supermercado: "1" }, { rubro: fuel }, OPTIONS),
    ).toBe("");
    expect(crossedCap({ tope_supermercado: "1" }, { rubro: grocery }, OPTIONS)).toBe("");
  });

  it("Ambos, or no category, have no other column", () => {
    const both = sanitizeCategory({ opcion: 6 });
    expect(crossedCap({ tope_supermercado: "1" }, { rubro: both }, OPTIONS)).toBe("");
    expect(crossedCap({ tope_supermercado: "1" }, { rubro: sanitizeCategory(null) }, OPTIONS)).toBe(
      "",
    );
  });
});

describe("what goes down", () => {
  it("starts with the columns", () => {
    expect(sheetLines([], OPTIONS)).toEqual([SHEET_COLUMNS]);
  });

  it("the tax ids go with their format, and the caps by their name", () => {
    const line = lineOf(
      company({
        cuits: ["30711111111", "307"],
        config: "BAU",
        rubro: sanitizeCategory({ opcion: 6, importe: "20000", importe2: "30000" }),
      }),
    );

    expect(line[1]).toBe("30-71111111-1, 307");
    expect(line.slice(-3)).toEqual(["Ambos", "30.000", "20.000"]);
  });

  it("a category without an option keeps its text", () => {
    const line = lineOf(company({ rubro: sanitizeCategory({ txt: "Premium" }) }));

    expect(line.at(-3)).toBe("Premium");
  });

  it("the number of an option that is gone reads as the first, as it does today", () => {
    const line = lineOf(company({ rubro: sanitizeCategory({ opcion: 99, txt: "Premium" }) }));

    expect(line.at(-3)).toBe("Opción 1");
  });

  it("a company with fewer officers still has every column", () => {
    const line = lineOf(company({ asesores: [] }));

    expect(line).toHaveLength(SHEET_COLUMNS.length);
    expect(line[3]).toBe("");
  });

  it("what goes down can go up and it is the same company", () => {
    const original = company({
      cuits: ["30711111111"],
      config: "Config 2",
      rubro: sanitizeCategory({ opcion: 5, importe: "15000", txt: "Supermercado" }),
    });
    const [head = [], line = []] = sheetLines([original], OPTIONS);
    const row = Object.fromEntries(head.map((key, at) => [key, line[at]]));
    const back = companyOfSheetRow(row, OPTIONS);

    expect(back?.rubro).toEqual(original.rubro);
    expect(back?.cuits).toEqual(original.cuits);
    expect(back?.config).toBe(original.config);
  });
});

describe("the template", () => {
  it("shows the columns in use, and how to mark no cashback", () => {
    const rows = templateCompanies((kind) => (kind === "ambos" ? 6 : 4));

    expect(rows.map(({ config }) => config)).toContain("SIN");
    expect(rows[0]?.rubro.opcion).toBe(4);
    expect(rows[1]?.rubro).toMatchObject({ opcion: 6, importe: "20000", importe2: "30000" });
  });
});
