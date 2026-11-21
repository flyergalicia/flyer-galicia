// Cara a cara por marca: the best of each bank on each brand, and who wins against the one compared.
import type { Outcome } from "./filters.ts";
import { bestOf, type Offer } from "./offers.ts";
import type { ReferencePurchases } from "./reference.ts";
import { BANKS, type BenchPromotion, GALICIA, groupBy } from "./rows.ts";

/** What the brands draw: more weighs too much on the computers of the branches. */
export const MAX_BRAND_ROWS = 250;

export type BrandResult = Exclude<Outcome, ""> | "solo" | "sin";

export interface BrandRow {
  readonly key: string;
  readonly name: string;
  readonly offers: ReadonlyMap<string, Offer | null>;
  readonly top: number;
  readonly result: BrandResult;
}

export interface BrandOptions {
  readonly versus: string;
  readonly search: string;
  readonly comparableOnly: boolean;
  readonly outcome: Outcome;
}

const RESULT_ORDER: Readonly<Record<BrandResult, number>> = {
  pierde: 0,
  gana: 1,
  empate: 2,
  solo: 3,
  sin: 4,
};

function resultOf(galicia: Offer | null, other: Offer | null): BrandResult {
  if (!galicia) return "sin";
  if (!other) return "solo";
  if (Math.abs(galicia.value - other.value) < 1) return "empate";
  return galicia.value > other.value ? "gana" : "pierde";
}

function offersOf(
  rows: readonly BenchPromotion[],
  references: ReferencePurchases,
): Map<string, Offer | null> {
  const byBank = groupBy(rows, (row) => row.banco ?? "");
  return new Map(BANKS.map(({ code }) => [code, bestOf(byBank.get(code) ?? [], references)]));
}

/** Both have it, or at least two banks do and one of them is Galicia or the one compared. */
function isComparable(offers: ReadonlyMap<string, Offer | null>, versus: string): boolean {
  const galicia = offers.get(GALICIA);
  const other = offers.get(versus);
  const banks = [...offers.values()].filter(Boolean).length;
  return Boolean((galicia && other) || (banks >= 2 && (galicia || other)));
}

function brandRow(
  key: string,
  rows: readonly BenchPromotion[],
  references: ReferencePurchases,
  versus: string,
): BrandRow {
  const offers = offersOf(rows, references);
  return {
    key,
    name: rows[0]?.titulo ?? "",
    offers,
    top: Math.max(0, ...[...offers.values()].map((offer) => offer?.value ?? 0)),
    result: resultOf(offers.get(GALICIA) ?? null, offers.get(versus) ?? null),
  };
}

/** Losses first, then wins, ties, only Galicia; within each, the one that gives back the most. */
export function brandRows(
  list: readonly BenchPromotion[],
  references: ReferencePurchases,
  options: BrandOptions,
): BrandRow[] {
  const search = options.search.toLowerCase();
  const groups = groupBy(
    list.filter((row) => row.marca_clave),
    (row) => row.marca_clave ?? "",
  );
  const rows: BrandRow[] = [];
  for (const [key, group] of groups) {
    const row = brandRow(key, group, references, options.versus);
    if (search && !row.name.toLowerCase().includes(search)) continue;
    if (options.comparableOnly && !isComparable(row.offers, options.versus)) continue;
    if (options.outcome && options.outcome !== row.result) continue;
    rows.push(row);
  }
  return rows.toSorted(
    (one, other) => RESULT_ORDER[one.result] - RESULT_ORDER[other.result] || other.top - one.top,
  );
}

/** How many won, lost and tied, of those listed. */
export function outcomeCounts(
  rows: readonly BrandRow[],
): Readonly<Record<"gana" | "pierde" | "empate", number>> {
  return {
    gana: rows.filter(({ result }) => result === "gana").length,
    pierde: rows.filter(({ result }) => result === "pierde").length,
    empate: rows.filter(({ result }) => result === "empate").length,
  };
}
