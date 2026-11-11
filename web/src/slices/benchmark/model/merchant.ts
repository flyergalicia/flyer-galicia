// Por comercio: "I am at this shop, which promotion do I have?", of every bank, the best first.
import { dayName, validOnDay } from "./dates.ts";
import { brandKey } from "./hand-loaded.ts";
import { capText, money } from "./offers.ts";
import type { ReferencePurchases } from "./reference.ts";
import { bankName, type BenchPromotion } from "./rows.ts";
import { ranked, type RankedPromotion } from "./week.ts";

export const MAX_MERCHANT_ROWS = 150;

/** Any day of the week. */
export const ANY_DAY = -1;

export type MerchantSearch =
  | { readonly kind: "too-short" }
  | { readonly kind: "none" }
  | {
      readonly kind: "found";
      readonly list: readonly RankedPromotion[];
      /** The first, when it gives money back. */
      readonly best: RankedPromotion | null;
    };

export function merchantSearch(
  list: readonly BenchPromotion[],
  references: ReferencePurchases,
  typed: string,
  day: number,
): MerchantSearch {
  const key = brandKey(typed);
  const words = typed.trim().toLowerCase();
  if (key.length < 2) return { kind: "too-short" };
  const found = list.filter(
    (row) =>
      ((row.marca_clave ?? "").includes(key) || (row.titulo ?? "").toLowerCase().includes(words)) &&
      (day < 0 || validOnDay(row.dias_n, day)),
  );
  if (found.length === 0) return { kind: "none" };
  const sorted = ranked(found, references);
  const first = sorted[0] ?? null;
  return { kind: "found", list: sorted, best: first && first.value > 0 ? first : null };
}

/** "La que más devuelve el jueves:" and what follows, for the best one found. */
export function bestLine(best: RankedPromotion, day: number): { lead: string; rest: string } {
  const on = day >= 0 ? ` el ${dayName(day).toLowerCase()}` : "";
  return {
    lead: `La que más devuelve${on}:`,
    rest: ` ${bankName(best.row.banco)} · ${best.row.titulo ?? ""} — ${money(best.value)} en una compra de referencia (${capText(best.row)}).`,
  };
}

/** "12 promos (se muestran las primeras 150). «Devuelve» usa…". */
export function foundLine(count: number): string {
  const more =
    count > MAX_MERCHANT_ROWS ? ` (se muestran las primeras ${String(MAX_MERCHANT_ROWS)})` : "";
  return `${String(count)} promos${more}. «Devuelve» usa la compra de referencia de cada rubro, ajustable arriba.`;
}
