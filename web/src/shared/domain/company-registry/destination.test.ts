import { describe, expect, it } from "vitest";
import { sanitizeFlyerOptions } from "../flyer-options.ts";
import { type Company, emptyOfficer, newCompany, sanitizeCategory } from "./company.ts";
import {
  type DestinationRules,
  destinationLabel,
  destinationOf,
  destinationWarnings,
  versionWithoutCashback,
} from "./destination.ts";

const OPTIONS = sanitizeFlyerOptions([
  { n: 1, nombre: "General" },
  { n: 2, nombre: "Otra general" },
  { n: 3, nombre: "General sin cashback", sinCB: 2 },
  { n: 4, nombre: "Combustible", solapa: "rubros" },
  { n: 5, nombre: "Combustible sin cashback", solapa: "rubros", rubro: "ninguno", sinCB: 4 },
]);

function rules(fields: Partial<DestinationRules> = {}): DestinationRules {
  return {
    options: OPTIONS,
    cashbackNames: ["BAU", "Config 1"],
    can: () => true,
    tabLabel: (tab) => `Solapa ${tab}`,
    hasFlyer: () => undefined,
    ...fields,
  };
}

function company(fields: Partial<Company> = {}): Company {
  return {
    ...newCompany(),
    empresa: "ACME",
    config: "BAU",
    asesores: [{ ...emptyOfficer(), nombre: "Ana" }],
    ...fields,
  };
}

const FUEL = sanitizeCategory({ opcion: 4, importe: "24000" });

describe("the flyer of a company", () => {
  it("with a category, the flyer in force of its category", () => {
    expect(destinationOf(company({ rubro: FUEL }), rules())).toBe(4);
  });

  it("without one, the general flyer in force: the highest of what this profile has", () => {
    expect(destinationOf(company(), rules())).toBe(2);
    expect(
      destinationOf(company(), rules({ can: (key) => key === "opcion_1" })),
      "only option 1",
    ).toBe(1);
  });

  it("the options known to have no image do not count, unless there is nothing else", () => {
    expect(destinationOf(company(), rules({ hasFlyer: (n) => n !== 2 }))).toBe(1);
    expect(destinationOf(company(), rules({ hasFlyer: () => false }))).toBe(2);
  });

  it("without any option at all, zero", () => {
    expect(destinationOf(company(), rules({ can: () => false }))).toBe(0);
  });

  it("a category the profile does not have is negative", () => {
    expect(
      destinationOf(company({ rubro: FUEL }), rules({ can: (key) => key !== "opcion_4" })),
    ).toBe(-4);
  });

  it("a flyer that is gone is negative too", () => {
    const options = sanitizeFlyerOptions([{ n: 1 }]);
    expect(
      destinationOf(company({ rubro: sanitizeCategory({ opcion: 9 }) }), rules({ options })),
    ).toBe(-9);
  });

  it("without cashback, its version without cashback if there is one", () => {
    expect(destinationOf(company({ rubro: FUEL, config: "SIN" }), rules())).toBe(5);
    expect(destinationOf(company({ config: "" }), rules()), "of the general one").toBe(3);
    expect(
      destinationOf(company({ rubro: FUEL, config: "SIN" }), rules({ hasFlyer: (n) => n !== 5 })),
      "that one has no image",
    ).toBe(4);
    expect(
      destinationOf(
        company({ rubro: FUEL, config: "SIN" }),
        rules({ can: (k) => k !== "opcion_5" }),
      ),
      "this profile does not have it",
    ).toBe(4);
  });

  it("nothing is the version of nothing", () => {
    expect(versionWithoutCashback(0, rules())).toBe(0);
  });
});

describe("what is said of its flyer", () => {
  it("its tab and its name, or that there is none", () => {
    expect(destinationLabel(4, rules())).toBe("Solapa rubros · Combustible");
    expect(destinationLabel(1, rules())).toBe("Solapa flyer · General");
    expect(destinationLabel(0, rules())).toBe("sin formato disponible");
    expect(destinationLabel(-4, rules())).toBe("sin formato disponible");
  });

  it("warns about a category not enabled, and a flyer that is gone", () => {
    expect(destinationWarnings(company(), -4, rules())).toEqual([
      "rubro «Combustible» no habilitado para tu perfil",
    ]);
    expect(destinationWarnings(company(), -9, rules())).toEqual([
      "el flyer de su rubro ya no está: revisá el rubro de esta empresa",
    ]);
    expect(destinationWarnings(company(), 0, rules())).toEqual(["sin opción habilitada"]);
  });

  it("warns about what is missing in the company", () => {
    expect(destinationWarnings(company({ asesores: [] }), 1, rules())).toEqual(["sin oficiales"]);
    expect(destinationWarnings(company({ config: "" }), 1, rules())).toEqual(["sin cashback"]);
    expect(
      destinationWarnings(company({ rubro: sanitizeCategory({ opcion: 4 }) }), 4, rules()),
    ).toEqual(["sin tope (se usa el del formulario o $24.000)"]);
    expect(destinationWarnings(company({ rubro: FUEL }), 4, rules())).toEqual([]);
  });
});
