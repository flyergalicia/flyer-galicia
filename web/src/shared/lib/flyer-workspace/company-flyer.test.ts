import { describe, expect, it } from "vitest";
import { type Company, DEFAULT_CASHBACK_CONFIGS } from "@/shared/domain/company-registry/index.ts";
import { companyFlyer, type CompanyFlyerContext } from "./company-flyer.ts";

const NAMES = DEFAULT_CASHBACK_CONFIGS.map(({ nombre }) => nombre);
const CONTEXT: CompanyFlyerContext = {
  configs: DEFAULT_CASHBACK_CONFIGS,
  names: NAMES,
  legal: "Legal de la opción",
  singleCashback: false,
  hasBenefit: false,
  formCap: "$24.000",
};
const NOBODY = { nombre: "", celular: "", email: "" };

function company(fields: Partial<Company> = {}): Company {
  return {
    empresa: "ACME",
    cuits: [],
    config: "BAU",
    asesores: [{ nombre: "Ana Perez", celular: "11 4444 5555", email: "ana@x.com" }, NOBODY],
    rubro: { opcion: 0, importe: "", importe2: "", txt: "" },
    ...fields,
  };
}

describe("the flyer of a company of the list", () => {
  it("takes its amounts from its cashback, and its legal from the flyer", () => {
    const { values, hasNoCashback } = companyFlyer(company({ config: "Config 1" }), CONTEXT);
    expect(values).toMatchObject({
      empresa: "ACME",
      nocb: false,
      m1: "$350.000",
      m4: "$30.000",
      legal: "Legal de la opción",
      cashUnico: false,
    });
    expect(hasNoCashback).toBe(false);
  });

  it.each(["", "SIN", "cualquier cosa"])("a cashback of %j comes out without amounts", (config) => {
    const { values, hasNoCashback } = companyFlyer(company({ config }), CONTEXT);
    expect(values.nocb).toBe(true);
    expect(hasNoCashback).toBe(true);
  });

  it("writes each officer, with the mark of the phone, and only the ones that have a name", () => {
    const { values, hasNoOfficers } = companyFlyer(company(), CONTEXT);
    expect(values).toMatchObject({
      has1: true,
      nombre: "Ana Perez",
      celular: "Cel: 11 4444 5555",
      email: "ana@x.com",
      has2: false,
      nombre2: "",
      celular2: "",
      email2: "",
    });
    expect(hasNoOfficers).toBe(false);
  });

  it("an officer with no mail gets the one of the bank, from the name", () => {
    const { values } = companyFlyer(
      company({ asesores: [{ nombre: "Ana Perez", celular: "", email: "" }] }),
      CONTEXT,
    );
    expect(values.email).toMatch(/@bancogalicia\.com\.ar$/);
    expect(values.celular).toBe("");
  });

  it("knows when nobody is assigned", () => {
    const { values, hasNoOfficers } = companyFlyer(company({ asesores: [] }), CONTEXT);
    expect(hasNoOfficers).toBe(true);
    expect(values.has1).toBe(false);
  });

  it("nothing of the sign goes on a flyer without one", () => {
    const { values, usedFormCap } = companyFlyer(company(), CONTEXT);
    expect(values.benef).toBeUndefined();
    expect(usedFormCap).toBe(false);
  });

  it("on a flyer with a sign, its own caps", () => {
    const { values, usedFormCap } = companyFlyer(
      company({ rubro: { opcion: 8, importe: "30000", importe2: "45000", txt: "" } }),
      { ...CONTEXT, hasBenefit: true },
    );
    expect(values).toMatchObject({
      benef: true,
      benefNombre: "ACME",
      importe: "$30.000",
      importe2: "$45.000",
    });
    expect(usedFormCap).toBe(false);
  });

  it("with no cap of its own it takes the one of the form, and it says so", () => {
    const { values, usedFormCap } = companyFlyer(company(), { ...CONTEXT, hasBenefit: true });
    expect(values).toMatchObject({ importe: "$24.000", importe2: "$24.000" });
    expect(usedFormCap).toBe(true);
  });

  it("the second cap is the first one when it has none", () => {
    const { values } = companyFlyer(
      company({ rubro: { opcion: 8, importe: "30000", importe2: "", txt: "" } }),
      { ...CONTEXT, hasBenefit: true },
    );
    expect(values.importe2).toBe("$30.000");
  });

  it("a list of configurations with nothing in it does not break anything", () => {
    const { values } = companyFlyer(company(), { ...CONTEXT, configs: [] });
    expect(values.m1).toBeNull();
  });
});
