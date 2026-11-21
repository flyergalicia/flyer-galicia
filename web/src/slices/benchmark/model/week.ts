// Semana: the best of each bank, day by day, and all the promotions of one bank on one day.
import { dayName, validOnDay, WEEKDAYS } from "./dates.ts";
import { bestOf, type Offer, returned } from "./offers.ts";
import type { ReferencePurchases } from "./reference.ts";
import { BANKS, bankName, type BenchPromotion, groupBy } from "./rows.ts";

export const MAX_DAY_ROWS = 120;

export interface WeekCell {
  readonly bank: string;
  readonly offer: Offer | null;
  /** How many promotions of the bank are valid that day. */
  readonly count: number;
}

export interface WeekRow {
  readonly day: number;
  readonly name: string;
  readonly cells: readonly WeekCell[];
  readonly top: number;
}

export function weekRows(
  list: readonly BenchPromotion[],
  references: ReferencePurchases,
): WeekRow[] {
  const byBank = groupBy(list, (row) => row.banco ?? "");
  return WEEKDAYS.map((name, day) => {
    const cells = BANKS.map(({ code }) => {
      const ofDay = (byBank.get(code) ?? []).filter((row) => validOnDay(row.dias_n, day));
      return { bank: code, offer: bestOf(ofDay, references), count: ofDay.length };
    });
    return { day, name, cells, top: Math.max(0, ...cells.map(({ offer }) => offer?.value ?? 0)) };
  });
}

export interface DayPick {
  readonly day: number;
  readonly bank: string;
}

export interface RankedPromotion {
  readonly row: BenchPromotion;
  /** What it gives back; 0 when it gives no money back. */
  readonly value: number;
}

/** Each with what it gives back, the most first; then the longest installments. */
export function ranked(
  list: readonly BenchPromotion[],
  references: ReferencePurchases,
): RankedPromotion[] {
  return list
    .map((row) => ({ row, value: returned(row, references) ?? 0 }))
    .toSorted(
      (one, other) => other.value - one.value || (other.row.cuotas ?? 0) - (one.row.cuotas ?? 0),
    );
}

/** All the promotions of one bank on one day, the one that gives back the most first. */
export function dayListing(
  list: readonly BenchPromotion[],
  references: ReferencePurchases,
  { day, bank }: DayPick,
): RankedPromotion[] {
  return list
    .filter((row) => row.banco === bank && validOnDay(row.dias_n, day))
    .map((row) => ({ row, value: returned(row, references) ?? 0 }))
    .toSorted(
      (one, other) =>
        other.value - one.value ||
        (other.row.cuotas ?? 0) - (one.row.cuotas ?? 0) ||
        String(one.row.titulo).localeCompare(String(other.row.titulo), "es"),
    );
}

/** "BBVA · Lunes: 3 promos". */
export function listingTitle({ day, bank }: DayPick, count: number): string {
  return `${bankName(bank)} · ${dayName(day)}: ${String(count)} promos`;
}

/** What the listing says under its title. */
export function listingNote(count: number): string {
  const more = count > MAX_DAY_ROWS ? ` Se muestran las primeras ${String(MAX_DAY_ROWS)}.` : "";
  return `Todas las promos que valen ese día, de la que más devuelve a la que menos, con la compra de referencia de arriba.${more}`;
}
