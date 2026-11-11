import { describe, expect, it } from "vitest";
import { DISCARD_REASONS, labelOf, PACKAGES } from "./labels.ts";
import { packageOf, packagesSummary } from "./packages.ts";

describe("commercial actions are told apart by package", () => {
  it("offers the five packages, in order, where Caja de Ahorro means no package", () => {
    expect(Object.values(PACKAGES)).toEqual([
      "Sin paquete (Caja de Ahorro)",
      "Plus",
      "Plus Gold",
      "Eminent Platinum",
      "Eminent Black",
    ]);
  });

  it.each([
    ["Caja de Ahorro", "caja"],
    ["CA", "caja"],
    ["caja de ahorros", "caja"],
    ["Sin paquete", "caja"],
    ["Sin paquete (Caja de Ahorro)", "caja"],
    ["Plus", "plus"],
    ["PAQUETE PLUS", "plus"],
    ["Plus Gold", "gold"],
    ["gold", "gold"],
    ["Eminent Platinum", "platinum"],
    ["Platino", "platinum"],
    ["eminent black", "black"],
    ["Black", "black"],
  ])("reads %j as the package %s", (text, expected) => {
    expect(packageOf(text)).toBe(expected);
  });

  it.each(["Eminent", "Ana Plus", "2500000", ""])(
    "does not read %j as a package, because it is not only a package",
    (text) => {
      expect(packageOf(text)).toBeNull();
    },
  );

  it("has five reasons for discarding", () => {
    expect.soft(DISCARD_REASONS["ya_galicia"]).toBe("Ya cobra en Galicia");
    expect.soft(Object.keys(DISCARD_REASONS)).toHaveLength(5);
  });

  it("reads a label that is not there as nothing", () => {
    expect.soft(labelOf(PACKAGES, "plus")).toBe("Plus");
    expect.soft(labelOf(PACKAGES, "other")).toBe("");
    expect.soft(labelOf(PACKAGES, null)).toBe("");
  });
});

describe("the sum of the signups of an action", () => {
  it("says it is about salaries while there are none", () => {
    expect(packagesSummary([{ estado: "prospecto" }])).toBe("sueldos en Galicia");
  });

  it("tells with a package from without", () => {
    expect(
      packagesSummary([
        { estado: "alta", paquete: "plus" },
        { estado: "alta", paquete: "caja" },
        { estado: "prospecto" },
      ]),
    ).toBe("1 con paquete · 1 sin paquete");
  });

  it("says how many have it not loaded", () => {
    expect(packagesSummary([{ estado: "alta", paquete: null }])).toBe(
      "0 con paquete · 0 sin paquete · 1 sin cargar",
    );
  });
});
