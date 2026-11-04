import { describe, expect, it, vi } from "vitest";
import { sanitizeFlyerOptions } from "@/shared/domain/flyer-options.ts";
import type { SheetApi, SheetCells } from "@/shared/lib/sheet-library.ts";
import { newCompany } from "@/shared/domain/company-registry/index.ts";
import {
  advisorsOfSheet,
  downloadAdvisors,
  downloadAdvisorTemplate,
  downloadCompanies,
  downloadCompanyTemplate,
} from "./company-sheets.ts";

function fakeApi() {
  const sheets: { lines: SheetCells; name: string; widths: unknown }[] = [];
  const content = new WeakMap<object, SheetCells>();
  const files: string[] = [];
  const api: SheetApi = {
    read: vi.fn<SheetApi["read"]>(),
    writeFile: (_book, name) => {
      files.push(name);
    },
    utils: {
      book_new: () => ({ SheetNames: [], Sheets: {} }),
      book_append_sheet: (_book, sheet, name) => {
        sheets.push({ lines: content.get(sheet) ?? [], name, widths: sheet["!cols"] });
      },
      aoa_to_sheet: (lines) => {
        const sheet = {};
        content.set(sheet, lines);
        return sheet;
      },
      sheet_to_json: () => [],
    },
  };
  return { api, sheets, files };
}

const OPTIONS = sanitizeFlyerOptions([{ n: 1 }, { n: 4, nombre: "Combustible", solapa: "rubros" }]);

describe("what goes down", () => {
  it("the companies with their columns", () => {
    const { api, sheets, files } = fakeApi();

    downloadCompanies(api, [{ ...newCompany(), empresa: "ACME" }], OPTIONS, "x.xlsx");

    expect(files).toEqual(["x.xlsx"]);
    expect(sheets[0]?.name).toBe("Empresas");
    const lines = sheets[0]?.lines ?? [];
    expect(lines[0]?.[0]).toBe("empresa");
    expect(lines[1]?.[0]).toBe("ACME");
  });

  it("the template, with the flyer in force of each category", () => {
    const { api, sheets, files } = fakeApi();

    downloadCompanyTemplate(api, OPTIONS);

    expect(files).toEqual(["Plantilla_Empresas_Galicia.xlsx"]);
    const lines = sheets[0]?.lines ?? [];
    expect(lines[1]?.at(-3)).toBe("Combustible");
    expect(lines[2]?.at(-3)).toBe("Ambos");
    expect(lines.some((line) => line[2] === "SIN")).toBe(true);
  });

  it("the advisors, with the column that is optional first", () => {
    const { api, sheets, files } = fakeApi();

    downloadAdvisors(api, [
      { id: "a", name: "Ana", nombre: "Ana P", celular: "11", email: "a@b.c" },
    ]);
    downloadAdvisorTemplate(api);

    expect(files).toEqual(["Mis_Asesores_Galicia.xlsx", "Plantilla_Asesores_Galicia.xlsx"]);
    expect(sheets[0]?.lines).toEqual([
      ["guardar_como", "nombre", "celular", "email"],
      ["Ana", "Ana P", "11", "a@b.c"],
    ]);
    expect(sheets[0]?.name).toBe("Asesores");
  });
});

describe("what goes up to Mis asesores", () => {
  it("goes by several names of columns", () => {
    const [advisor] = advisorsOfSheet([
      { guardar_como: "Rótulo", Nombre: " Ana ", Celular: 1_144_445_555, Email: "a@b.c" },
    ]);

    expect(advisor).toMatchObject({
      name: "Rótulo",
      nombre: "Ana",
      celular: "1144445555",
      email: "a@b.c",
    });
  });

  it("without a label, its name; and the second officer of the bulk sheet too", () => {
    const rows = advisorsOfSheet([
      {
        asesor1_nombre: "Uno",
        asesor1_celular: "1",
        asesor1_email: "u@b.c",
        asesor2_nombre: "Dos",
        asesor2_celular: "2",
        asesor2_email: "d@b.c",
      },
    ]);

    expect(rows.map(({ name, nombre, celular, email }) => [name, nombre, celular, email])).toEqual([
      ["Uno", "Uno", "1", "u@b.c"],
      ["Dos", "Dos", "2", "d@b.c"],
    ]);
    expect(rows[1]?.id).toMatch(/b$/);
  });

  it("the last row of the sheet goes on top, as they arrive", () => {
    const rows = advisorsOfSheet([{ nombre: "Primero" }, { nombre: "Segundo" }]);

    expect(rows.map(({ nombre }) => nombre)).toEqual(["Segundo", "Primero"]);
  });

  it("a row without a name is nobody", () => {
    expect(advisorsOfSheet([{ celular: "11" }])).toEqual([]);
  });
});
