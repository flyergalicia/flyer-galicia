// What the window of brands has chosen, with what it needs to filter. The list is worked out here so
// that the window is only about showing it.
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import {
  localitiesOfProvince,
  knownProvinces,
  catalogHasGeography,
  type Promotion,
  promotionZone,
  supermarketIndexOf,
} from "@/shared/domain/promotions/index.ts";
import { shownPromotions, usePromotionCatalog } from "@/shared/lib/promotions/catalog-query.ts";
import { useIncludeModo } from "@/shared/lib/promotions/include-modo-context.ts";
import {
  type PromotionFilterValues,
  usePromotionFiltersPort,
} from "@/shared/lib/promotions/promotion-filters.ts";
import { idsOfLocality } from "@/shared/lib/promotions/promotions-edge.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { type BrandFilters, filterBrands } from "./brand-filter.ts";

const NOTHING_REMEMBERED = {
  province: "",
  locality: "",
  onePerBrand: true,
  onlyPercent: false,
  withDays: true,
};

/** What the window remembers from one time to the next, while the page lives. */
const remembered = { ...NOTHING_REMEMBERED };

export function forgetPickerFilters(): void {
  Object.assign(remembered, NOTHING_REMEMBERED);
}

/** What was left in Activas comes back to the window. */
export function rememberPickerFilters({
  province,
  locality,
  onePerBrand,
  onlyPercent,
}: PromotionFilterValues): void {
  Object.assign(remembered, { province, locality, onePerBrand, onlyPercent });
}

/**
 * What Galicia answered for a locality stays while the page lives: choosing it again does not ask
 * again. A failure is not kept: the next time it is chosen, it is asked for again.
 */
function useLocalityIds(province: string, locality: string, onFailure: () => void) {
  const backend = useBackend();
  const { data, isFetching } = useQuery({
    queryKey: ["promotions", "locality-ids", province, locality],
    enabled: Boolean(province && locality),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: false,
    queryFn: async () => {
      const ids = await idsOfLocality(backend, province, locality);
      if (!ids) {
        onFailure();
        throw new Error("No answer for that locality");
      }
      return ids;
    },
  });
  return { ids: data ?? null, isLoading: Boolean(province && locality) && isFetching };
}

/** The filters start from what Promociones has, and the province from the last time. */
export function startingFilters(start: PromotionFilterValues) {
  const province = remembered.province || start.province;
  const locality = remembered.province ? remembered.locality : start.locality;
  return {
    search: "",
    category: start.category,
    province,
    locality,
    onePerBrand: remembered.onePerBrand,
    hideOnline: start.hideOnline,
    onlyPercent: remembered.onlyPercent,
  } satisfies BrandFilters;
}

/** `initial`: the filters to start with, when they are not the usual ones. */
export function useBrandPicker(initial?: BrandFilters) {
  const port = usePromotionFiltersPort();
  const toast = useToast();
  const includeModo = useIncludeModo();
  const { data: catalog, isSuccess } = usePromotionCatalog();
  const [filters, setFilters] = useState<BrandFilters>(
    () => initial ?? startingFilters(port.read()),
  );
  const [withDays, setWithDaysState] = useState(remembered.withDays);

  const change = useCallback(
    (next: Partial<BrandFilters>) => {
      setFilters((current) => {
        const updated = { ...current, ...next };
        remembered.province = updated.province;
        remembered.locality = updated.locality;
        remembered.onePerBrand = updated.onePerBrand;
        remembered.onlyPercent = updated.onlyPercent;
        return updated;
      });
      // It is the same filter as the tick of Activas: they stay equal.
      if (next.hideOnline !== undefined) port.ask({ hideOnline: next.hideOnline });
    },
    [port],
  );

  const onLocalityFailure = useCallback(() => {
    change({ locality: "" });
    toast.show(
      "No se pudo filtrar por localidad: se muestra toda la provincia. Probá elegirla de nuevo en un rato.",
    );
  }, [change, toast]);

  const { ids, isLoading } = useLocalityIds(filters.province, filters.locality, onLocalityFailure);

  const shown = useMemo(() => shownPromotions(catalog, includeModo), [catalog, includeModo]);
  const supermarkets = useMemo(() => supermarketIndexOf(shown), [shown]);
  const zone = useMemo(
    () => promotionZone(filters.province, filters.locality, ids),
    [filters.locality, filters.province, ids],
  );
  const brands = useMemo(
    () => filterBrands(shown, filters, ids, supermarkets, zone),
    [filters, ids, shown, supermarkets, zone],
  );

  const categories = useMemo(
    () =>
      [
        ...new Set(shown.flatMap(({ subtitulo }: Promotion) => (subtitulo ? [subtitulo] : []))),
      ].toSorted(),
    [shown],
  );
  const provinces = useMemo(
    () => (catalogHasGeography(shown) ? knownProvinces(catalog?.locations ?? [], shown) : []),
    [catalog, shown],
  );
  const localities = useMemo(
    () => localitiesOfProvince(catalog?.locations ?? [], filters.province),
    [catalog, filters.province],
  );

  return {
    filters,
    change,
    withDays,
    setWithDays: (on: boolean) => {
      remembered.withDays = on;
      setWithDaysState(on);
    },
    brands,
    zone,
    localityIds: ids,
    supermarkets,
    /** The catalog as it can be seen: with or without MODO, according to its tick. */
    shown,
    categories,
    provinces,
    localities,
    isCatalogRead: isSuccess,
    hasCatalog: shown.length > 0,
    isSearchingLocality: isLoading,
  };
}

export type BrandPicker = ReturnType<typeof useBrandPicker>;
