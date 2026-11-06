// Config → Marcas vigiladas: how each brand stands against the catalog of a fixed day, and taking
// one out by brand.
import { describe, expect, it } from "vitest";
import type { Promotion } from "@/shared/domain/promotions/index.ts";
import {
  brandKey,
  stateText,
  watchedSections,
  watchedState,
  withoutWatched,
} from "./watched-sheet.ts";

const TODAY = new Date(2026, 9, 30, 15, 0);

function promotion(row: Partial<Promotion>): Promotion {
  return {
    id: "p",
    titulo: "Marca",
    imagen: "",
    fecha_hasta: "2026-12-31",
    proximamente: false,
    ...row,
  };
}

describe("the state of a brand", () => {
  it("is current, ends within seven days, or has no promotion", () => {
    const catalog = [
      promotion({ titulo: "Lejos", imagen: "lejos.png", fecha_hasta: "2026-11-20" }),
      promotion({ titulo: "Cerca", imagen: "cerca.png", fecha_hasta: "2026-11-06" }),
      promotion({ titulo: "Mañana", imagen: "manana.png", fecha_hasta: "2026-10-31" }),
      promotion({ titulo: "Vieja", imagen: "vieja.png", fecha_hasta: "2026-10-29" }),
    ];
    const of = (img: string) => watchedState({ img }, catalog, TODAY);
    expect(of("lejos.png")).toEqual({ kind: "ok" });
    expect(of("cerca.png")).toEqual({ kind: "soon", days: 7 });
    expect(of("manana.png")).toEqual({ kind: "soon", days: 1 });
    expect(of("vieja.png")).toEqual({ kind: "expired" });
    expect(of("otra.png")).toEqual({ kind: "expired" });
  });

  it("the promotion of today still counts; one still to come does not", () => {
    const catalog = [
      promotion({ imagen: "hoy.png", fecha_hasta: "2026-10-30" }),
      promotion({ imagen: "luego.png", fecha_hasta: "2027-01-31", proximamente: true }),
    ];
    expect(watchedState({ img: "hoy.png" }, catalog, TODAY)).toEqual({ kind: "soon", days: 0 });
    expect(watchedState({ img: "luego.png" }, catalog, TODAY)).toEqual({ kind: "expired" });
  });

  it("is found by its title without accents or capitals, and one with no date keeps it current", () => {
    const catalog = [
      promotion({ titulo: "CAFÉ MARTÍNEZ", fecha_hasta: "2026-11-02" }),
      promotion({ titulo: "Sin Fecha", fecha_hasta: null }),
    ];
    expect(watchedState({ m: "x", t: "Cafe Martinez" }, catalog, TODAY)).toEqual({
      kind: "soon",
      days: 3,
    });
    expect(watchedState({ m: "sin fecha" }, catalog, TODAY)).toEqual({ kind: "ok" });
    expect(watchedState({}, catalog, TODAY)).toEqual({ kind: "expired" });
  });

  it("of the promotions of a brand, the one that ends last", () => {
    const catalog = [
      promotion({ imagen: "y.png", fecha_hasta: "2026-11-01" }),
      promotion({ imagen: "y.png", fecha_hasta: "2026-12-31" }),
      promotion({ imagen: "y.png", fecha_hasta: "2026-11-15" }),
    ];
    expect(watchedState({ img: "y.png" }, catalog, TODAY)).toEqual({ kind: "ok" });
  });

  it("reads as today", () => {
    expect(stateText({ kind: "ok" })).toBe("Vigente");
    expect(stateText({ kind: "soon", days: 1 })).toBe("Vence en 1 día");
    expect(stateText({ kind: "soon", days: 3 })).toBe("Vence en 3 días");
    expect(stateText({ kind: "expired" })).toBe("Sin promo vigente");
  });
});

describe("the lists", () => {
  const file = {
    opciones: {
      "9": [
        { m: "Pegada", t: "Del catálogo", img: "a.png", origen: "manual" },
        { m: "Otra", t: "Otra", img: "", origen: "estudio" },
      ],
      "5": [{ t: "Sola" }],
      "7": [],
    },
  };
  const catalog = [promotion({ imagen: "a.png", fecha_hasta: "2027-01-31" })];

  it("one section per flyer that watches something, in the order of the numbers", () => {
    const sections = watchedSections(file, catalog, TODAY);
    expect(sections.map(({ option }) => option)).toEqual(["5", "9"]);
    const nine = sections[1];
    expect(nine?.toReview).toBe(1);
    expect(
      nine?.rows.map(({ name, title, fromStudio, key }) => [name, title, fromStudio, key]),
    ).toEqual([
      ["Pegada", "Del catálogo", false, "a.png"],
      ["Otra", "", true, "Otra"],
    ]);
    expect(sections[0]?.rows[0]).toMatchObject({ name: "Sola", key: "" });
    expect(watchedSections(file, catalog).length).toBe(2);
  });

  it("a brand goes out by its logo or its name, and one that is not there leaves nothing to save", () => {
    expect(brandKey({ img: "a.png", m: "x" })).toBe("a.png");
    expect(brandKey({ m: "x" })).toBe("x");
    expect(withoutWatched(file, "9", "Otra")?.opciones["9"]).toEqual([file.opciones["9"][0]]);
    expect(withoutWatched(file, "9", "nada")).toBeNull();
    expect(withoutWatched(file, "40", "a.png")).toBeNull();
  });
});
