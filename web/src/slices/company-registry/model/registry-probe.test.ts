import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { newCompany, sanitizeCategory } from "@/shared/domain/company-registry/index.ts";
import { sanitizeFlyerOptions } from "@/shared/domain/flyer-options.ts";
import { COMPANIES_QUERY_KEY } from "../api/companies.ts";
import { CLOSED_EDITOR, companyEditorReducer } from "./company-editor.ts";
import { companyListProbe, type ProbeSources, registryProbe } from "./registry-probe.ts";

const OPTIONS = sanitizeFlyerOptions([{ n: 1 }, { n: 4, nombre: "Combustible", solapa: "rubros" }]);
const context = { options: OPTIONS, cashbackNames: ["BAU"] };

function sources(fields: Partial<ProbeSources> = {}): ProbeSources {
  return {
    editor: CLOSED_EDITOR,
    context,
    rules: {
      ...context,
      can: () => true,
      tabLabel: (tab) => tab,
      hasFlyer: () => undefined,
    },
    ...fields,
  };
}

function probe(fields: Partial<ProbeSources> = {}) {
  const queryClient = new QueryClient();
  return {
    queryClient,
    reading: registryProbe(queryClient, "u", () => sources(fields)),
  };
}

const KEY = [...COMPANIES_QUERY_KEY, "u"];

describe("what a test can read", () => {
  it("how many companies there are, and whether reading them failed", async () => {
    const { queryClient, reading } = probe();
    expect(reading.ownCompanyCount()).toBe(0);
    expect(reading.companiesFailed()).toBe(false);

    queryClient.setQueryData(KEY, { rows: [newCompany()], updatedAt: "" });
    expect(reading.ownCompanyCount()).toBe(1);

    await queryClient
      .fetchQuery({ queryKey: KEY, queryFn: () => Promise.reject(new Error("corte")) })
      .catch(() => undefined);
    expect(reading.companiesFailed()).toBe(true);
  });

  it("the category of a row of the editor", () => {
    const category = sanitizeCategory({ opcion: 4, importe: "1" });
    const editor = companyEditorReducer(CLOSED_EDITOR, {
      type: "open",
      rows: [{ ...newCompany(), rubro: category }],
    });
    const { reading } = probe({ editor });

    expect(reading.editorCategory(0)).toEqual(category);
    expect(reading.editorCategory(9)).toEqual(sanitizeCategory(null));
  });

  it("which flyer a company would go to", () => {
    const { reading } = probe();

    expect(reading.destinationOption({ empresa: "A", config: "BAU", rubro: { opcion: 4 } })).toBe(
      4,
    );
    expect(reading.destinationOption(null)).toBe(0);
  });

  it("what the sheet rules say about a row", () => {
    const { reading } = probe();

    expect(reading.sheetColumns()).toContain("tope_supermercado");
    expect(reading.capsOfSheetRow({ empresa: "A", tope: "1" }).importe).toBe("1");
    expect(reading.capsOfSheetRow({})).toEqual(sanitizeCategory(null));
  });

  it("goes down and up without changing a cap", () => {
    const { reading } = probe();

    const sheet = reading.exportAndReadBack([
      { empresa: "A", rubro: { opcion: 4, importe: "24000", txt: "Combustible" } },
    ]);
    expect(sheet.cells).toEqual([["Combustible", "24.000", ""]]);
    expect(sheet.unchanged).toEqual([true]);
  });

  it("the report of a sheet, in plain words, with the row the reader says", () => {
    const { reading } = probe();

    const report = reading.validateSheet([
      { cells: { empresa: "A", config: "BAU", cuit: "307" }, readerRow: 41 },
      { cells: { empresa: "B", config: "BAU" } },
    ]);
    expect(report.firstCompanyCap).toBe("");
    expect(report.problems.join(" ")).toMatch(/1 CUIT sin 11 dígitos: fila 42/);
    expect(reading.validateSheet([]).firstCompanyCap).toBe("");
  });
});

describe("what a test reads of the list wherever it is used", () => {
  it("with no list yet there is nothing; and of a company, what it has", () => {
    const queryClient = new QueryClient();
    const list = companyListProbe(queryClient, "u");
    expect(list.ownCompanyCount()).toBe(0);
    expect(list.ownCompany(0)).toEqual({ config: "", firstOfficer: undefined });
    queryClient.setQueryData(KEY, {
      rows: [{ ...newCompany(), empresa: "ACME", config: "BAU", asesores: [{ nombre: "Ana" }] }],
    });
    expect(list.ownCompanyCount()).toBe(1);
    expect(list.ownCompany(0)).toEqual({ config: "BAU", firstOfficer: "Ana" });
  });
});
