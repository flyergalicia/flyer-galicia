import { describe, expect, it } from "vitest";
import { type Company, sanitizeCompanies } from "@/shared/domain/company-registry/index.ts";
import { sanitizeFlyerOptions } from "@/shared/domain/flyer-options.ts";
import {
  CATEGORY_FLYER_NOT_ENABLED,
  CATEGORY_NOT_KNOWN,
  companyKey,
  flyerLabel,
  flyerOfCompany,
  flyerWarnings,
  type HunterFlyerRules,
  NO_FLYER_ENABLED,
  officerNames,
} from "./company-flyer-rules.ts";

const OPTIONS = sanitizeFlyerOptions([
  { n: 1, nombre: "Opción 1", solapa: "flyer" },
  { n: 9, nombre: "General", solapa: "flyer" },
  { n: 10, nombre: "General nuevo", solapa: "flyer", reemplaza: 9 },
  { n: 8, nombre: "Combustible viejo", solapa: "rubros" },
  { n: 11, nombre: "Combustible nuevo", solapa: "rubros", reemplaza: 8 },
  { n: 12, nombre: "Súper", solapa: "rubros" },
  { n: 13, nombre: "Otra cosa", solapa: "rubros" },
]);

function rules(
  usable: readonly number[],
  known: Readonly<Record<number, boolean>> = {},
): HunterFlyerRules {
  return {
    options: OPTIONS,
    cashbackNames: ["BAU", "Plus"],
    can: (key) => usable.includes(Number(key.replace("opcion_", ""))),
    tabLabel: (tab) => (tab === "flyer" ? "Flyer Galicia" : "Rubros"),
    hasFlyer: (option) => known[option] ?? usable.includes(option),
  };
}

function company(fields: object = {}): Company {
  const [row] = sanitizeCompanies([
    { empresa: "ACME SA", config: "BAU", asesores: [{ nombre: "Ana" }], ...fields },
  ]);
  if (!row) throw new Error("It should be a company");
  return row;
}

describe("which flyer a company gets", () => {
  it("with no category, the one in force among the general ones it can use", () => {
    expect(flyerOfCompany(company(), rules([9, 10]))).toBe(10);
    expect(flyerOfCompany(company(), rules([9]))).toBe(9);
  });

  it("an option that is not enabled is not used, even if it has a flyer", () => {
    expect(flyerOfCompany(company(), rules([], { 9: true }))).toBe(NO_FLYER_ENABLED);
    const fuel = company({ rubro: { opcion: 8 } });
    expect(flyerOfCompany(fuel, rules([], { 8: true, 11: true }))).toBe(CATEGORY_FLYER_NOT_ENABLED);
  });

  it("an option with no flyer is not used, even if it is enabled", () => {
    expect(flyerOfCompany(company(), rules([9], { 9: false }))).toBe(NO_FLYER_ENABLED);
  });

  it("one that nobody could answer for is not used either: only a firm yes counts", () => {
    const unknown = { ...rules([9]), hasFlyer: () => undefined };
    expect(flyerOfCompany(company(), unknown)).toBe(NO_FLYER_ENABLED);
  });

  it("with a category, the one in force of that category", () => {
    const fuel = company({ rubro: { opcion: 8 } });
    expect(flyerOfCompany(fuel, rules([8, 11, 9]))).toBe(11);
    expect(flyerOfCompany(fuel, rules([8, 9]))).toBe(8);
  });

  it("with its flyer not enabled, it never takes the general one", () => {
    const fuel = company({ rubro: { opcion: 8 } });
    expect(flyerOfCompany(fuel, rules([9]))).toBe(CATEGORY_FLYER_NOT_ENABLED);
  });

  it("the category is also told by the text it was loaded with", () => {
    const grocery = company({ rubro: { opcion: 99, txt: "Súper" } });
    expect(flyerOfCompany(grocery, rules([12]))).toBe(12);
  });

  it("a category of which nothing can be told is not guessed with the general flyer", () => {
    const strange = company({ rubro: { opcion: 99, txt: "Una que ya no existe" } });
    expect(flyerOfCompany(strange, rules([9, 13]))).toBe(CATEGORY_NOT_KNOWN);
  });
});

describe("what the row says", () => {
  it("the tab and the flyer, and only one if they are the same", () => {
    expect(flyerLabel(9, rules([9]))).toBe("Flyer Galicia · General");
    const sameName = { ...rules([9]), tabLabel: () => "General" };
    expect(flyerLabel(9, sameName)).toBe("General");
  });

  it("why there is no flyer", () => {
    const some = rules([9]);
    expect(flyerLabel(CATEGORY_FLYER_NOT_ENABLED, some)).toBe("sin flyer para su rubro");
    expect(flyerLabel(CATEGORY_NOT_KNOWN, some)).toBe("rubro sin identificar");
    expect(flyerLabel(NO_FLYER_ENABLED, some)).toBe("sin flyer habilitado");
    expect(flyerWarnings(company(), CATEGORY_FLYER_NOT_ENABLED, some)).toEqual([
      "el flyer del rubro de esta empresa no está habilitado para tu perfil o todavía no está cargado",
    ]);
    expect(flyerWarnings(company(), CATEGORY_NOT_KNOWN, some)).toEqual([
      "no se puede saber de qué rubro es: hay que revisarla en la base de datos",
    ]);
    expect(flyerWarnings(company(), NO_FLYER_ENABLED, some)).toEqual([
      "no hay ningún flyer habilitado para tu perfil",
    ]);
  });

  it("what is missing from a flyer that comes out", () => {
    const some = rules([9, 11]);
    expect(flyerWarnings(company(), 9, some)).toEqual([]);
    expect(flyerWarnings(company({ asesores: [] }), 9, some)).toEqual([
      "el flyer sale sin datos de contacto",
    ]);
    expect(flyerWarnings(company({ config: "SIN" }), 9, some)).toEqual([
      "sin cashback: sale sin importes",
    ]);
    expect(flyerWarnings(company(), 11, some)).toEqual(["sin tope cargado: sale $24.000"]);
    expect(flyerWarnings(company({ rubro: { importe: "30000" } }), 11, some)).toEqual([]);
  });

  it("the officers by name", () => {
    const two = company({ asesores: [{ nombre: "Ana" }, { nombre: " " }, { nombre: "Luis" }] });
    expect(officerNames(two)).toBe("Ana  ·  Luis");
    expect(officerNames(company({ asesores: [] }))).toBe("sin oficiales asignados");
  });

  it("the same razón social of two owners are two rows", () => {
    expect(companyKey(company({ user_id: "a" }))).not.toBe(companyKey(company({ user_id: "b" })));
    expect(companyKey(company())).toBe("|ACME SA");
  });
});
