// Promotions of modo.com.ar valid with Galicia that its own site does not publish. They have the
// same columns, so they join the catalog and everything else treats them the same. One that Galicia
// already has (same brand, same benefit) does not join: the one of Galicia stays.
import { daysSignature } from "./days.ts";
import type { Promotion } from "./promotion.ts";
import { expiryStatus } from "./status.ts";
import { decodeEntities, normalizeText } from "./text.ts";

const GENERIC_WORDS =
  /\b(supermercados?|super|hiper(mercados?)?|mayorista|farmacias?|perfumerias?|y|de|del|la|el|los|las|grupo|s ?a)\b/g;
const PERCENT = /(\d+)\s*(?:%|por ciento)/g;
const INSTALLMENTS = /(\d+)\s+cuotas/g;

export type ModoRow = Omit<Promotion, "origen" | "tipo_promocion" | "id"> & {
  readonly id: string;
};

export interface MergedCatalog {
  /** Those of MODO that Galicia does not have. */
  readonly modo: readonly Promotion[];
  /** Galicia plus those. Without any it is the same list, so nothing worked out on it is lost. */
  readonly all: readonly Promotion[];
}

/** The brand to compare with Galicia: "Supermercados Alvear" is "Alvear Supermercados". */
export function modoBrandKey(title: string | null | undefined): string {
  return normalizeText(title).replace(GENERIC_WORDS, " ").replaceAll(" ", "");
}

/** What it gives, in numbers. "25% de ahorro" is "25% de reintegro"; "20% y 6 cuotas" is not "20%". */
export function benefitSignature(benefit: string | null | undefined): string {
  const percents = [...decodeEntities(benefit).matchAll(PERCENT)].map(
    ([, number]) => `p${String(number)}`,
  );
  const installments = [...normalizeText(benefit).matchAll(INSTALLMENTS)].map(
    ([, number]) => `c${String(number)}`,
  );
  return [...percents, ...installments].toSorted().join(",");
}

function coversIt(galicia: Promotion, modo: Promotion, signature: string): boolean {
  if (benefitSignature(galicia.beneficio) !== signature) return false;
  const modoDays = daysSignature(modo.dias);
  const galiciaDays = daysSignature(galicia.dias);
  // Fuel 10% on Tuesdays in Galicia and on weekends in MODO are two promotions.
  if (modoDays && galiciaDays && modoDays !== galiciaDays) return false;
  // An upcoming one of Galicia does not hide one of MODO that is running.
  return !galicia.proximamente || Boolean(modo.proximamente);
}

function isRepeated(modo: Promotion, galiciaByBrand: ReadonlyMap<string, readonly Promotion[]>) {
  const signature = benefitSignature(modo.beneficio);
  // Without numbers ("Regalá Cine") it cannot be compared.
  if (!signature) return false;
  const sameBrand = galiciaByBrand.get(modoBrandKey(modo.titulo)) ?? [];
  return sameBrand.some((galicia) => coversIt(galicia, modo, signature));
}

function groupByBrand(galicia: readonly Promotion[]): Map<string, Promotion[]> {
  const groups = new Map<string, Promotion[]>();
  for (const promotion of galicia) {
    const key = modoBrandKey(promotion.titulo);
    if (!key) continue;
    const list = groups.get(key);
    if (list) list.push(promotion);
    else groups.set(key, [promotion]);
  }
  return groups;
}

function asPromotion(row: ModoRow): Promotion {
  return { ...row, id: `m:${row.id}`, origen: "modo", tipo_promocion: "MODO" };
}

/** What has expired does not join: a copy of MODO from yesterday can have it. */
export function mergeModoPromotions(
  galicia: readonly Promotion[],
  rows: readonly ModoRow[],
  today: Date,
): MergedCatalog {
  const byBrand = groupByBrand(galicia);
  const modo = rows
    .filter(({ id, fecha_hasta }) => id && expiryStatus(fecha_hasta, today) !== "VENCIDA")
    .map(asPromotion)
    .filter((promotion) => !isRepeated(promotion, byBrand));
  return { modo, all: modo.length > 0 ? [...galicia, ...modo] : galicia };
}
