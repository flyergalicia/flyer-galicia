import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { Promotion } from "@/shared/domain/promotions/index.ts";
import {
  PROMOTION_CATALOG_QUERY_KEY,
  type PromotionCatalog,
} from "@/shared/lib/promotions/catalog-query.ts";
import { createInventedBackend } from "@/shared/supabase/testing/invented-backend.ts";
import { jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import { promotionsProbe } from "./promotions-probe.ts";
import { initialPromotionsState } from "./promotions-state.ts";

const COTO: Promotion = {
  id: 1,
  titulo: "Coto",
  subtitulo: "Supermercados",
  imagen: "coto.png",
  fecha_hasta: "2099-01-01",
  provincias: ["NEUQUEN"],
  dias: "Todos los días",
  beneficio: "12 cuotas",
};
const COTO_DISCOUNT: Promotion = {
  ...COTO,
  id: 2,
  provincias: ["MENDOZA"],
  dias: "Martes",
  beneficio: "25% de ahorro",
};
const MODO: Promotion = { id: "m:a", titulo: "YPF", origen: "modo", fecha_hasta: "2099-01-01" };
const EXPIRED: Promotion = { id: 3, titulo: "Coto", fecha_hasta: "2020-01-01", provincias: [] };
const UPCOMING: Promotion = {
  id: 4,
  titulo: "Coto",
  fecha_hasta: "2099-01-01",
  provincias: [],
  proximamente: true,
};

function probe(state = initialPromotionsState()) {
  const queryClient = new QueryClient();
  const galicia = [COTO, COTO_DISCOUNT, EXPIRED, UPCOMING];
  const catalog: PromotionCatalog = {
    galicia,
    modo: [MODO],
    all: [...galicia, MODO],
    meta: null,
    locations: [],
    failure: null,
  };
  queryClient.setQueryData(PROMOTION_CATALOG_QUERY_KEY, catalog);
  const { backend } = createInventedBackend(() => jsonResponse({ data: { ids: [1] } }));
  return promotionsProbe(backend, queryClient, { read: () => true }, () => state);
}

describe("what a test can read", () => {
  it("the catalog, as a test compares it", () => {
    const catalog = probe().catalog();
    expect(catalog.at(-1)).toEqual({
      sourceId: "a",
      origin: "modo",
      title: "YPF",
      category: "",
      benefit: "",
      days: "",
      hasLogo: false,
    });
    expect(catalog[0]).toMatchObject({ sourceId: "1", origin: "galicia", hasLogo: true });
  });

  it("what is chosen", () => {
    const state = {
      ...initialPromotionsState(),
      province: "MENDOZA",
      locality: "LUJAN",
    };
    expect(probe(state).province()).toBe("MENDOZA");
    expect(probe(state).locality()).toBe("LUJAN");
    expect(probe(state).localityAnswered()).toBe(false);
    expect(probe({ ...state, localityIds: [] }).localityAnswered()).toBe(true);
    expect(probe().localityAnswered()).toBe(true);
    expect(probe().includeModo()).toBe(true);
  });

  it("what is in a place", () => {
    expect(probe().idsIn(["MENDOZA"])).toEqual(["2", "3", "4"]);
    expect(probe().currentOffers("Coto", "NEUQUEN")).toBe(1);
    expect(probe().inProvince({ title: "Coto", benefit: "cuotas" }, "NEUQUEN")).toBe(true);
    expect(probe().inProvince({ title: "Coto", benefit: "25%" }, "NEUQUEN")).toBe(false);
  });

  it("the days and the % of a supermarket, in a zone", async () => {
    const query = { title: "Coto", benefit: "cuotas" };
    expect(probe().ownDays(query)).toBe("Todos los días");
    await expect(probe().flyerDays(query, null)).resolves.toBe("Martes");
    await expect(probe().hasPercent(query, { provinces: ["NEUQUEN"] })).resolves.toBe(false);
    await expect(probe().flyerDays(query, { provinces: ["MENDOZA"] })).resolves.toBe("Martes");
    await expect(
      probe().flyerDays(query, { provinces: ["NEUQUEN"], locality: "ZAPALA" }),
    ).resolves.toBe("");
    expect(probe().withPercent(["Coto", "YPF", "Nadie"])).toEqual(["Coto"]);
  });

  it("says when it does not have what it is asked", () => {
    expect(() => probe().ownDays({ title: "Nadie" })).toThrow(/no promotion "Nadie"/);
  });

  it("how MODO counts in a locality", () => {
    expect(probe().modoShownInLocality("TUCUMAN", "SAN MIGUEL DE TUCUMAN", ["TUCUMAN"])).toBe(true);
    expect(probe().modoShownInLocality("TUCUMAN", "YERBA BUENA", ["TUCUMAN"])).toBe(false);
  });
});
