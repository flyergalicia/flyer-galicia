// Resumen por rubro: the best of each bank on each rubro, who wins, and the longest installments.
import { bestOf, mostInstallments, type Offer } from "./offers.ts";
import type { ReferencePurchases } from "./reference.ts";
import { BANKS, type BenchPromotion, GALICIA, groupBy } from "./rows.ts";

export interface BankCell {
  readonly bank: string;
  readonly offer: Offer | null;
  readonly count: number;
  readonly installments: BenchPromotion | null;
}

export interface RubroRow {
  readonly rubro: string;
  readonly cells: readonly BankCell[];
  /** The most given back on this rubro, for the green. */
  readonly top: number;
  /** The longest installments on this rubro. */
  readonly topInstallments: number;
}

export interface RubroScore {
  /** Rubros where both have promotions. */
  readonly compared: number;
  readonly galiciaWins: number;
  readonly otherWins: number;
  readonly ties: number;
}

export interface BankBar {
  readonly bank: string;
  readonly name: string;
  readonly count: number;
  /** Its share of the longest. */
  readonly share: number;
}

function cellsOf(rows: readonly BenchPromotion[], references: ReferencePurchases): BankCell[] {
  const byBank = groupBy(rows, (row) => row.banco ?? "");
  return BANKS.map(({ code }) => {
    const ofBank = byBank.get(code) ?? [];
    return {
      bank: code,
      offer: bestOf(ofBank, references),
      count: ofBank.length,
      installments: mostInstallments(ofBank),
    };
  });
}

/** The rubros, the one with the most promotions first. */
export function rubroRows(
  list: readonly BenchPromotion[],
  references: ReferencePurchases,
): RubroRow[] {
  const byRubro = [...groupBy(list, (row) => String(row.rubro)).entries()].toSorted(
    ([, one], [, other]) => other.length - one.length,
  );
  return byRubro.map(([rubro, rows]) => {
    const cells = cellsOf(rows, references);
    return {
      rubro,
      cells,
      top: Math.max(0, ...cells.map(({ offer }) => offer?.value ?? 0)),
      topInstallments: Math.max(...cells.map(({ installments }) => installments?.cuotas ?? 0)),
    };
  });
}

function cellOf(row: RubroRow, bank: string): BankCell | undefined {
  return row.cells.find((cell) => cell.bank === bank);
}

/** How many rubros each one wins against the bank it is compared with. */
export function rubroScore(rows: readonly RubroRow[], versus: string): RubroScore {
  let compared = 0;
  let galiciaWins = 0;
  let otherWins = 0;
  let ties = 0;
  for (const row of rows) {
    const galicia = cellOf(row, GALICIA)?.offer;
    const other = cellOf(row, versus)?.offer;
    if (!galicia || !other) continue;
    compared += 1;
    if (Math.abs(galicia.value - other.value) < 1) ties += 1;
    else if (galicia.value > other.value) galiciaWins += 1;
    else otherWins += 1;
  }
  return { compared, galiciaWins, otherWins, ties };
}

/** How many promotions each bank has with these filters. */
export function bankBars(list: readonly BenchPromotion[]): BankBar[] {
  const counts = BANKS.map(({ code }) => list.filter((row) => row.banco === code).length);
  const longest = Math.max(...counts) || 1;
  return BANKS.map(({ code, name }, index) => {
    const count = counts[index] ?? 0;
    return { bank: code, name, count, share: count / longest };
  });
}
