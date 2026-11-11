import { describe, expect, it } from "vitest";
import { sanitizeFlyerOptions } from "../flyer-options.ts";
import {
  activeOptionOfKind,
  capsOf,
  capText,
  categoryLabel,
  categoryOptions,
  companyCategoryLabel,
  enabledCaps,
  kindOfCategory,
  kindOfOption,
  kindOfText,
  optionOfCategory,
  optionOfText,
  sameCategory,
  storedCaps,
} from "./categories.ts";
import { sanitizeCategory } from "./company.ts";

const OPTIONS = sanitizeFlyerOptions([
  { n: 1, nombre: "General" },
  { n: 3, nombre: "Combustible 2025", solapa: "rubros" },
  { n: 7, nombre: "Combustible 2026", solapa: "rubros", reemplaza: 3 },
  { n: 4, nombre: "Súper", solapa: "rubros" },
  { n: 5, nombre: "Súper y combustible", solapa: "rubros" },
  { n: 6, nombre: "Otra cosa", solapa: "rubros", rubro: "ninguno" },
  { n: 8, nombre: "Fijado", solapa: "rubros", rubro: "ambos" },
]);

const FUEL = { opcion: 7, importe: "24000", importe2: "", txt: "" };
const GROCERY = { opcion: 4, importe: "15000", importe2: "", txt: "" };
const BOTH = { opcion: 5, importe: "20000", importe2: "30000", txt: "" };

describe("the kind of a text", () => {
  const cases: readonly (readonly [string, string])[] = [
    ["Combustible", "combustible"],
    ["Nafta", "combustible"],
    ["Estación", "combustible"],
    ["Supermercado", "supermercado"],
    ["Hiper", "supermercado"],
    ["Ambos", "ambos"],
    ["Súper y combustible 2027", "ambos"],
    ["Otra", ""],
    ["", ""],
  ];
  for (const [text, kind] of cases) {
    it(`"${text}" is "${kind}"`, () => {
      expect(kindOfText(text)).toBe(kind);
    });
  }
});

describe("the kind of an option", () => {
  it("is said by hand, or by its name", () => {
    expect(kindOfOption(8, OPTIONS)).toBe("ambos");
    expect(kindOfOption(4, OPTIONS)).toBe("supermercado");
  });

  it("'ninguno' is out of the routing", () => {
    expect(kindOfOption(6, OPTIONS)).toBe("");
  });

  it("an option that does not exist is the first", () => {
    expect(kindOfOption(99, OPTIONS)).toBe("");
  });
});

describe("which flyer a company goes to", () => {
  it("only the options of Rubros count", () => {
    expect(categoryOptions(OPTIONS)).toEqual([3, 4, 5, 6, 7, 8]);
  });

  it("the one in force of its kind, the last the administrator left", () => {
    expect(activeOptionOfKind("combustible", OPTIONS)).toBe(7);
    expect(activeOptionOfKind("ambos", OPTIONS)).toBe(8);
    expect(activeOptionOfKind("", OPTIONS)).toBe(0);
  });

  it("an old campaign goes to the one in force, without touching any data", () => {
    expect(optionOfCategory({ opcion: 3 }, OPTIONS)).toBe(7);
  });

  it("the option gone: the text it was loaded with decides", () => {
    expect(kindOfCategory({ opcion: 99, txt: "Súper" }, OPTIONS)).toBe("supermercado");
    expect(optionOfCategory({ opcion: 99, txt: "Súper" }, OPTIONS)).toBe(4);
    expect(kindOfCategory({ opcion: 0, txt: "" }, OPTIONS)).toBe("");
    expect(optionOfCategory({ opcion: 0 }, OPTIONS), "nothing to go on").toBe(0);
  });
});

describe("the cell of the category", () => {
  it("is the name of an option, or part of it", () => {
    expect(optionOfText("Súper", OPTIONS)).toBe(4);
    expect(optionOfText("súper y combustible", OPTIONS)).toBe(5);
    expect(optionOfText("Combustible 2025", OPTIONS), "last year's goes to the current").toBe(7);
    expect(optionOfText("Otra", OPTIONS)).toBe(6);
  });

  it("or a number of the list", () => {
    expect(optionOfText("3", OPTIONS)).toBe(7);
    expect(optionOfText("1", OPTIONS), "not of Rubros").toBe(0);
  });

  it("what says none, or what is not known, is none", () => {
    for (const text of ["", "-", "no", "Sin rubro", "Premium"]) {
      expect(optionOfText(text, OPTIONS)).toBe(0);
    }
  });
});

