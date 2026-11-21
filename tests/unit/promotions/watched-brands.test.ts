// Replaces pruebas/u01_revision_vigiladas.mjs.
import { beforeAll, describe, expect, it } from "vitest";
import { loadEdgeFunctionApi } from "../support/edge-function-source.ts";

interface CatalogPromo {
  titulo: string;
  imagen: string;
  fecha_hasta: string | null;
  proximamente?: boolean;
}

interface WatchedBrand {
  m: string;
  img?: string;
  t?: string;
}

interface Warning {
  marca: string;
  estado: string;
  hasta?: string;
}

interface PromotionsFunction {
  evaluarVigiladas(
    watched: Record<string, WatchedBrand[]>,
    catalog: CatalogPromo[],
    today: Date,
  ): Warning[];
}

const TODAY = new Date(2026, 9, 20);
const dayFromToday = (days: number): string =>
  new Date(2026, 9, 20 + days).toISOString().slice(0, 10);

const CATALOG: CatalogPromo[] = [
  { titulo: "Puppis", imagen: "puppis.png", fecha_hasta: dayFromToday(30) },
  { titulo: "Freddo", imagen: "freddo.png", fecha_hasta: dayFromToday(3) },
  { titulo: "Freddo", imagen: "freddo2.png", fecha_hasta: dayFromToday(-2) },
  { titulo: "Nike", imagen: "nike.png", fecha_hasta: dayFromToday(-1) },
  { titulo: "Sin Fecha", imagen: "sf.png", fecha_hasta: null },
  { titulo: "Próxima", imagen: "prox.png", fecha_hasta: dayFromToday(60), proximamente: true },
];

const WATCHED = {
  "9": [
    { m: "Puppis", img: "puppis.png" },
    { m: "Freddo", t: "Freddo" },
    { m: "Nike", img: "nike.png" },
    { m: "Sin fecha", t: "Sin Fecha" },
    { m: "Próxima", img: "prox.png" },
    { m: "Ya no está", t: "Inexistente" },
  ],
};

describe("the daily review of watched brands", () => {
  let warnings: Warning[] = [];
  const warningFor = (brand: string) => warnings.find(({ marca }) => marca === brand);

  beforeAll(() => {
    const api = loadEdgeFunctionApi<PromotionsFunction>({
      name: "promos-galicia",
      slices: [{ from: "type Vig =", to: "async function revisarVigiladas" }],
      functions: ["evaluarVigiladas"],
    });
    warnings = api.evaluarVigiladas(WATCHED, CATALOG, TODAY);
  });

  it("stays quiet about a promotion valid for a long time", () => {
    expect(warningFor("Puppis")).toBeUndefined();
  });

  it("takes the promotion that ends last and warns it is about to end", () => {
    expect(warningFor("Freddo")).toMatchObject({ estado: "vence", hasta: dayFromToday(3) });
  });

  it("warns about an expired promotion", () => {
    expect(warningFor("Nike")).toMatchObject({ estado: "vencida" });
  });

  it("takes a promotion with no end date as valid", () => {
    expect(warningFor("Sin fecha")).toBeUndefined();
  });

  it('does not count "Próximamente" as valid today', () => {
    expect(warningFor("Próxima")).toMatchObject({ estado: "vencida" });
  });

  it("warns about a brand that is no longer in the catalog", () => {
    expect(warningFor("Ya no está")).toMatchObject({ estado: "vencida" });
  });
});
