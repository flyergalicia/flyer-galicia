import { describe, expect, it } from "vitest";
import {
  cashbackCell,
  cashbackConfigsInFile,
  cashbackIndex,
  cashbackName,
  cashbackNames,
  DEFAULT_CASHBACK_CONFIGS,
  marksNoCashback,
  parseCashback,
} from "./cashback.ts";

const NAMES = ["BAU", "Config 1", "Config 2", "Config 3", "Config 4"];

describe("what the cashback cell says", () => {
  const cases: readonly (readonly [string, number])[] = [
    ["BAU", 0],
    ["bau", 0],
    ["base", 0],
    ["estándar", 0],
    ["Config 2", 2],
    ["config 2", 2],
    ["Config2", 2],
    ["Configuración 1", 1],
    ["1", 1],
    ["1.0", 1],
    ["3,00", 3],
    ["Premium", -1],
    ["Config 9", -1],
    ["-", -1],
    ["—", -1],
  ];
  for (const [cell, index] of cases) {
    it(`"${cell}" is ${String(index)}`, () => {
      expect(parseCashback(cell, NAMES)).toBe(index);
    });
  }

  it("an empty cell reads as the first: it is the caller who says it means none", () => {
    expect(parseCashback("", NAMES)).toBe(0);
    expect(parseCashback(null, NAMES)).toBe(0);
  });

  it("a name the administrator gave is found", () => {
    expect(parseCashback("oferta especial", ["BAU", "Oferta Especial"])).toBe(1);
  });

  it("for a company, an empty cell is no cashback", () => {
    expect(cashbackIndex("", NAMES)).toBe(-1);
    expect(cashbackIndex("  ", NAMES)).toBe(-1);
    expect(cashbackIndex(null, NAMES)).toBe(-1);
    expect(cashbackIndex("Config 1", NAMES)).toBe(1);
  });

  it("says apart marking it on purpose from a value that is not understood", () => {
    for (const cell of ["", "SIN", "sin cashback", "No corresponde", "N/A", "exenta"]) {
      expect(marksNoCashback(cell)).toBe(true);
    }
    expect(marksNoCashback("Premium")).toBe(false);
  });
});

describe("how it is written", () => {
  it("by its name", () => {
    expect(cashbackName(-1, NAMES)).toBe("Sin cashback");
    expect(cashbackName(2, NAMES)).toBe("Config 2");
    expect(cashbackName(40, NAMES)).toBe("BAU");
  });

  it("in the cell, empty is no cashback", () => {
    expect(cashbackCell(-1, NAMES)).toBe("");
    expect(cashbackCell(1, NAMES)).toBe("Config 1");
  });
});

describe("_cashback.json", () => {
  it("without a list, the ones of always", () => {
    expect(cashbackConfigsInFile(null)).toBe(DEFAULT_CASHBACK_CONFIGS);
    expect(cashbackConfigsInFile({ configs: [] })).toBe(DEFAULT_CASHBACK_CONFIGS);
    expect(cashbackConfigsInFile({ configs: "x" })).toBe(DEFAULT_CASHBACK_CONFIGS);
  });

  it("the file says how many there are, and what it does not say stays as it was", () => {
    const configs = cashbackConfigsInFile({
      configs: [{ nombre: "Base <b>", m1: "$1" }, null],
    });

    expect(cashbackNames(configs)).toEqual(["Base b", "Config 1"]);
    expect(configs[0]?.m1).toBe("$1");
    expect(configs[0]?.m2).toBe("$180.000");
    expect(configs[1]?.m1, "a row without data is the one of always").toBe("$350.000");
  });

  it("one more than the ones of always starts from the first", () => {
    const six: readonly object[] = [...Array.from({ length: 5 }, () => ({ m1: "$9" })), {}];
    const configs = cashbackConfigsInFile({ configs: six });

    expect(configs).toHaveLength(6);
    expect(configs[5]).toMatchObject({ nombre: "Config 5", m1: "$9" });
    expect(configs[0]?.nombre, "without a name, its name of always").toBe("BAU");
  });
});
