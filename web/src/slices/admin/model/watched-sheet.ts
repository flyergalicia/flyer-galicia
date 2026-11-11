// Config → Marcas vigiladas: the brands of each flyer with how they stand against the catalog, with
// those of MODO (a brand only on MODO is not expired: invariant 26).
import {
  normalizeText,
  type Promotion,
  type WatchedBrand,
  type WatchedBrandsFile,
} from "@/shared/domain/promotions/index.ts";

const DAY_MS = 86_400_000;
const SOON_DAYS = 7;
const STUDIO_ORIGIN = "estudio";

export type WatchedState =
  | { readonly kind: "ok" }
  | { readonly kind: "soon"; readonly days: number }
  | { readonly kind: "expired" };

function startOfDay(day: Date): number {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
}

function isOfTheBrand(brand: WatchedBrand, key: string, promotion: Promotion): boolean {
  if (brand.img && promotion.imagen === brand.img) return true;
  return Boolean(key) && normalizeText(promotion.titulo) === key;
}

/**
 * A promotion of the brand with no date keeps it current; otherwise, the one that ends last. Those
 * still to come do not count: today they give nothing.
 */
export function watchedState(
  brand: WatchedBrand,
  catalog: readonly Promotion[],
  today: Date,
): WatchedState {
  const day = startOfDay(today);
  const key = normalizeText(brand.t || brand.m || "");
  let latest = -1;
  for (const promotion of catalog) {
    if (promotion.proximamente || !isOfTheBrand(brand, key, promotion)) continue;
    if (!promotion.fecha_hasta) return { kind: "ok" };
    const ends = new Date(`${promotion.fecha_hasta}T00:00:00`).getTime();
    if (ends >= day && ends > latest) latest = ends;
  }
  if (latest < 0) return { kind: "expired" };
  const days = Math.round((latest - day) / DAY_MS);
  return days <= SOON_DAYS ? { kind: "soon", days } : { kind: "ok" };
}

export function stateText(state: WatchedState): string {
  if (state.kind === "expired") return "Sin promo vigente";
  if (state.kind === "soon")
    return `Vence en ${String(state.days)} ${state.days === 1 ? "día" : "días"}`;
  return "Vigente";
}

export interface WatchedRow {
  readonly brand: WatchedBrand;
  /** What takes it out of the list: its logo or, without one, its name. */
  readonly key: string;
  readonly name: string;
  /** Its title on the catalog, when it is not how it was pasted. */
  readonly title: string;
  readonly fromStudio: boolean;
  readonly state: WatchedState;
}

export interface WatchedSection {
  readonly option: string;
  readonly rows: readonly WatchedRow[];
  /** Those that expired or end within seven days. */
  readonly toReview: number;
}

export function brandKey(brand: WatchedBrand): string {
  return brand.img || brand.m || "";
}

function rowOf(brand: WatchedBrand, catalog: readonly Promotion[], today: Date): WatchedRow {
  const name = brand.m || brand.t || "";
  return {
    brand,
    key: brandKey(brand),
    name,
    title: brand.t && brand.t !== brand.m ? brand.t : "",
    fromStudio: brand.origen === STUDIO_ORIGIN,
    state: watchedState(brand, catalog, today),
  };
}

/** One section per flyer that watches something, in the order of their numbers. */
export function watchedSections(
  file: WatchedBrandsFile,
  catalog: readonly Promotion[],
  today: Date = new Date(),
): readonly WatchedSection[] {
  return Object.keys(file.opciones).flatMap((option) => {
    const list = file.opciones[option] ?? [];
    if (list.length === 0) return [];
    const rows = list.map((brand) => rowOf(brand, catalog, today));
    return [{ option, rows, toReview: rows.filter(({ state }) => state.kind !== "ok").length }];
  });
}

/**
 * By brand, not by place: if the list changed meanwhile, the right one still goes. Null: it was not
 * there anymore, nothing to save.
 */
export function withoutWatched(
  file: WatchedBrandsFile,
  option: string,
  key: string,
): WatchedBrandsFile | null {
  const list = file.opciones[option] ?? [];
  const at = list.findIndex((brand) => brandKey(brand) === key);
  if (at < 0) return null;
  return {
    ...file,
    opciones: { ...file.opciones, [option]: list.filter((_brand, index) => index !== at) },
  };
}
