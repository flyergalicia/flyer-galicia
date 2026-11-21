import { describe, expect, it } from "vitest";
import {
  type BenchFilters,
  brandIndex,
  filterDays,
  filteredPromotions,
  FIRST_FILTERS,
  isInTime,
  isSalaryOnly,
  passesFilters,
  placesOf,
  provincesOf,
  rubrosOf,
} from "./filters.ts";
import type { BenchPromotion } from "./rows.ts";

const DAYS = { today: "2026-10-30", upcomingLimit: "2026-11-14" };
const BRANDS = brandIndex([
  { marca_clave: "ypf", provincias: ["BUENOS AIRES"] },
  { marca_clave: "coto", provincias: ["CAPITAL FEDERAL"], imagen: "modo/9.png" },
  { marca_clave: "sinlugar", provincias: null },
]);
const COTO: BenchPromotion = {
  banco: "galicia",
  marca_clave: "coto",
  rubro: "Supermercados",
  pct: 25,
  credito: true,
  debito: false,
  emisores: ["visa", "master"],
  provincias: ["CAPITAL FEDERAL", "BUENOS AIRES"],
  fecha_desde: "2026-10-01",
  fecha_hasta: "2027-12-31",
};

function passes(row: BenchPromotion, filters: Partial<BenchFilters> = {}): boolean {
  return passesFilters(row, { ...FIRST_FILTERS, ...filters }, BRANDS, DAYS);
}

describe("what counts", () => {
  it("a current promotion, with the filters as they start", () => {
    expect(passes(COTO)).toBe(true);
  });

  it("not one of MODO valid with any bank: it tells nobody apart", () => {
    expect(passes({ ...COTO, bancos_n: 5 })).toBe(false);
    expect(passes({ ...COTO, bancos_n: 1 })).toBe(true);
  });

  it("not one that ended, nor one that starts after the next 15 days", () => {
    expect(passes({ ...COTO, fecha_hasta: "2020-01-01" })).toBe(false);
    expect(passes({ ...COTO, fecha_desde: "2026-11-09" })).toBe(true);
    expect(passes({ ...COTO, fecha_desde: "2026-11-14" })).toBe(true);
    expect(passes({ ...COTO, fecha_desde: "2026-11-15" })).toBe(false);
    expect(passes({ ...COTO, proximamente: true, fecha_desde: null })).toBe(false);
    expect(isInTime({ ...COTO, fecha_hasta: "2026-10-30" }, DAYS)).toBe(true);
  });

  it("the next 15 days are counted from today in Argentina", () => {
    const days = filterDays(Date.parse("2026-10-30T15:00:00Z"));
    expect(days).toEqual({ today: "2026-10-30", upcomingLimit: "2026-11-14" });
  });

  it("not one only for whoever gets their salary at the bank, unless asked", () => {
    const salary = { ...COTO, segmento_txt: "clientes Haberes Galicia Éminent" };
    expect(isSalaryOnly(salary)).toBe(true);
    expect(isSalaryOnly({ ...COTO, segmento_txt: "cobrando el sueldo en ICBC" })).toBe(true);
    expect(passes(salary)).toBe(false);
    expect(passes(salary, { haberes: true })).toBe(true);
  });

  it("the rubro chosen", () => {
    expect(passes(COTO, { rubro: "Supermercados" })).toBe(true);
    expect(passes(COTO, { rubro: "Combustible" })).toBe(false);
  });

  it("premium uses premium and general; classic, classic and general", () => {
    const premium = { ...COTO, segmento: "premium" };
    const classic = { ...COTO, segmento: "clasico" };
    expect(passes(premium, { seg: "clasico" })).toBe(false);
    expect(passes(classic, { seg: "clasico" })).toBe(true);
    expect(passes(COTO, { seg: "clasico" })).toBe(true);
    expect(passes(classic, { seg: "premium" })).toBe(false);
    expect(passes(premium, { seg: "premium" })).toBe(true);
  });

  it("the type of card", () => {
    expect(passes(COTO, { tarj: "credito" })).toBe(true);
    expect(passes(COTO, { tarj: "debito" })).toBe(false);
    expect(passes(COTO, { tarj: "visa" })).toBe(true);
    expect(passes(COTO, { tarj: "american_express" })).toBe(false);
    expect(passes({ ...COTO, emisores: [] }, { tarj: "american_express" })).toBe(true);
    expect(passes({ ...COTO, emisores: null, debito: true }, { tarj: "debito" })).toBe(true);
  });
});

describe("with a province", () => {
  it("leaves what is valid there, by its places or by those of its brand", () => {
    expect(passes(COTO, { prov: "CAPITAL FEDERAL" })).toBe(true);
    expect(passes(COTO, { prov: "SALTA" })).toBe(false);
    expect(passes(COTO, { prov: "SALTA;BUENOS AIRES" })).toBe(true);
    const ypf = { ...COTO, marca_clave: "ypf", provincias: null };
    expect(placesOf(ypf, BRANDS)).toEqual(["BUENOS AIRES"]);
    expect(passes(ypf, { prov: "BUENOS AIRES" })).toBe(true);
    expect(passes(ypf, { prov: "CAPITAL FEDERAL" })).toBe(false);
  });

  it("online is the whole country", () => {
    expect(passes({ ...COTO, provincias: [] }, { prov: "SALTA" })).toBe(true);
  });

  it("without places, one of MODO is hidden and one of a website stays", () => {
    const nowhere = { ...COTO, marca_clave: "sinlugar", provincias: null };
    expect(placesOf(nowhere, BRANDS)).toBeNull();
    expect(placesOf({ ...nowhere, marca_clave: "otra" }, BRANDS)).toBeNull();
    expect(passes(nowhere, { prov: "SALTA" })).toBe(false);
    expect(passes({ ...nowhere, fuente: "modo" }, { prov: "SALTA" })).toBe(false);
    expect(passes({ ...nowhere, fuente: "supervielle" }, { prov: "SALTA" })).toBe(true);
    expect(passes(nowhere)).toBe(true);
  });
});

describe("what the filters offer", () => {
  it("the rubros, alphabetically, with Otros last", () => {
    expect(
      rubrosOf([
        { rubro: "Otros" },
        { rubro: "Supermercados" },
        { rubro: "Combustible" },
        { rubro: "Electrónica" },
        { rubro: "Otros" },
      ]),
    ).toEqual(["Combustible", "Electrónica", "Supermercados", "Otros"]);
  });

  it("the provinces of the brands", () => {
    expect(provincesOf(BRANDS)).toEqual(["BUENOS AIRES", "CAPITAL FEDERAL"]);
  });

  it("filters a list", () => {
    expect(
      filteredPromotions([COTO, { ...COTO, bancos_n: 3 }], FIRST_FILTERS, BRANDS, DAYS),
    ).toEqual([COTO]);
  });
});
