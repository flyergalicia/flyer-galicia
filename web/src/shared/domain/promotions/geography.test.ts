import { describe, expect, it } from "vitest";
import {
  catalogHasGeography,
  hasKnownGeography,
  hasSeveralProvinces,
  isInLocality,
  isInProvince,
  isOnlinePromotion,
  knownProvinces,
  localitiesOfProvince,
  localityMatches,
  locationsIn,
  provinceList,
  provincesName,
  validProvinces,
  whereText,
} from "./geography.ts";
import type { Promotion } from "./promotion.ts";

function promotion(provincias: readonly string[] | null, fields: Partial<Promotion> = {}) {
  return { id: 1, titulo: "x", provincias, ...fields };
}

const modo = (fields: Partial<Promotion> = {}): Promotion => ({
  id: "m:1",
  titulo: "x",
  origen: "modo",
  ...fields,
});

describe("where a promotion is valid", () => {
  it("tells a list, online and not known", () => {
    expect(hasKnownGeography(promotion(["MENDOZA"]))).toBe(true);
    expect(hasKnownGeography(promotion(null))).toBe(false);
    expect(hasKnownGeography(null)).toBe(false);
    expect(isOnlinePromotion(promotion([]))).toBe(true);
    expect(isOnlinePromotion(promotion(["MENDOZA"]))).toBe(false);
    expect(isOnlinePromotion(promotion(null))).toBe(false);
  });

  it("filters by province without accents or capitals", () => {
    const here = promotion(["Río Negro"]);
    expect(isInProvince(here, "")).toBe(true);
    expect(isInProvince(here, null)).toBe(true);
    expect(isInProvince(here, "RIO NEGRO")).toBe(true);
    expect(isInProvince(here, "MENDOZA")).toBe(false);
  });

  it("online counts in any province; several: any of them", () => {
    expect(isInProvince(promotion([]), "MENDOZA")).toBe(true);
    expect(isInProvince(promotion(["MENDOZA"]), "NEUQUEN;MENDOZA")).toBe(true);
    expect(isInProvince(promotion(["CORDOBA"]), "NEUQUEN;MENDOZA")).toBe(false);
  });

  it("without the data: Galicia is not punished, one of MODO only shows with all the provinces", () => {
    expect(isInProvince(promotion(null), "MENDOZA")).toBe(true);
    expect(isInProvince(modo(), "MENDOZA")).toBe(false);
    expect(isInProvince(modo(), "")).toBe(true);
    expect(isInProvince(modo({ provincias: ["MENDOZA"] }), "MENDOZA")).toBe(true);
  });
});

describe("several provinces", () => {
  it("travel as one text", () => {
    expect(provinceList("A;B")).toEqual(["A", "B"]);
    expect(provinceList("")).toEqual([]);
    expect(provinceList(null)).toEqual([]);
    expect(hasSeveralProvinces("A;B")).toBe(true);
    expect(hasSeveralProvinces("A")).toBe(false);
  });

  it("read as names", () => {
    expect(provincesName("BUENOS AIRES")).toBe("Buenos Aires");
    expect(provincesName("BUENOS AIRES;CAPITAL FEDERAL")).toBe("Buenos Aires y Capital Federal");
    expect(provincesName("A;B;C")).toBe("A, B y C");
    expect(provincesName("")).toBe("");
  });

  it("one that left the list falls off", () => {
    expect(validProvinces("A;B;C", ["A", "C"])).toBe("A;C");
    expect(validProvinces("", ["A"])).toBe("");
  });
});

