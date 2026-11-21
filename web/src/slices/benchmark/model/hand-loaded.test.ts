import { describe, expect, it } from "vitest";
import { brandKey, daysText, handLoadedRow, isCurrentHandLoaded } from "./hand-loaded.ts";
import type { HandLoadedPromotion } from "./rows.ts";

const YPF: HandLoadedPromotion = {
  id: "m1",
  banco: "santander",
  titulo: "YPF",
  rubro: "Combustible",
  beneficio: "Pagando con la App YPF",
  pct: "15",
  tope: 20_000,
  tope_por: "month",
  cuotas: 0,
  dias_n: ["3"],
  credito: true,
  debito: true,
  segmento: "premium",
  condicion: "Paquete Black+ All",
  provincias: null,
  fecha_desde: "2026-10-01",
  fecha_hasta: "2027-12-31",
  fuente_url: "https://www.santander.com.ar/personas/beneficios",
};

describe("the key of a brand", () => {
  it("is the one of benchmark-sync: without accents, spaces or words that do not name it", () => {
    expect(brandKey("Changomas")).toBe("changomas");
    expect(brandKey("Supermercados Día")).toBe("dia");
    expect(brandKey("Grupo Farmacity S.A.")).toBe("farmacitysa");
    expect(brandKey("Farmacias del  Sur SA")).toBe("sur");
    expect(brandKey(null)).toBe("");
  });
});

describe("the days", () => {
  it("are written as the flyer writes them", () => {
    expect(daysText([2])).toBe("Miércoles");
    expect(daysText([3, 1])).toBe("Martes y jueves");
    expect(daysText([5, 0, 6])).toBe("Lunes, sábados y domingos");
  });

  it("without days, or with all of them, every day", () => {
    expect(daysText([])).toBe("Todos los días");
    expect(daysText(null)).toBe("Todos los días");
    expect(daysText([0, 1, 2, 3, 4, 5, 6])).toBe("Todos los días");
  });
});

describe("a promotion loaded by hand", () => {
  it("enters the comparison as source manual, with the key of its brand", () => {
    expect(handLoadedRow(YPF, "2026-10-30")).toEqual({
      id: "manual:m1",
      banco: "santander",
      fuente: "manual",
      titulo: "YPF",
      marca_clave: "ypf",
      rubro: "Combustible",
      beneficio: "Pagando con la App YPF",
      pct: 15,
      tope: 20_000,
      tope_por: "month",
      cuotas: 0,
      dias: "Jueves",
      dias_n: [3],
      credito: true,
      debito: true,
      emisores: [],
      slug: "",
      fuente_url: "https://www.santander.com.ar/personas/beneficios",
      segmento: "premium",
      segmento_txt: "Paquete Black+ All",
      provincias: [],
      fecha_desde: "2026-10-01",
      fecha_hasta: "2027-12-31",
      proximamente: false,
      bancos_n: null,
    });
  });

  it("without data takes the defaults: Otros, every day, the whole country", () => {
    const row = handLoadedRow({ id: "x", banco: "macro", titulo: "Vieja SA" }, "2026-10-30");
    expect(row).toMatchObject({
      rubro: "Otros",
      pct: null,
      tope: null,
      tope_por: null,
      dias: "Todos los días",
      dias_n: [],
      provincias: [],
      fecha_desde: null,
      segmento: null,
    });
  });

  it("with all the days, it has no days; with places, those; starting later, upcoming", () => {
    const row = handLoadedRow(
      { ...YPF, dias_n: [0, 1, 2, 3, 4, 5, 6], provincias: ["SALTA"], fecha_desde: "2026-12-01" },
      "2026-10-30",
    );
    expect(row).toMatchObject({ dias_n: [], provincias: ["SALTA"], proximamente: true });
    expect(handLoadedRow(YPF).proximamente).toBe(false);
  });

  it("counts on the label of its bank while it has not ended", () => {
    expect(isCurrentHandLoaded(YPF, "2026-10-30")).toBe(true);
    expect(isCurrentHandLoaded({ ...YPF, fecha_hasta: "2026-02-01" }, "2026-10-30")).toBe(false);
    expect(isCurrentHandLoaded({ ...YPF, fecha_hasta: null }, "2026-10-30")).toBe(true);
  });
});
