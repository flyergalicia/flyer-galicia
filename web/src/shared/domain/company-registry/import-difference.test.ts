import { describe, expect, it } from "vitest";
import { sanitizeFlyerOptions } from "../flyer-options.ts";
import { type Company, emptyOfficer, newCompany, sanitizeCategory } from "./company.ts";
import { companyLabel, importDifference } from "./import-difference.ts";

const CONTEXT = {
  options: sanitizeFlyerOptions([{ n: 1 }, { n: 4, nombre: "Combustible", solapa: "rubros" }]),
  cashbackNames: ["BAU", "Config 1"],
};

function company(empresa: string, fields: Partial<Company> = {}): Company {
  return { ...newCompany(), empresa, config: "BAU", ...fields };
}

function mail(email: string) {
  return [{ ...emptyOfficer(), email }];
}

function difference(current: readonly Company[], incoming: readonly Company[]) {
  return importDifference(current, incoming, CONTEXT);
}

describe("what a sheet would change", () => {
  it("what goes, enters, changes and stays", () => {
    const found = difference(
      [company("ACME"), company("BETA"), company("GAMA")],
      [company("ACME", { config: "Config 1" }), company("BETA"), company("NUEVA")],
    );

    expect(found.leaving).toEqual(["GAMA"]);
    expect(found.entering).toEqual(["NUEVA"]);
    expect(found.changing).toEqual([{ empresa: "ACME", que: ["cashback"] }]);
    expect(found.same).toBe(1);
    expect(found.current).toBe(3);
    expect(found.incoming).toBe(3);
    expect(found.hasChanges).toBe(true);
  });

  it("the same sheet changes nothing", () => {
    const found = difference([company("ACME")], [company("acme")]);

    expect(found.hasChanges).toBe(false);
    expect(found.same).toBe(1);
  });

  it("each thing that changed is named", () => {
    const officer = { ...emptyOfficer(), nombre: "Ana" };
    const found = difference(
      [company("ACME", { cuits: ["2", "1"] })],
      [
        company("ACME", {
          cuits: ["1"],
          asesores: [officer],
          rubro: sanitizeCategory({ opcion: 4 }),
        }),
      ],
    );

    expect(found.changing[0]?.que).toEqual(["CUIT", "oficial 1", "rubro"]);
  });

  it("the order of the tax ids and the capitals of a mail are not a change", () => {
    const found = difference(
      [company("ACME", { cuits: ["1", "2"], asesores: mail("a@b.c") })],
      [company("ACME", { cuits: ["2", "1"], asesores: mail("A@B.C") })],
    );

    expect(found.hasChanges).toBe(false);
  });

  it("the razón social is the key: the same tax id on another name is another company", () => {
    const found = difference(
      [company("ACME", { cuits: ["30711111111"] })],
      [company("ACME GRUPO", { cuits: ["30711111111"] })],
    );

    expect(found.leaving).toEqual(["ACME"]);
    expect(found.entering).toEqual(["ACME GRUPO"]);
  });

  it("without a name, the tax id tells them apart", () => {
    const found = difference([company("", { cuits: ["307"] })], [company("", { cuits: ["308"] })]);

    expect(found.leaving).toEqual(["(sin razón social) 307"]);
    expect(found.entering).toEqual(["(sin razón social) 308"]);
  });

  it("a repeated name that changes how many times it is there says so", () => {
    const found = difference([company("ACME")], [company("ACME"), company("ACME")]);

    expect(found.changing).toEqual([{ empresa: "ACME", que: ["figura 2 veces (antes 1)"] }]);
  });

  it("repeated names are compared one by one", () => {
    const found = difference(
      [company("ACME"), company("ACME")],
      [company("ACME"), company("ACME", { config: "Config 1" })],
    );

    expect(found.same).toBe(1);
    expect(found.changing).toHaveLength(1);
  });
});

describe("how a company is called in the summary", () => {
  it("by its name, or by its tax ids", () => {
    expect(companyLabel({ empresa: "ACME", cuits: [] })).toBe("ACME");
    expect(companyLabel({ empresa: "", cuits: ["30711111111"] })).toBe(
      "(sin razón social) 30-71111111-1",
    );
  });
});
