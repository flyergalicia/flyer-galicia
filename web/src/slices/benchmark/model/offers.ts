// What a promotion gives back and how the screen names it. Who wins is who gives back the most on the
// reference purchase of its rubro: min(purchase × %, cap). Installments compare apart.
import { argentinaDay, shortDate } from "./dates.ts";
import { type ReferencePurchases, referenceOf } from "./reference.ts";
import type { BenchPromotion } from "./rows.ts";

/** "$12.345", rounded. */
export function money(amount: number): string {
  return `$${Math.round(amount).toLocaleString("es-AR")}`;
}

/** What it gives back on the reference purchase; null when it gives no money (installments only). */
export function returned(row: BenchPromotion, references: ReferencePurchases): number | null {
  const percent = row.pct ?? 0;
  // "100% OFF" is not a refund.
  if (!(percent > 0) || percent >= 100) return null;
  const gross = (referenceOf(references, row.rubro) * percent) / 100;
  const cap = row.tope ?? 0;
  return cap > 0 ? Math.min(gross, cap) : gross;
}

const CAP_PERIOD: Readonly<Record<string, string>> = {
  month: " por mes",
  week: " por semana",
  day: " por día",
  transaction: " por compra",
  total: " en total",
};

export function capText(row: BenchPromotion): string {
  const cap = row.tope ?? 0;
  if (!(cap > 0)) return "sin tope informado";
  return `tope ${money(cap)}${CAP_PERIOD[row.tope_por ?? ""] ?? ""}`;
}

function capitalized(text: string): string {
  return text.replace(/^./, (letter) => letter.toUpperCase());
}

/** A benefit of a package loaded by hand, or a segment that Galicia writes for its clients. */
function namedAudience(row: BenchPromotion): string | null {
  const segment = row.segmento_txt ?? "";
  const pack = /paquete[^·]*/i.exec(segment);
  if (pack) return capitalized(pack[0].trim());
  const clients = /^clientes?\s+(.*(haberes|galicia).*)$/i.exec(segment);
  if (clients?.[1] !== undefined && row.banco === "galicia") {
    return clients[1]
      .replace(
        /(^|\s)(\S)/g,
        (_whole, before: string, letter: string) => before + letter.toUpperCase(),
      )
      .replace(/Eminent/g, "Éminent");
  }
  return null;
}

const CARD_LEVEL =
  /(visa platinum|mastercard platinum|platinum|signature|black|identit[eé]|\bselect\b|[eé]minent|infinite|gold|cl[aá]sica?)/i;

function audienceOfSegment(row: BenchPromotion): string {
  const text = `${row.segmento_txt ?? ""} ${row.beneficio ?? ""}`;
  const level = /nivel\s*(\d)/i.exec(text)?.[1];
  // Galicia: "para clientes Plus Gold".
  const galicia = /\b(plus gold|plus|move)\b/i.exec(row.segmento_txt ?? "")?.[1];
  if (galicia) return galicia.replace(/\b./g, (letter) => letter.toUpperCase());
  if (/selecta/i.test(text)) return `Selecta${level ? ` Nivel ${level}` : ""}`;
  if (level) return `Nivel ${level}`;
  const card = CARD_LEVEL.exec(text)?.[1];
  if (card)
    return capitalized(card)
      .replace(/identite/i, "Identité")
      .replace(/eminent/i, "Éminent");
  return row.segmento === "premium" ? "Premium" : "Clásico/Gold";
}

/** Who it is only for, as the bank names them ("Selecta Nivel 2", "Visa Platinum"); empty: everybody. */
export function audienceText(row: BenchPromotion): string {
  const named = namedAudience(row);
  if (named !== null) return named;
  return row.segmento ? audienceOfSegment(row) : "";
}

/** "Sólo el 10/11 (un solo día)" or "Empieza el 10/11"; empty when it already started. */
export function scheduleText(row: BenchPromotion, today: string = argentinaDay()): string {
  const { fecha_desde: from, fecha_hasta: to } = row;
  if (from && from === to) return `Sólo el ${shortDate(from)} (un solo día)`;
  return from && from > today ? `Empieza el ${shortDate(from)}` : "";
}

export function isHttps(address: string | null | undefined): boolean {
  return /^https:\/\//i.test(address ?? "");
}

const BANK_PAGES: Readonly<Record<string, string>> = {
  bbva: "https://go.bbva.com.ar/",
  macro: "https://www.macro.com.ar/beneficios",
  supervielle: "https://www.supervielle.com.ar/beneficios",
  icbc: "https://www.beneficios.icbc.com.ar/",
  santander: "https://www.santander.com.ar/personas/beneficios",
  galicia: "https://beneficios.galicia.ar/",
};

/** Where to see the promotion: on MODO, on the page of the bank, or where it was loaded from. */
export function promotionLink(row: BenchPromotion): string {
  const source = row.fuente || "modo";
  const slug = row.slug ?? "";
  if (source === "manual") return isHttps(row.fuente_url) ? (row.fuente_url ?? "") : "";
  if (source === "modo") {
    return slug ? `https://www.modo.com.ar/promos/${encodeURIComponent(slug)}` : "";
  }
  const galicia = /^galicia:g(\d+)$/.exec(row.id ?? "")?.[1];
  if (galicia) return `https://beneficios.galicia.ar/promocion/${galicia}`;
  const santander = /^brand:(\d+)$/.exec(slug)?.[1];
  if (santander) {
    return `https://www.santander.com.ar/personas/beneficios#/brand?brandId=${santander}`;
  }
  return BANK_PAGES[row.banco ?? ""] ?? "";
}

/** How few can use it: for everybody, classic, premium. */
export function accessLevel(row: BenchPromotion): number {
  if (row.segmento === "premium") return 2;
  return row.segmento === "clasico" ? 1 : 0;
}

export interface Offer {
  readonly row: BenchPromotion;
  readonly value: number;
}

function capOrEndless(row: BenchPromotion): number {
  return row.tope || Number.POSITIVE_INFINITY;
}

/** On a tie (Macro Selecta levels 2, 3 and 4 give back the same), the most accessible, then the lowest cap. */
function winsTheTie(row: BenchPromotion, best: BenchPromotion): boolean {
  const access = accessLevel(row);
  const bestAccess = accessLevel(best);
  return access < bestAccess || (access === bestAccess && capOrEndless(row) < capOrEndless(best));
}

/** The one that gives back the most; null when none gives money back. */
export function bestOf(
  list: readonly BenchPromotion[],
  references: ReferencePurchases,
): Offer | null {
  let best: BenchPromotion | null = null;
  let bestValue = -1;
  for (const row of list) {
    const value = returned(row, references);
    if (value === null) continue;
    const ties = best !== null && Math.abs(value - bestValue) < 1;
    if (value > bestValue + 0.5 || (ties && best !== null && winsTheTie(row, best))) {
      bestValue = Math.max(value, bestValue);
      best = row;
    }
  }
  return best ? { row: best, value: bestValue } : null;
}

/** The one with the longest interest-free installments; null when none has them. */
export function mostInstallments(list: readonly BenchPromotion[]): BenchPromotion | null {
  let best: BenchPromotion | null = null;
  for (const row of list) {
    const installments = row.cuotas ?? 0;
    if (installments > 0 && (!best || installments > (best.cuotas ?? 0))) best = row;
  }
  return best;
}

/** Whether a value is as good as the best of its group (the green of the screen). */
export function isTopValue(offer: Offer | null, top: number): boolean {
  return offer !== null && top > 0 && offer.value >= top - 0.5;
}