describe("what a category reads", () => {
  it("the flyer in force with its caps", () => {
    expect(categoryLabel(FUEL, OPTIONS)).toBe("Combustible 2026 · $24.000");
    expect(categoryLabel({ opcion: 3 }, OPTIONS), "without caps").toBe("Combustible 2026");
    expect(companyCategoryLabel({ rubro: GROCERY }, OPTIONS)).toBe("Súper · $15.000");
  });

  it("Ambos with two different caps names them", () => {
    expect(categoryLabel(BOTH, OPTIONS)).toBe("Fijado · súper $20.000 · combustible $30.000");
  });

  it("two caps on a category that is not both", () => {
    expect(categoryLabel({ ...FUEL, importe2: "30000" }, OPTIONS)).toBe(
      "Combustible 2026 · $24.000 / $30.000",
    );
    expect(categoryLabel({ ...FUEL, importe2: "24000" }, OPTIONS)).toBe(
      "Combustible 2026 · $24.000",
    );
  });

  it("no category reads nothing", () => {
    expect(categoryLabel(null, OPTIONS)).toBe("");
  });
});

describe("two categories", () => {
  it("are the same with the same option and caps", () => {
    expect(sameCategory(FUEL, FUEL)).toBe(true);
    expect(sameCategory(FUEL, GROCERY)).toBe(false);
    expect(sameCategory(FUEL, { ...FUEL, importe: "1" })).toBe(false);
  });

  it("without an option the caps do not count", () => {
    expect(sameCategory({ importe: "1" }, { importe: "2" })).toBe(true);
  });

  it("an empty second cap is the same as the first", () => {
    expect(sameCategory(FUEL, { ...FUEL, importe2: "24000" })).toBe(true);
  });
});

describe("the caps with a name", () => {
  it("each kind says what its main cap is", () => {
    expect(capsOf(FUEL, OPTIONS)).toEqual({ fuel: "24000", grocery: "" });
    expect(capsOf(GROCERY, OPTIONS)).toEqual({ fuel: "", grocery: "15000" });
    expect(capsOf(BOTH, OPTIONS)).toEqual({ fuel: "30000", grocery: "20000" });
    expect(capsOf({ ...BOTH, importe2: "" }, OPTIONS)).toEqual({ fuel: "20000", grocery: "20000" });
  });

  it("a category that is not recognized reads as it did before", () => {
    expect(capsOf({ importe: "1", importe2: "2" }, OPTIONS)).toEqual({ fuel: "2", grocery: "1" });
  });

  it("and they go back", () => {
    expect(storedCaps("combustible", "24000", "")).toEqual({ importe: "24000", importe2: "" });
    expect(storedCaps("supermercado", "", "$15.000")).toEqual({ importe: "15000", importe2: "" });
    expect(storedCaps("ambos", "30000", "20000")).toEqual({ importe: "20000", importe2: "30000" });
    expect(storedCaps("ambos", "20000", "20000")).toEqual({ importe: "20000", importe2: "" });
    expect(storedCaps("ambos", "", "20000")).toEqual({ importe: "20000", importe2: "" });
    expect(storedCaps("", "30000", "")).toEqual({ importe: "30000", importe2: "" });
  });

  it("a cap in the column of the other category is taken as its own", () => {
    expect(storedCaps("combustible", "", "24000").importe).toBe("24000");
    expect(storedCaps("supermercado", "15000", "").importe).toBe("15000");
  });

  it("the field of each kind can be written", () => {
    expect(enabledCaps(sanitizeCategory(FUEL), OPTIONS)).toEqual({ fuel: true, grocery: false });
    expect(enabledCaps(sanitizeCategory(GROCERY), OPTIONS)).toEqual({ fuel: false, grocery: true });
    expect(enabledCaps(sanitizeCategory(BOTH), OPTIONS)).toEqual({ fuel: true, grocery: true });
    expect(enabledCaps(sanitizeCategory(null), OPTIONS), "no category, no caps").toEqual({
      fuel: false,
      grocery: false,
    });
  });

  it("a cap is written without its sign", () => {
    expect(capText("24000")).toBe("24.000");
    expect(capText("")).toBe("");
  });
});
