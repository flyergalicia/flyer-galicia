// Which brands the windows of logos offer. The same filters as Activas: province, locality, category,
// one per brand and without those online. Each card is one logo: the promotions of a logo go together.
import {
  baseBrand,
  brandGroupKey,
  expiryStatus,
  formatDate,
  formatDays,
  isBetterPromotion,
  isInLocality,
  isInProvince,
  isModoPromotion,
  isOnlinePromotion,
  isSupermarket,
  normalizeText,
  ownDays,
  type Promotion,
  type PromotionZone,
  promotionNote,
  provincesName,
  readDays,
  EVERY_DAY_TEXT,
  type SupermarketIndex,
  titleCase,
  benefitText,
} from "@/shared/domain/promotions/index.ts";

export interface BrandFilters {
  readonly search: string;
  readonly category: string;
  /** Several go joined by ";". */
  readonly province: string;
  readonly locality: string;
  readonly onePerBrand: boolean;
  readonly hideOnline: boolean;
  readonly onlyPercent: boolean;
}

export interface BrandList {
  readonly list: readonly Promotion[];
  /** Every promotion of each logo. */
  readonly ofLogo: ReadonlyMap<string, readonly Promotion[]>;
}

/** How many cards the window shows: the rest is found by writing or choosing a category. */
export const MAX_CARDS = 60;
const NO_NOTE_LENGTH = 70;
const CUT_NOTE_LENGTH = 67;
const SHORT_DATE_LENGTH = 5;

function passes(
  promotion: Promotion,
  filters: BrandFilters,
  localityIds: ReadonlySet<string> | null,
  today: Date,
): boolean {
  if (!promotion.imagen || promotion.proximamente) return false;
  if (expiryStatus(promotion.fecha_hasta, today) === "VENCIDA") return false;
  if (filters.category && promotion.subtitulo !== filters.category) return false;
  if (filters.province && !isInProvince(promotion, filters.province)) return false;
  if (filters.hideOnline && isOnlinePromotion(promotion)) return false;
  return !localityIds || isInLocality(promotion, filters.province, filters.locality, localityIds);
}

function byLogo(
  catalog: readonly Promotion[],
  filters: BrandFilters,
  localityIds: ReadonlySet<string> | null,
  today: Date,
) {
  const best = new Map<string, Promotion>();
  const ofLogo = new Map<string, Promotion[]>();
  for (const promotion of catalog) {
    if (passes(promotion, filters, localityIds, today)) {
      const logo = promotion.imagen ?? "";
      const known = best.get(logo);
      if (!known || isBetterPromotion(promotion, known)) best.set(logo, promotion);
      ofLogo.set(logo, [...(ofLogo.get(logo) ?? []), promotion]);
    }
  }
  return { best, ofLogo };
}

function oneByName(promotions: Iterable<Promotion>): Promotion[] {
  const seen = new Set<string>();
  const result: Promotion[] = [];
  for (const promotion of promotions) {
    const name = normalizeText(promotion.titulo);
    if (!seen.has(name)) {
      seen.add(name);
      result.push(promotion);
    }
  }
  return result;
}

function oneByBrand(promotions: readonly Promotion[]): Promotion[] {
  const bases = new Set(promotions.map(({ titulo }) => baseBrand(titulo)));
  const groups = new Map<string, Promotion>();
  for (const promotion of promotions) {
    const key = brandGroupKey(baseBrand(promotion.titulo), bases);
    const known = groups.get(key);
    if (!known || isBetterPromotion(promotion, known)) groups.set(key, promotion);
  }
  return [...groups.values()];
}

function onlineRank(promotion: Promotion): number {
  return isOnlinePromotion(promotion) ? 1 : 0;
}

function compareBrands(query: string, withProvince: boolean) {
  return (one: Promotion, other: Promotion) => {
    const [first, second] = [normalizeText(one.titulo), normalizeText(other.titulo)];
    if (query) {
      const startsWith = (name: string) => (name.startsWith(query) ? 0 : 1);
      const difference = startsWith(first) - startsWith(second);
      if (difference) return difference;
    }
    // With a province, those of the place first: those online go after.
    if (withProvince) {
      const difference = onlineRank(one) - onlineRank(other);
      if (difference) return difference;
    }
    if (first === second) return 0;
    return first < second ? -1 : 1;
  };
}

