// Which promotions count with the filters on screen.
import { provinceList } from "@/shared/domain/promotions/index.ts";
import { argentinaDay } from "./dates.ts";
import type { BenchBrand, BenchPromotion } from "./rows.ts";

/** Those that have not started enter if they start within these days (decision of the owner). */
export const UPCOMING_DAYS = 15;

const AUDIENCES = ["todos", "clasico", "premium"] as const;
const CARD_TYPES = ["todas", "credito", "debito", "visa", "master", "american_express"] as const;

export type Audience = (typeof AUDIENCES)[number];
export type CardType = (typeof CARD_TYPES)[number];

/** What a list chose, as an audience; anything else is everybody. */
export function audienceOf(value: string): Audience {
  return AUDIENCES.find((audience) => audience === value) ?? "todos";
}

/** What a list chose, as a type of card; anything else is all of them. */
export function cardTypeOf(value: string): CardType {
  return CARD_TYPES.find((card) => card === value) ?? "todas";
}
export type Outcome = "" | "gana" | "pierde" | "empate";

export interface BenchFilters {
  /** Provinces joined by ";"; empty: all of them. */
  readonly prov: string;
  readonly seg: Audience;
  readonly tarj: CardType;
  readonly rubro: string;
  /** The search of Cara a cara. */
  readonly q: string;
  /** "Sólo marcas donde se puede comparar". */
  readonly solo2: boolean;
  readonly resultado: Outcome;
  /** Promotions only for whoever gets their salary at the bank. */
  readonly haberes: boolean;
}

export const FIRST_FILTERS: BenchFilters = {
  prov: "",
  seg: "todos",
  tarj: "todas",
  rubro: "",
  q: "",
  solo2: true,
  resultado: "",
  haberes: false,
};

export type BrandIndex = ReadonlyMap<string, BenchBrand>;

/** The day of today and the last day an upcoming one may start on. */
export interface FilterDays {
  readonly today: string;
  readonly upcomingLimit: string;
}

export function filterDays(now: number = Date.now()): FilterDays {
  return { today: argentinaDay(0, now), upcomingLimit: argentinaDay(UPCOMING_DAYS, now) };
}

/** Where it is valid: its own places (online is the whole country) or those of its brand; null, unknown. */
export function placesOf(row: BenchPromotion, brands: BrandIndex): readonly string[] | null {
  if (Array.isArray(row.provincias)) return row.provincias;
  const brand = brands.get(row.marca_clave ?? "");
  return brand && Array.isArray(brand.provincias) ? brand.provincias : null;
}

/** "Clientes Haberes Galicia", "cobrando el sueldo en ICBC". */
export function isSalaryOnly(row: BenchPromotion): boolean {
  return /haberes|sueldo/i.test(row.segmento_txt ?? "");
}

/** It has not started yet. */
export function isUpcoming(row: BenchPromotion, today: string): boolean {
  return Boolean(row.proximamente || (row.fecha_desde && row.fecha_desde > today));
}

/** Current, or starting within the next days; never one that ended. */
export function isInTime(row: BenchPromotion, { today, upcomingLimit }: FilterDays): boolean {
  if (isUpcoming(row, today) && (!row.fecha_desde || row.fecha_desde > upcomingLimit)) return false;
  return !(row.fecha_hasta && row.fecha_hasta < today);
}

/** Premium can use what is premium and what is general; Clásico/Gold, what is classic and general. */
function matchesAudience(row: BenchPromotion, audience: Audience): boolean {
  if (audience === "clasico") return row.segmento !== "premium";
  if (audience === "premium") return row.segmento !== "clasico";
  return true;
}

function matchesCard(row: BenchPromotion, card: CardType): boolean {
  if (card === "credito") return Boolean(row.credito);
  if (card === "debito") return Boolean(row.debito);
  if (card === "todas") return true;
  const issuers = row.emisores ?? [];
  return issuers.length === 0 || issuers.includes(card);
}

/**
 * Without places: those of MODO are not shown (as in Promociones); those of the website of a bank
 * (a national catalog: Supervielle, BBVA…) are, with "Zona sin confirmar".
 */
function matchesProvince(row: BenchPromotion, chosen: string, brands: BrandIndex): boolean {
  if (!chosen) return true;
  const places = placesOf(row, brands);
  if (places === null) return Boolean(row.fuente && row.fuente !== "modo");
  return places.length === 0 || provinceList(chosen).some((place) => places.includes(place));
}

/** Whether it counts. One of MODO valid with any bank does not tell anybody apart: it goes apart. */
export function passesFilters(
  row: BenchPromotion,
  filters: BenchFilters,
  brands: BrandIndex,
  days: FilterDays,
): boolean {
  if ((row.bancos_n ?? 0) > 1) return false;
  if (!filters.haberes && isSalaryOnly(row)) return false;
  if (!isInTime(row, days)) return false;
  if (filters.rubro && row.rubro !== filters.rubro) return false;
  return (
    matchesAudience(row, filters.seg) &&
    matchesCard(row, filters.tarj) &&
    matchesProvince(row, filters.prov, brands)
  );
}

export function filteredPromotions(
  rows: readonly BenchPromotion[],
  filters: BenchFilters,
  brands: BrandIndex,
  days: FilterDays,
): BenchPromotion[] {
  return rows.filter((row) => passesFilters(row, filters, brands, days));
}

/** The rubros there are, alphabetically, with "Otros" last. */
export function rubrosOf(rows: readonly BenchPromotion[]): string[] {
  const rubros = [...new Set(rows.map(({ rubro }) => String(rubro)))];
  return rubros.toSorted((one, other) => {
    if (one === "Otros") return 1;
    if (other === "Otros") return -1;
    return one.localeCompare(other, "es");
  });
}

/** The provinces any brand is in, to choose from. */
export function provincesOf(brands: BrandIndex): string[] {
  const provinces = new Set<string>();
  for (const brand of brands.values()) {
    for (const province of brand.provincias ?? []) provinces.add(province);
  }
  return [...provinces].toSorted();
}

export function brandIndex(brands: readonly BenchBrand[]): BrandIndex {
  return new Map(brands.map((brand) => [brand.marca_clave, brand]));
}
