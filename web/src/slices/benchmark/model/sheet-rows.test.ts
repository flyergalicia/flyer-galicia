import { describe, expect, it } from "vitest";
import { brandIndex, FIRST_FILTERS } from "./filters.ts";
import { REFERENCE_DEFAULTS } from "./reference.ts";
import type { BenchPromotion } from "./rows.ts";
import {
  rowsByBrand,
  rowsByDay,
  rowsByRubro,
  rowsOfCards,
  rowsOfPromotions,
  summaryLines,
} from "./sheet-rows.ts";

const REFS = REFERENCE_DEFAULTS;
const LIST: readonly BenchPromotion[] = [
  {
    id: "g1",
    banco: "galicia",
    titulo: "Coto",
    marca_clave: "coto",
    rubro: "Supermercados",
    pct: 25,
    tope: 10_000,
    dias: "Martes",
    dias_n: [1],
    credito: true,
  },
  {
    id: "b1",
    banco: "bbva",
    titulo: "Coto",
    marca_clave: "coto",
    rubro: "Supermercados",
    pct: 20,
    tope: 30_000,
    tope_por: "month",
    debito: true,
    fuente: "bbva",
    provincias: [],
  },
  {
    id: "s1",
    banco: "santander",
    titulo: "Fravega",
    marca_clave: "fravega",
    rubro: "Electrónica",
    cuotas: 12,
    fuente: "manual",
    segmento: "premium",
    provincias: ["CAPITAL FEDERAL"],
  },
  {
    id: "x",
    banco: "macro",
    titulo: "Sin marca",
    rubro: "Otros",
    pct: 10,
    tope: 0,
    fuente: "modo",
    segmento: "clasico",
    tope_por: "total",
  },
];

describe("the sheets", () => {
  it("by rubro: a row per rubro and bank, alphabetically, with the best and the installments", () => {
    const rows = rowsByRubro(LIST, REFS);
    expect(rows).toHaveLength(18);
    expect(
      rows.map(({ rubro }) => rubro).filter((rubro, index, all) => all.indexOf(rubro) === index),
    ).toEqual(["Electrónica", "Otros", "Supermercados"]);
    expect(rows.find(({ rubro, banco }) => rubro === "Supermercados" && banco === "BBVA")).toEqual({
      rubro: "Supermercados",
      compra: 150_000,
      banco: "BBVA",
      promos: 1,
      devuelve: 30_000,
      pct: 20,
      marca: "Coto",
      tope: 30_000,
      dias: undefined,
      cuotas: null,
      marcaCuotas: "",
    });
    expect(
      rows.find(({ rubro, banco }) => rubro === "Electrónica" && banco === "Santander"),
    ).toMatchObject({
      devuelve: null,
      pct: null,
      marca: "",
      tope: null,
      dias: "",
      cuotas: 12,
      marcaCuotas: "Fravega",
    });
    expect(
      rows.find(({ rubro, banco }) => rubro === "Otros" && banco === "Macro")?.tope,
    ).toBeNull();
  });

  it("by brand: only the brands two banks have, with who wins", () => {
    expect(rowsByBrand(LIST, REFS)).toEqual([
      expect.objectContaining({
        marca: "Coto",
        banco: "Galicia",
        devuelve: 10_000,
        gana: "",
        tope: 10_000,
      }),
      expect.objectContaining({
        marca: "Coto",
        banco: "BBVA",
        devuelve: 30_000,
        gana: "Sí",
        segmento: "",
      }),
    ]);
  });

  it("by day: the best of each bank on each day", () => {
    const rows = rowsByDay(LIST, REFS);
    expect(rows).toHaveLength(42);
    expect(rows[6]).toEqual({
      dia: "Martes",
      banco: "Galicia",
      devuelve: 10_000,
      pct: 25,
      marca: "Coto",
      rubro: "Supermercados",
    });
    expect(rows[0]).toEqual({
      dia: "Lunes",
      banco: "Galicia",
      devuelve: null,
      pct: null,
      marca: "",
      rubro: "",
    });
  });

  it("the cards, with where they come from", () => {
    expect(
      rowsOfCards([
        { id: "a", banco: "bbva", tarjeta: "Black", confianza: "nota", revisada: "2026-10-28" },
        { id: "b", banco: "otro", tarjeta: "X" },
      ]),
    ).toEqual([
      expect.objectContaining({ banco: "BBVA", conf: "Nota de prensa o blog", rev: "2026-10-28" }),
      expect.objectContaining({ banco: "otro", conf: "", rev: "" }),
    ]);
  });

  it("the promotions, with their source, cards, audience and places", () => {
    const rows = rowsOfPromotions(
      LIST,
      brandIndex([{ marca_clave: "coto", provincias: ["SALTA"] }]),
    );
    expect(rows.map(({ fuente }) => fuente)).toEqual([
      "MODO",
      "Web propia",
      "Cargada a mano",
      "MODO",
    ]);
    expect(rows.map(({ provincias }) => provincias)).toEqual([
      "Salta",
      "Todo el país (online)",
      "Capital Federal",
      "Sin dato",
    ]);
    expect(rows.map(({ tarjetas }) => tarjetas)).toEqual(["Crédito", "Débito", "", ""]);
    expect(rows.map(({ segmento }) => segmento)).toEqual(["", "", "Premium", "Clásico / Gold"]);
    expect(rows.map(({ por }) => por)).toEqual(["", "mes", "", ""]);
    expect(rows[2]).toMatchObject({
      cuotas: 12,
      pct: undefined,
      tope: null,
      beneficio: "",
      dias: "",
      desde: "",
      hasta: "",
    });
  });

  it("the summary keeps the filters, the purchases and the sources", () => {
    const lines = summaryLines(
      { ...FIRST_FILTERS, prov: "SALTA;JUJUY", rubro: "Combustible", seg: "premium" },
      { ...REFS, Supermercados: 20_000 },
      [
        { banco: "galicia", last_sync_at: "2026-10-30T15:00:00Z" },
        { banco: "bbva_web", last_sync_at: null },
      ],
      new Date("2026-10-30T15:00:00Z"),
    );
    expect(lines[4]).toEqual(["Provincia", "Salta y Jujuy"]);
    expect(lines[5]).toEqual(["Rubro", "Combustible"]);
    expect(lines[6]).toEqual(["Tarjeta de la persona", "Premium"]);
    expect(lines[7]).toEqual(["Tipo de tarjeta", "todas"]);
    expect(lines.slice(10, 14)).toEqual([
      ["Supermercados", 20_000],
      ["Combustible", 60_000],
      ["Farmacia / salud", 40_000],
      ["Resto", 50_000],
    ]);
    expect(lines[16]?.[1]).toMatch(/^MODO · \d/);
    expect(lines[17]).toEqual(["BBVA", "MODO + web propia · sin datos"]);
    const all = summaryLines(FIRST_FILTERS, REFS, [], new Date());
    expect(all[4]).toEqual(["Provincia", "Todas las provincias"]);
    expect(all[5]).toEqual(["Rubro", "Todos"]);
  });
});