describe("the locality", () => {
  it("compares the way MODO writes the cities", () => {
    expect(localityMatches("SAN MIGUEL DE TUCUMAN", "TUCUMAN", "TUCUMAN")).toBe(true);
    expect(localityMatches("LANUS OESTE", "LANUS", "BUENOS AIRES")).toBe(true);
    expect(localityMatches("LANUS", "LANUS OESTE", "BUENOS AIRES")).toBe(true);
    expect(localityMatches("GENERAL ROCA", "GRAL ROCA", "RIO NEGRO")).toBe(true);
    expect(localityMatches("PALERMO", "CABA", "CAPITAL FEDERAL")).toBe(true);
    expect(localityMatches("PALERMO", "CABA", "BUENOS AIRES")).toBe(false);
    expect(localityMatches("MAR DEL PLATA", "BAHIA BLANCA", "BUENOS AIRES")).toBe(false);
    expect(localityMatches("VILLA SAN JOSE", "SAN", "ENTRE RIOS")).toBe(false);
    expect(localityMatches("", "SAN", "ENTRE RIOS")).toBe(false);
  });

  it("asks Galicia by id, and MODO by its stores", () => {
    const ids = new Set(["1"]);
    expect(isInLocality(promotion(["MENDOZA"]), "MENDOZA", "GODOY CRUZ", ids)).toBe(true);
    expect(isInLocality({ ...promotion(["MENDOZA"]), id: 2 }, "MENDOZA", "GODOY CRUZ", ids)).toBe(
      false,
    );
    expect(isInLocality({ ...promotion(["MENDOZA"]), id: 2 }, "MENDOZA", "GODOY CRUZ", null)).toBe(
      true,
    );
    const withStores = modo({ provincias: ["MENDOZA"], localidades: ["MENDOZA|GODOY CRUZ"] });
    expect(isInLocality(withStores, "MENDOZA", "GODOY CRUZ", ids)).toBe(true);
    expect(isInLocality(withStores, "MENDOZA", "LUJAN", ids)).toBe(false);
    expect(isInLocality(modo({ localidades: ["MENDOZA"] }), "MENDOZA", "LUJAN", ids)).toBe(false);
  });

  it("is not asked of online ones, nor without one chosen, and without the data nobody is punished", () => {
    expect(isInLocality(promotion([]), "MENDOZA", "LUJAN", new Set())).toBe(true);
    expect(isInLocality(promotion(["MENDOZA"]), "MENDOZA", "", new Set())).toBe(true);
    expect(isInLocality(modo({ provincias: ["MENDOZA"] }), "MENDOZA", "LUJAN", new Set())).toBe(
      true,
    );
    expect(
      isInLocality(modo({ provincias: ["MENDOZA"], localidades: [] }), "MENDOZA", "LUJAN", null),
    ).toBe(true);
  });
});

describe("the lists", () => {
  it('say "Dónde" whole', () => {
    expect(whereText(promotion(["MENDOZA", "CAPITAL FEDERAL"]))).toBe("Capital Federal, Mendoza");
    expect(whereText(promotion([]))).toBe("Online");
    expect(whereText(promotion(null))).toBe("");
    const same = promotion(["MENDOZA"]);
    expect(whereText(same)).toBe(whereText(same));
  });

  it("read the master list tolerantly", () => {
    expect(
      locationsIn([
        { nombre: "MENDOZA", localidades: ["LUJAN", 3] },
        { nombre: "NEUQUEN" },
        { nombre: 3 },
        null,
        "x",
      ]),
    ).toEqual([
      { nombre: "MENDOZA", localidades: ["LUJAN"] },
      { nombre: "NEUQUEN", localidades: [] },
    ]);
    expect(locationsIn(null)).toEqual([]);
  });

  it("use the master list, or what is seen on the promotions while there is none", () => {
    const locations = [
      { nombre: "A", localidades: ["A1"] },
      { nombre: "", localidades: [] },
    ];
    expect(knownProvinces(locations, [])).toEqual(["A"]);
    expect(knownProvinces([], [promotion(["C", "B"]), promotion(null), promotion(["B"])])).toEqual([
      "B",
      "C",
    ]);
    expect(localitiesOfProvince(locations, "A")).toEqual(["A1"]);
    expect(localitiesOfProvince(locations, "Z")).toEqual([]);
  });

  it("know whether the catalog can filter by province at all", () => {
    expect(catalogHasGeography([promotion(null), promotion([])])).toBe(true);
    expect(catalogHasGeography([promotion(null)])).toBe(false);
  });
});
