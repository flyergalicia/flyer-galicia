import { describe, expect, it } from "vitest";
import {
  flyerOptionsInFile,
  isFlyerTabId,
  optionsOfTab,
  sanitizeFlyerOptions,
} from "./flyer-options.ts";

describe("the list of flyers", () => {
  it("falls back to the first three when nothing is saved", () => {
    const options = sanitizeFlyerOptions(null);

    expect(options.map(({ n, nombre }) => [n, nombre])).toEqual([
      [1, "Opción 1"],
      [2, "Opción 2"],
      [3, "Opción 3"],
    ]);
    expect(sanitizeFlyerOptions([]).map(({ n }) => n)).toEqual([1, 2, 3]);
  });

  it("always has option 1, first, and it is never of another tab", () => {
    const options = sanitizeFlyerOptions([{ n: 9, nombre: "Combustible", solapa: "rubros" }]);

    expect(options.map(({ n }) => n)).toEqual([1, 9]);
    expect(options[1]?.solapa).toBe("rubros");
    expect(sanitizeFlyerOptions([{ n: 1, solapa: "rubros" }])[0]?.solapa).toBe("flyer");
  });

  it("skips what is not a number from 1 on, and what is repeated", () => {
    const options = sanitizeFlyerOptions([
      { n: "x" },
      { n: 0 },
      { n: 4, nombre: "Primera" },
      { n: "4", nombre: "Repetida" },
      "no es una fila",
      { n: 1 },
    ]);

    expect(options.map(({ n, nombre }) => [n, nombre])).toEqual([
      [1, "Opción 1"],
      [4, "Primera"],
    ]);
  });

  it("cleans the name and the color it reads", () => {
    const [option] = sanitizeFlyerOptions([
      { n: 1, nombre: `<b>${"x".repeat(60)}</b>`, color: "#ABCDEF" },
    ]);

    expect(option?.nombre).toHaveLength(40);
    expect(option?.nombre).not.toMatch(/[<>]/);
    expect(option?.color).toBe("#abcdef");
    expect(sanitizeFlyerOptions([{ n: 1, nombre: "<>", color: "rojo" }])[0]).toMatchObject({
      nombre: "Opción 1",
      color: "",
    });
  });

  it("keeps the order chosen by hand and leaves the others last, by number", () => {
    const options = sanitizeFlyerOptions([
      { n: 7 },
      { n: 5 },
      { n: 2, orden: 1 },
      { n: 1, orden: 0 },
    ]);

    expect(options.map(({ n }) => n)).toEqual([1, 2, 5, 7]);
    expect(options.map(({ orden }) => orden)).toEqual([0, 1, 2, 3]);
  });

  it("a link to an option that is gone, or to itself, does not stay", () => {
    const options = sanitizeFlyerOptions([
      { n: 1 },
      { n: 2, reemplaza: 1, sinCB: 1, rubro: "ambos" },
      { n: 3, reemplaza: 8, sinCB: 8, rubro: "otro" },
      { n: 4, reemplaza: 4, sinCB: 4 },
    ]);

    expect(options[1]).toMatchObject({ reemplaza: 1, sinCB: 1, rubro: "ambos" });
    expect(options[2]).toMatchObject({ reemplaza: 0, rubro: "" });
    expect(options[2]).not.toHaveProperty("sinCB");
    expect(options[3]).toMatchObject({ reemplaza: 0 });
    expect(options[3]).not.toHaveProperty("sinCB");
  });

  it("reads the list from the file, under opts", () => {
    expect(flyerOptionsInFile({ opts: [{ n: 1 }, { n: 6 }] }).map(({ n }) => n)).toEqual([1, 6]);
    expect(flyerOptionsInFile(null).map(({ n }) => n)).toEqual([1, 2, 3]);
  });

  it("says which options are of a tab", () => {
    const options = sanitizeFlyerOptions([
      { n: 1 },
      { n: 2, solapa: "rubros" },
      { n: 3, solapa: "sueldo" },
      { n: 4, solapa: "inventada" },
    ]);

    expect(optionsOfTab(options, "flyer")).toEqual([1, 4]);
    expect(optionsOfTab(options, "rubros")).toEqual([2]);
  });

  it("tells the tabs of the flyer from the others", () => {
    expect(isFlyerTabId("sueldo")).toBe(true);
    expect(isFlyerTabId("promos")).toBe(false);
  });
});
