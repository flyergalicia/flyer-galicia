// What a test can read of Promociones that cannot be seen on the screen: what the catalog says about
// a promotion that is not on the table. It only reads: see shared/lib/test-probe.ts.
import type { QueryClient } from "@tanstack/react-query";
import {
  expiryStatus,
  isInLocality,
  isInProvince,
  isModoPromotion,
  ownDays,
  type Promotion,
  promotionZone,
  type PromotionZone,
  supermarketIndexOf,
} from "@/shared/domain/promotions/index.ts";
import {
  type PromotionCatalog,
  PROMOTION_CATALOG_QUERY_KEY,
  shownPromotions,
} from "@/shared/lib/promotions/catalog-query.ts";
import { idsOfLocality } from "@/shared/lib/promotions/promotions-edge.ts";
import type { Backend } from "@/shared/supabase/index.ts";
import type { PromotionsState } from "./promotions-state.ts";

interface PromotionQuery {
  readonly title: string;
  readonly benefit?: string;
}

interface ZoneQuery {
  readonly provinces: readonly string[];
  readonly locality?: string;
}

function found(catalog: readonly Promotion[], { title, benefit }: PromotionQuery): Promotion {
  const promotion = catalog.find(
    ({ titulo, beneficio }) =>
      titulo === title &&
      (benefit === undefined || (beneficio ?? "").toLowerCase().includes(benefit.toLowerCase())),
  );
  if (!promotion) throw new Error(`The catalog has no promotion "${title}" (${String(benefit)})`);
  return promotion;
}

export function promotionsProbe(
  backend: Backend,
  queryClient: QueryClient,
  modo: { readonly read: () => boolean },
  read: () => PromotionsState,
) {
  const catalog = () =>
    shownPromotions(
      queryClient.getQueryData<PromotionCatalog>(PROMOTION_CATALOG_QUERY_KEY),
      modo.read(),
    );
  const zoneOf = async (zone: ZoneQuery | null): Promise<PromotionZone | null> => {
    if (!zone) return null;
    const province = zone.provinces.join(";");
    const ids = zone.locality ? await idsOfLocality(backend, province, zone.locality) : null;
    return promotionZone(province, zone.locality ?? "", ids);
  };
  return {
    includeModo: modo.read,
    province: () => read().province,
    locality: () => read().locality,
    localityAnswered: () => !read().locality || read().localityIds !== null,
    catalog: () =>
      catalog().map((promotion) => ({
        sourceId: String(promotion.id).replace(/^m:/, ""),
        origin: isModoPromotion(promotion) ? "modo" : "galicia",
        title: promotion.titulo,
        category: promotion.subtitulo ?? "",
        benefit: promotion.beneficio ?? "",
        days: promotion.dias ?? "",
        hasLogo: Boolean(promotion.imagen),
      })),
    idsIn: (provinces: readonly string[]) =>
      catalog()
        .filter((promotion) => provinces.some((name) => isInProvince(promotion, name)))
        .map(({ id }) => String(id)),
    currentOffers: (title: string, province: string) => {
      const today = new Date();
      return catalog().filter(
        (promotion) =>
          promotion.titulo === title &&
          !promotion.proximamente &&
          expiryStatus(promotion.fecha_hasta, today) !== "VENCIDA" &&
          isInProvince(promotion, province),
      ).length;
    },
    flyerDays: async (query: PromotionQuery, zone: ZoneQuery | null) =>
      supermarketIndexOf(catalog()).flyerDays(found(catalog(), query), await zoneOf(zone)),
    hasPercent: async (query: PromotionQuery, zone: ZoneQuery | null) =>
      supermarketIndexOf(catalog()).hasPercentDiscount(found(catalog(), query), await zoneOf(zone)),
    withPercent: (titles: readonly string[]) =>
      titles.filter((title) => {
        const promotion = catalog().find(({ titulo }) => titulo === title);
        return promotion ? supermarketIndexOf(catalog()).hasPercentDiscount(promotion) : false;
      }),
    ownDays: (query: PromotionQuery) => ownDays(found(catalog(), query)),
    inProvince: (query: PromotionQuery, province: string) =>
      isInProvince(found(catalog(), query), province),
    modoShownInLocality: (province: string, locality: string, cities: readonly string[]) =>
      isInLocality(
        {
          id: "modo",
          titulo: "",
          origen: "modo",
          provincias: [province],
          localidades: cities.map((city) => `${province}|${city}`),
        },
        province,
        locality,
        new Set(),
      ),
  };
}
