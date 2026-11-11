import { describe, expect, it } from "vitest";
import {
  type Company,
  type CompanyOfficer,
  emptyOfficer,
  newCompany,
  sanitizeCategory,
} from "@/shared/domain/company-registry/index.ts";
import { richTextOf } from "@/shared/domain/rich-text.ts";
import { sanitizeFlyerOptions } from "@/shared/domain/flyer-options.ts";
import { changeOf, changeSignature, type FlyerForm } from "./company-changes.ts";

const CONTEXT = {
  options: sanitizeFlyerOptions([{ n: 1 }, { n: 4, nombre: "Combustible", solapa: "rubros" }]),
  cashbackNames: ["BAU", "Config 1"],
};
const ANA: CompanyOfficer = {
  nombre: "Ana Perez",
  celular: "11 1",
  email: "ana.perez@bancogalicia.com.ar",
};
const LUIS: CompanyOfficer = {
  nombre: "Luis Gomez",
  celular: "11 2",
  email: "otro@bancogalicia.com.ar",
};

function officers(...people: readonly CompanyOfficer[]): CompanyOfficer[] {
  return Array.from({ length: 4 }, (_, position) => people[position] ?? emptyOfficer());
}

const COMPANY: Company = {
  ...newCompany(),
  empresa: "ACME SA",
  config: "BAU",
  asesores: officers(ANA, LUIS),
};

function form(fields: Partial<FlyerForm> = {}): FlyerForm {
  return {
    empresa: "ACME SA",
    cashback: 0,
    officers: officers(ANA, LUIS),
    officersShown: true,
    category: null,
    ...fields,
  };
}

function lines(fields: Partial<FlyerForm>): string[] {
  return changeOf(COMPANY, form(fields), CONTEXT)?.lines.map(({ text }) => richTextOf(text)) ?? [];
}

describe("what a flyer changed against its company", () => {
  it("nothing changed is nothing to update", () => {
    expect(changeOf(COMPANY, form(), CONTEXT)).toBeNull();
  });

  it("another name is another company, and no name is nothing", () => {
    expect(changeOf(COMPANY, form({ empresa: "ACME GRUPO" }), CONTEXT)).toBeNull();
    expect(changeOf({ ...COMPANY, empresa: "" }, form({ empresa: " " }), CONTEXT)).toBeNull();
    expect(changeOf(COMPANY, form({ empresa: " acme sa ", cashback: 1 }), CONTEXT)).not.toBeNull();
  });

  it("says the cashback", () => {
    expect(lines({ cashback: 1 })).toEqual(["Cashback: BAU → Config 1"]);
    expect(lines({ cashback: -1 })).toEqual(["Cashback: BAU → Sin cashback"]);
  });

  it("says each officer that changes", () => {
    expect(lines({ officers: officers({ ...ANA, nombre: "Ana Maria" }, LUIS) })).toEqual([
      "Oficial 1: Ana Perez → Ana Maria",
    ]);
    expect(lines({ officers: officers({ ...ANA, celular: "11 9" }, LUIS) })).toEqual([
      "Oficial 1 · celular: 11 1 → 11 9",
    ]);
    expect(lines({ officers: officers({ ...ANA, celular: "" }, LUIS) })).toEqual([
      "Oficial 1 · celular: 11 1 → (vacío)",
    ]);
    expect(lines({ officers: officers({ ...ANA, email: "x@y.z" }, LUIS) })).toEqual([
      "Oficial 1 · mail: ana.perez@bancogalicia.com.ar → x@y.z",
    ]);
  });

  it("one that comes and one that goes, this one marked", () => {
    const change = changeOf(COMPANY, form({ officers: officers(ANA) }), CONTEXT);
    expect(change?.lines.map(({ text, removal }) => [richTextOf(text), removal])).toEqual([
      ["Oficial 2: − Luis Gomez (se quita)", true],
    ]);
    expect(lines({ officers: officers(ANA, LUIS, { ...emptyOfficer(), nombre: "Sol" }) })).toEqual([
      "Oficial 3: + Sol",
    ]);
  });

  it("a mail deduced from the name is not a change", () => {
    const company = { ...COMPANY, asesores: officers({ ...ANA, email: "" }) };
    const change = changeOf(company, form({ officers: officers(ANA) }), CONTEXT);

    expect(change).toBeNull();
    const withPhone = changeOf(
      company,
      form({ officers: officers({ ...ANA, celular: "11 9" }) }),
      CONTEXT,
    );
    expect(withPhone?.officers[0]?.email, "and it is not saved either").toBe("");
  });

  it("in Rubros it looks at the category; anywhere else it is not touched", () => {
    const category = sanitizeCategory({ opcion: 4, importe: "24000" });
    const change = changeOf(COMPANY, form({ category }), CONTEXT);

    expect(change?.lines.map(({ text }) => richTextOf(text))).toEqual([
      "Rubro: — → Combustible · $24.000",
    ]);
    expect(change?.categoryChanged).toBe(true);
    expect(change?.category).toEqual(category);

    const same = { ...COMPANY, rubro: category };
    expect(changeOf(same, form({ category }), CONTEXT)).toBeNull();
    expect(changeOf(same, form({ cashback: 1 }), CONTEXT)?.category, "kept").toEqual(category);
    expect(
      changeOf(same, form({ category: sanitizeCategory({ opcion: 4, importe: "1" }) }), CONTEXT)
        ?.lines[0],
    ).toEqual({
      text: ["Rubro: Combustible · $24.000 → ", { strong: "Combustible · $1" }],
    });
  });

  it("tells what the company ends up with", () => {
    const change = changeOf(COMPANY, form({ cashback: -1 }), CONTEXT);

    expect(change?.config).toBe("");
    expect(change?.cashbackChanged).toBe(true);
    expect(change?.categoryChanged).toBe(false);
    expect(change?.officers[1]).toEqual(LUIS);
  });

  it("fewer places than four are empty places", () => {
    expect(changeOf({ ...COMPANY, asesores: [] }, form({ officers: [] }), CONTEXT)).toBeNull();
    const change = changeOf({ ...COMPANY, asesores: [] }, form({ officers: [ANA] }), CONTEXT);
    expect(change?.lines).toHaveLength(1);
  });

  it("the same change has the same signature, another change has another", () => {
    const one = changeOf(COMPANY, form({ cashback: 1 }), CONTEXT);
    const again = changeOf(COMPANY, form({ cashback: 1 }), CONTEXT);
    const other = changeOf(COMPANY, form({ cashback: -1 }), CONTEXT);
    if (!one || !again || !other) throw new Error("There should be changes");

    expect(changeSignature(one)).toBe(changeSignature(again));
    expect(changeSignature(one)).not.toBe(changeSignature(other));
  });
});
