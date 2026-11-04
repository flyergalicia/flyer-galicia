// What a supermarket carries on the flyer. It usually has several promotions at once (Coto: "Hasta
// 12 cuotas · Todos los días" and "25% de ahorro · Martes"): on the flyer go ONLY the days of the %
// discount, gathered from the current promotions of the same supermarket (same logo or same brand).
import { baseBrand } from "./brands.ts";
import { EVERY_DAY_TEXT, formatDays, ownDays, readDays } from "./days.ts";
import { isInLocality, isInProvince } from "./geography.ts";
import { isSupermarket, type Promotion } from "./promotion.ts";
import { expiryStatus } from "./status.ts";

/** The zone chosen, to look only at its promotions. */
export interface PromotionZone {
  readonly key: string;
  readonly includes: (promotion: Promotion) => boolean;
}

export interface SupermarketIndex {
  /** What goes under its logo. With a zone, only its promotions count. */
  readonly flyerDays: (
    promotion: Promotion | null | undefined,
    zone?: PromotionZone | null,
  ) => string;
  /** Whether it has a current % discount: it earns the red dot, and its days on the flyer. */
  readonly hasPercentDiscount: (
    promotion: Promotion | null | undefined,
    zone?: PromotionZone | null,
  ) => boolean;
}

/**
 * Province and, when Galicia has answered what is in the locality, only that (plus those online,
 * which are of no place). Without a province, the whole country: no zone.
 */
export function promotionZone(
  province: string,
  locality = "",
  idsInLocality: readonly (string | number)[] | null = null,
): PromotionZone | null {
  if (!province) return null;
  const ids = locality && idsInLocality ? new Set(idsInLocality.map(String)) : null;
  return {
    key: ids ? `${province}|${locality}|${String(ids.size)}` : `${province}|`,
    includes: (promotion) =>
      isInProvince(promotion, province) &&
      (!ids || isInLocality(promotion, province, locality, ids)),
  };
}

function isCurrent(promotion: Promotion, today: Date): boolean {
  return !promotion.proximamente && expiryStatus(promotion.fecha_hasta, today) !== "VENCIDA";
}

function hasPercent(promotion: Promotion): boolean {
  return (promotion.beneficio ?? "").includes("%");
}

function daysOfDiscounts(group: readonly Promotion[]): string {
  const days = new Set<number>();
  let everyDay = false;
  let notUnderstood = "";
  for (const promotion of group.filter(hasPercent)) {
    const read = readDays(promotion.dias);
    everyDay ||= read.everyDay;
    for (const day of read.days) days.add(day);
    // A sentence that is not understood goes as it is.
    if (!read.everyDay && read.days.size === 0 && promotion.dias)
      notUnderstood = ownDays(promotion);
  }
  return everyDay ? EVERY_DAY_TEXT : formatDays(days) || notUnderstood;
}

function createSupermarketIndex(catalog: readonly Promotion[]): SupermarketIndex {
  const byKey = new Map<string, Promotion[]>();
  const answers = new Map<string, string>();
  // A base without the column of the benefit uses the days as they come. One promotion without a
  // benefit in a base that has the column does not: its days could be those of installments.
  const hasBenefits = catalog.some(({ beneficio }) => Boolean(beneficio));
  const add = (key: string, promotion: Promotion) => {
    const list = byKey.get(key);
    if (list) list.push(promotion);
    else byKey.set(key, [promotion]);
  };
  for (const promotion of catalog.filter(isSupermarket)) {
    if (promotion.imagen) add(`i:${promotion.imagen}`, promotion);
    add(`m:${baseBrand(promotion.titulo)}`, promotion);
  }
  const sameSupermarket = (promotion: Promotion): Promotion[] => [
    ...(byKey.get(`i:${promotion.imagen ?? ""}`) ?? []),
    ...(byKey.get(`m:${baseBrand(promotion.titulo)}`) ?? []),
  ];
  const currentGroup = (promotion: Promotion, zone: PromotionZone | null | undefined) => {
    const today = new Date();
    return [...new Set(sameSupermarket(promotion))].filter(
      (other) => isCurrent(other, today) && (!zone || zone.includes(other)),
    );
  };
  const workOutDays = (promotion: Promotion, zone: PromotionZone | null | undefined): string => {
    const group = currentGroup(promotion, zone);
    if (zone && group.length === 0) return "";
    return hasBenefits ? daysOfDiscounts(group) : ownDays(promotion);
  };
  return {
    flyerDays: (promotion, zone) => {
      if (!promotion) return "";
      if (!isSupermarket(promotion)) return ownDays(promotion);
      const key = `${promotion.imagen ?? ""}|${promotion.titulo}|${zone?.key ?? ""}`;
      const known = answers.get(key);
      if (known !== undefined) return known;
      const days = workOutDays(promotion, zone);
      answers.set(key, days);
      return days;
    },
    hasPercentDiscount: (promotion, zone) => {
      if (!promotion || !isSupermarket(promotion)) return false;
      return currentGroup(promotion, zone).some(hasPercent);
    },
  };
}

const indexes = new WeakMap<readonly Promotion[], SupermarketIndex>();

/** One per catalog: a new catalog brings a new list, and the index is worked out again. */
export function supermarketIndexOf(catalog: readonly Promotion[]): SupermarketIndex {
  const known = indexes.get(catalog);
  if (known) return known;
  const index = createSupermarketIndex(catalog);
  indexes.set(catalog, index);
  return index;
}
