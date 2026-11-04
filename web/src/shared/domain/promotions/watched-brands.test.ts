import { describe, expect, it } from "vitest";
import { watchedBrandsIn, withBrandsFound } from "./watched-brands.ts";

describe("the file of watched brands", () => {
  it("is read tolerantly", () => {
    expect(watchedBrandsIn(null)).toEqual({ opciones: {} });
    expect(watchedBrandsIn({})).toEqual({ opciones: {} });
    expect(watchedBrandsIn({ opciones: null })).toEqual({ opciones: {} });
    const file = { opciones: { 9: [{ m: "A" }] }, updated_at: "x" };
    expect(watchedBrandsIn(file)).toEqual(file);
  });

  it("replaces what was loaded by hand; what came from Estudio stays", () => {
    const file = {
      opciones: {
        9: [
          { m: "Vieja", img: "vieja.png", origen: "manual" },
          { m: "Del diseño", img: "disenio.png", origen: "estudio" },
        ],
        3: [{ m: "De otra", origen: "manual" }],
      },
    };
    const { opciones } = withBrandsFound(file, 9, [
      { m: "Nueva", img: "nueva.png", origen: "manual" },
    ]);
    expect(opciones[9]?.map(({ m }) => m)).toEqual(["Nueva", "Del diseño"]);
    expect(opciones[3]).toEqual(file.opciones[3]);
  });

  it("a logo goes only once; what has no logo always goes", () => {
    const found = [
      { m: "A", img: "x.png" },
      { m: "B", img: "x.png" },
      { m: "Sin logo 1", img: "" },
      { m: "Sin logo 2" },
    ];
    const studio = [
      { m: "Repetida", img: "x.png", origen: "estudio" },
      { m: "Sin logo de Estudio", origen: "estudio" },
    ];
    const { opciones } = withBrandsFound({ opciones: { 1: studio } }, 1, found);
    expect(opciones[1]?.map(({ m }) => m)).toEqual([
      "A",
      "Sin logo 1",
      "Sin logo 2",
      "Sin logo de Estudio",
    ]);
    expect(withBrandsFound({ opciones: {} }, 2, []).opciones[2]).toEqual([]);
  });
});
