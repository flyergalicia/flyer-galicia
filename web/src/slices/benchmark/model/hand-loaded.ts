// Promotions loaded by hand (Macro and Santander do not let their websites be read, and the benefits
// of a package): they enter the comparison like any other, as source 'manual'.
import { argentinaDay } from "./dates.ts";
import type { BenchPromotion, HandLoadedPromotion } from "./rows.ts";

const STOP_WORDS =
  /\b(supermercados?|super|hiper(mercados?)?|mayorista|farmacias?|perfumerias?|y|de|del|la|el|los|las|grupo|s ?a)\b/g;

/** The key of a brand, the same one benchmark-sync uses (modoClave): to join it with other banks. */
export function brandKey(name: string | null | undefined): string {
  return (name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(STOP_WORDS, " ")
    .replace(/[^a-z0-9]+/g, "");
}

const DAY_WORDS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábados", "domingos"];

/** "Martes y jueves"; without days, or with all of them, "Todos los días". */
export function daysText(days: readonly number[] | null | undefined): string {
  if (!days || days.length === 0 || days.length === 7) return "Todos los días";
  // Sorted as text, as the current app does: with one digit it is the same.
  const words = days
    .map(String)
    .toSorted()
    .map((day) => DAY_WORDS[Number(day)] ?? "");
  const last = words.at(-1) ?? "";
  const text = words.length === 1 ? last : `${words.slice(0, -1).join(", ")} y ${last}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function numberOrNull(value: number | string | null | undefined): number | null {
  return value === null || value === undefined ? null : Number(value);
}

/** The days of a hand-loaded promotion, as numbers (0 is Monday). */
export function handLoadedDays(promotion: HandLoadedPromotion): number[] {
  return (promotion.dias_n ?? []).map(Number);
}

/** A hand-loaded promotion as a row of the comparison. */
export function handLoadedRow(
  promotion: HandLoadedPromotion,
  today: string = argentinaDay(),
): BenchPromotion {
  const days = handLoadedDays(promotion);
  const places = promotion.provincias;
  return {
    id: `manual:${promotion.id}`,
    banco: promotion.banco,
    fuente: "manual",
    titulo: promotion.titulo,
    marca_clave: brandKey(promotion.titulo),
    rubro: promotion.rubro || "Otros",
    beneficio: promotion.beneficio || "",
    pct: numberOrNull(promotion.pct),
    tope: numberOrNull(promotion.tope),
    tope_por: promotion.tope_por || null,
    cuotas: promotion.cuotas || 0,
    dias: daysText(days),
    dias_n: days.length === 7 ? [] : days,
    credito: Boolean(promotion.credito),
    debito: Boolean(promotion.debito),
    emisores: [],
    slug: "",
    fuente_url: promotion.fuente_url || "",
    segmento: promotion.segmento || null,
    segmento_txt: promotion.condicion || null,
    provincias: Array.isArray(places) && places.length > 0 ? places : [],
    fecha_desde: promotion.fecha_desde || null,
    fecha_hasta: promotion.fecha_hasta || null,
    proximamente: Boolean(promotion.fecha_desde && promotion.fecha_desde > today),
    bancos_n: null,
  };
}

/** Current: it has not ended. What counts on the label of its bank. */
export function isCurrentHandLoaded(promotion: HandLoadedPromotion, today: string): boolean {
  return !promotion.fecha_hasta || promotion.fecha_hasta >= today;
}