export function filterBrands(
  catalog: readonly Promotion[],
  filters: BrandFilters,
  localityIds: readonly (string | number)[] | null,
  supermarkets: SupermarketIndex,
  zone: PromotionZone | null,
  today: Date = new Date(),
): BrandList {
  const ids = filters.locality && localityIds ? new Set(localityIds.map(String)) : null;
  const { best, ofLogo } = byLogo(catalog, filters, ids, today);
  let shown = oneByName(best.values());
  if (filters.onePerBrand) shown = oneByBrand(shown);
  if (filters.onlyPercent) {
    shown = shown.filter((promotion) => supermarkets.hasPercentDiscount(promotion, zone));
  }
  const words = normalizeText(filters.search).split(" ").filter(Boolean);
  if (words.length > 0) {
    shown = shown.filter((promotion) => {
      const name = normalizeText(promotion.titulo);
      return words.every((word) => name.includes(word));
    });
  }
  const list = shown.toSorted(compareBrands(words.join(" "), Boolean(filters.province)));
  return { list, ofLogo };
}

/** "3 promos": each card is a logo, and the detail comes up when the mouse rests on it. */
export function promotionsOfLogoDetail(promotions: readonly Promotion[]): string {
  return promotions
    .map((promotion) => {
      const benefit = benefitText(promotion) || promotion.titulo;
      const days = ownDays(promotion);
      const modo = isModoPromotion(promotion) ? " · MODO" : "";
      return `${benefit}${days ? ` (${days})` : ""}${modo}`;
    })
    .join("\n");
}

/** The days of a supermarket on its card: those of that promotion and, if other go on the flyer, which. */
export function daysOfCard(
  promotion: Promotion,
  supermarkets: SupermarketIndex,
  zone: PromotionZone | null,
): string {
  if (!isSupermarket(promotion)) return "";
  const own = ownDays(promotion);
  const onFlyer = supermarkets.flyerDays(promotion, zone);
  const read = readDays(promotion.dias);
  const written = read.everyDay ? EVERY_DAY_TEXT : formatDays(read.days);
  const isSame = normalizeText(own) === normalizeText(onFlyer) || written === onFlyer;
  if (own && onFlyer && !isSame) return `${own} (en el flyer: ${onFlyer})`;
  return own || (onFlyer ? `en el flyer: ${onFlyer}` : "");
}

export function shortNote(promotion: Promotion): string {
  const note = promotionNote(promotion);
  return note.length > NO_NOTE_LENGTH ? `${note.slice(0, CUT_NOTE_LENGTH)}…` : note;
}

export function untilDate(promotion: Promotion): string {
  return promotion.fecha_hasta ? formatDate(promotion.fecha_hasta).slice(0, SHORT_DATE_LENGTH) : "";
}

/** Where the list is looking: the province and locality chosen. */
export function whereChosen({ province, locality }: BrandFilters): string {
  if (!province) return "";
  return ` en ${locality ? titleCase(locality) : provincesName(province)}`;
}

/** What the window says over its list. */
export function listInfo(filters: BrandFilters, total: number): string {
  const where = whereChosen(filters);
  if (total === 0) return "";
  if (total > MAX_CARDS) {
    return `Mostrando ${MAX_CARDS} de ${total} marcas vigentes${where}: escribí o elegí un rubro para encontrar la tuya.`;
  }
  return `${total}${total === 1 ? " marca vigente" : " marcas vigentes"}${where}.`;
}

/** What the window of a strip says over its list. */
export function stripListInfo(filters: BrandFilters, total: number): string {
  const where = whereChosen(filters);
  if (total > MAX_CARDS) {
    return `Mostrando ${MAX_CARDS} de ${total} marcas vigentes${where}: escribí o elegí un rubro para encontrar las tuyas.`;
  }
  return `${total}${total === 1 ? " marca vigente" : " marcas vigentes"}${where}.`;
}
