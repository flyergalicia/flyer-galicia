// What the screen warns about the data: what a province hides, what BBVA does not classify, and the
// promotions of MODO valid with any bank.
import type { BenchFilters, BrandIndex, FilterDays } from "./filters.ts";
import { isInTime, isUpcoming, placesOf } from "./filters.ts";
import { capText, scheduleText } from "./offers.ts";
import { BANKS, type BenchPromotion } from "./rows.ts";

/**
 * With a province chosen, the promotions with no place known are not shown: how many per bank (Macro
 * publishes almost everything without an address on MODO and almost disappears).
 */
export function hiddenWithoutPlace(
  rows: readonly BenchPromotion[],
  brands: BrandIndex,
  province: string,
  today: string,
): string[] {
  if (!province) return [];
  const counts = new Map<string, number>();
  for (const row of rows) {
    const ended = Boolean(row.fecha_hasta && row.fecha_hasta < today);
    const fromWebsite = Boolean(row.fuente && row.fuente !== "modo");
    if (row.proximamente || ended || placesOf(row, brands) !== null || fromWebsite) continue;
    const bank = row.banco ?? "";
    counts.set(bank, (counts.get(bank) ?? 0) + 1);
  }
  return BANKS.filter(({ code }) => counts.get(code)).map(
    ({ code, name }) => `${name} ${String(counts.get(code))}`,
  );
}

const MANY_WITHOUT_RUBRO = 50;

/** The website of BBVA does not say the rubro: those of brands MODO or Galicia know inherit it. */
export function othersNote(rows: readonly BenchPromotion[]): string {
  const count = rows.filter(
    (row) => row.banco === "bbva" && row.fuente === "bbva" && row.rubro === "Otros",
  ).length;
  if (count <= MANY_WITHOUT_RUBRO) return "";
  return `La web de BBVA no informa el rubro de sus promos: ${String(count)} quedan en «Otros» (las marcas que ya estaban en MODO o en Galicia sí lo tienen). «Cara a cara por marca» y «Semana» las comparan igual.`;
}

export const SHARED_SHOWN = 8;

/** The promotions of MODO valid with any bank: they do not count to see who wins. Each once. */
export function sharedPromotions(
  rows: readonly BenchPromotion[],
  filters: Pick<BenchFilters, "rubro">,
  days: FilterDays,
): BenchPromotion[] {
  const seen = new Set<string>();
  const shared: BenchPromotion[] = [];
  for (const row of rows) {
    if (!((row.bancos_n ?? 0) > 1)) continue;
    if (row.fecha_hasta && row.fecha_hasta < days.today) continue;
    if (isUpcoming(row, days.today) && !isInTime(row, days)) continue;
    if (filters.rubro && row.rubro !== filters.rubro) continue;
    // The same promotion comes once per bank.
    const key = String(row.id).split(":").slice(1).join(":");
    if (seen.has(key)) continue;
    seen.add(key);
    shared.push(row);
  }
  return shared.toSorted((one, other) => (other.pct ?? 0) - (one.pct ?? 0));
}

/** ": 15% de reintegro, tope $5.000 por mes · Jueves · Empieza el 5/11", after the name. */
export function sharedLine(row: BenchPromotion, today: string): string {
  const benefit = row.beneficio || (row.pct ? `${String(row.pct)}%` : "");
  const cap = (row.tope ?? 0) > 0 ? `, ${capText(row)}` : "";
  const days = row.dias ? ` · ${row.dias}` : "";
  const schedule = scheduleText(row, today);
  return `: ${benefit}${cap}${days}${schedule ? ` · ${schedule}` : ""}`;
}
