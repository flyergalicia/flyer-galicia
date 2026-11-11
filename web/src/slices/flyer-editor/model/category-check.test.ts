import { describe, expect, it } from "vitest";
import { sanitizeCompanies } from "@/shared/domain/company-registry/index.ts";
import { sanitizeFlyerOptions } from "@/shared/domain/flyer-options.ts";
import { baseOption, categoryWarning } from "./category-check.ts";

const OPTIONS = sanitizeFlyerOptions([
  { n: 1, nombre: "General", solapa: "flyer" },
  { n: 5, nombre: "General sin cashback", solapa: "flyer", sinCB: 1 },
  { n: 8, nombre: "Combustible", solapa: "rubros", rubro: "combustible" },
  { n: 9, nombre: "Súper", solapa: "rubros", rubro: "supermercado" },
  { n: 7, nombre: "Combustible sin cashback", solapa: "rubros", sinCB: 8, rubro: "ninguno" },
  { n: 6, nombre: "Huérfana", solapa: "flyer", sinCB: 44 },
]);

function company(rubro: Record<string, unknown>) {
  const [clean] = sanitizeCompanies([{ empresa: "ACME SA", cuits: [], config: "BAU", rubro }]);
  if (!clean) throw new Error("It has no name");
  return clean;
}

const ALL = () => true;
const WITHOUT_FUEL = (key: string) => key !== "opcion_8";
const rules = (option: number, tab: "flyer" | "rubros", can: (key: string) => boolean = ALL) => ({
  options: OPTIONS,
  can,
  option,
  tab,
});

describe("the flyer of the wrong category", () => {
  it("says nothing with no category in Flyer Galicia", () => {
    expect(categoryWarning(company({}), rules(1, "flyer"))).toBeNull();
  });

  it("says nothing on the flyer of its category", () => {
    expect(categoryWarning(company({ opcion: 8 }), rules(8, "rubros"))).toBeNull();
  });

  it("the version without cashback is the same one", () => {
    expect(categoryWarning(company({ opcion: 8 }), rules(7, "rubros"))).toBeNull();
  });

  it("with a category on another flyer, it says which one", () => {
    expect(categoryWarning(company({ opcion: 8 }), rules(1, "flyer"))).toEqual({
      wanted: 8,
      signature: "acme sa|8|1",
    });
    expect(categoryWarning(company({ opcion: 9 }), rules(8, "rubros"))?.wanted).toBe(9);
  });

  it("with no category on Rubros, it says so", () => {
    expect(categoryWarning(company({}), rules(8, "rubros"))?.wanted).toBe(0);
  });

  it("a flyer this profile does not have is as if it had no category", () => {
    expect(categoryWarning(company({ opcion: 8 }), rules(1, "flyer", WITHOUT_FUEL))).toBeNull();
    expect(categoryWarning(company({ opcion: 8 }), rules(9, "rubros", WITHOUT_FUEL))?.wanted).toBe(
      0,
    );
  });
});

describe("the real option of a version without cashback", () => {
  it("is the one it says, if it exists", () => {
    expect(baseOption(5, OPTIONS)).toBe(1);
    expect(baseOption(1, OPTIONS)).toBe(1);
    expect(baseOption(6, OPTIONS), "the other one is gone").toBe(6);
    expect(baseOption(99, OPTIONS)).toBe(99);
  });
});
