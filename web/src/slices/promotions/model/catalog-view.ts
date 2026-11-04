// What the screen shows of the catalog, worked out once per reading.
import { useMemo } from "react";
import {
  catalogHasGeography,
  decodeEntities,
  knownProvinces,
  type Promotion,
  type ProvinceLocation,
} from "@/shared/domain/promotions/index.ts";
import {
  type PromotionCatalog,
  shownPromotions,
  usePromotionCatalog,
} from "@/shared/lib/promotions/catalog-query.ts";
import { useIncludeModo } from "@/shared/lib/promotions/include-modo-context.ts";

export interface CatalogView {
  readonly catalog: PromotionCatalog | undefined;
  /** When it was read. */
  readonly readAt: number;
  readonly shown: readonly Promotion[];
  readonly provinces: readonly string[];
  readonly locations: readonly ProvinceLocation[];
  /** A catalog without geography cannot filter by province: it is said, instead of pretending. */
  readonly canFilterByProvince: boolean;
  readonly categories: readonly string[];
}

const NO_LOCATIONS: readonly ProvinceLocation[] = [];

function categoriesOf(shown: readonly Promotion[]): string[] {
  const names = shown.flatMap(({ subtitulo }) => (subtitulo ? [decodeEntities(subtitulo)] : []));
  return [...new Set(names)].toSorted();
}

export function useCatalogView(): CatalogView {
  const { data: catalog, dataUpdatedAt: readAt } = usePromotionCatalog();
  const includeModo = useIncludeModo();
  return useMemo(() => {
    const shown = shownPromotions(catalog, includeModo);
    const locations = catalog?.locations ?? NO_LOCATIONS;
    return {
      catalog,
      readAt,
      shown,
      locations,
      provinces: knownProvinces(locations, shown),
      canFilterByProvince: shown.length === 0 || catalogHasGeography(shown),
      categories: categoriesOf(shown),
    };
  }, [catalog, readAt, includeModo]);
}

function ageOf(date: Date, now: number): string {
  const minutes = Math.round((now - date.getTime()) / 60_000);
  if (minutes < 60) return "";
  const hours = Math.round(minutes / 60);
  if (hours < 24) return ` (hace ${String(hours)} h)`;
  const days = Math.round(hours / 24);
  return ` (hace ${String(days)}${days === 1 ? " día)" : " días)"}`;
}

/** How old the copy is when it was read: Galicia publishes in batches during the day. */
export function catalogStatusLine(catalog: PromotionCatalog | undefined, now: number): string {
  if (!catalog) return "Cargando estado del catálogo...";
  const { meta, modo } = catalog;
  if (!meta?.last_sync_at) return "Catálogo todavía no sincronizado. Se va a actualizar solo.";
  const date = new Date(meta.last_sync_at);
  const day = date.toLocaleDateString("es-AR");
  const time = date.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const fromModo =
    modo.length > 0
      ? ` de Galicia y ${modo.length.toLocaleString("es-AR")} de MODO que no están en Galicia`
      : "";
  return `Catálogo actualizado: ${day} ${time}${ageOf(date, now)}. ${(meta.total || 0).toLocaleString("es-AR")} promociones${fromModo}. Se actualiza solo todos los días a las 9.`;
}
