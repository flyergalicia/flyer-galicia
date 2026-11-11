// Marks of what is on the flyer against the catalog: a logo whose promotion ended, or with no
// promotion in the province it was saved for. They are for whoever edits, never for the download.
import {
  expiryStatus,
  isInProvince,
  type Promotion,
  provincesName,
} from "@/shared/domain/promotions/index.ts";
import { isFromFlyer, isUploaded, type PlacedChange } from "./change.ts";

export interface MarkReader {
  /** Its promotion ended, or is not in Promociones any more. "Próximamente" does not count. */
  readonly isExpired: (change: PlacedChange) => boolean;
  /** Saved for a province where today it has no promotion. Expired ones are not marked twice. */
  readonly isOutOfProvince: (change: PlacedChange) => boolean;
}

function isCurrent(promotion: Promotion, today: Date): boolean {
  return (
    Boolean(promotion.proximamente) || expiryStatus(promotion.fecha_hasta, today) !== "VENCIDA"
  );
}

function comesFromCatalog({ tipo, img }: PlacedChange): boolean {
  return Boolean(img) && tipo !== "txt" && !isUploaded(img) && !isFromFlyer(img);
}

function logosIn(catalog: readonly Promotion[], today: Date, province?: string): Set<string> {
  const logos = new Set<string>();
  for (const promotion of catalog) {
    const fits = province === undefined || isInProvince(promotion, province);
    if (promotion.imagen && fits && isCurrent(promotion, today)) logos.add(promotion.imagen);
  }
  return logos;
}

/** Without a catalog nothing is marked: not knowing is not having expired. */
export function markReaderFor(catalog: readonly Promotion[], today: Date = new Date()): MarkReader {
  if (catalog.length === 0) {
    return { isExpired: () => false, isOutOfProvince: () => false };
  }
  const current = logosIn(catalog, today);
  const byProvince = new Map<string, Set<string>>();
  const isExpired = (change: PlacedChange) =>
    comesFromCatalog(change) && !current.has(change.img ?? "");
  return {
    isExpired,
    isOutOfProvince: (change) => {
      const { prov } = change;
      if (!prov || !comesFromCatalog(change) || isExpired(change)) return false;
      const known = byProvince.get(prov) ?? logosIn(catalog, today, prov);
      byProvince.set(prov, known);
      return !known.has(change.img ?? "");
    },
  };
}

export function outOfProvinceText({ prov }: PlacedChange): string {
  return `Sin promo en ${provincesName(prov)} · doble clic para cambiar`;
}

export const EXPIRED_TEXT = "Vencida · doble clic para cambiar";
