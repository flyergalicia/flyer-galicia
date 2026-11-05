// Galicia vs X, in words: a draft with today's data, to prepare the talk.
import { bestOf, capText, money, mostInstallments, type Offer, scheduleText } from "./offers.ts";
import { type ReferencePurchases } from "./reference.ts";
import { type BenchPromotion, GALICIA, groupBy } from "./rows.ts";

export const SHOWN_BRANDS = 6;

export interface VersusBrand {
  readonly key: string;
  readonly name: string;
  readonly galicia: Offer;
  readonly other: Offer;
  readonly difference: number;
}

export interface VersusRubro {
  readonly rubro: string;
  readonly galicia: Offer | null;
  readonly other: Offer | null;
  readonly galiciaInstallments: BenchPromotion | null;
  readonly otherInstallments: BenchPromotion | null;
}

export interface Versus {
  readonly galiciaCount: number;
  readonly otherCount: number;
  /** Brands both have. */
  readonly brands: number;
  readonly wins: readonly VersusBrand[];
  readonly losses: readonly VersusBrand[];
  readonly ties: number;
  readonly rubros: readonly VersusRubro[];
  readonly rubrosWon: number;
  readonly rubrosLost: number;
}

function ofBank(rows: readonly BenchPromotion[], bank: string): BenchPromotion[] {
  return rows.filter((row) => row.banco === bank);
}

function rubrosOf(
  list: readonly BenchPromotion[],
  versus: string,
  references: ReferencePurchases,
): VersusRubro[] {
  return [...groupBy(list, (row) => String(row.rubro)).entries()].map(([rubro, rows]) => {
    const galicia = ofBank(rows, GALICIA);
    const other = ofBank(rows, versus);
    return {
      rubro,
      galicia: bestOf(galicia, references),
      other: bestOf(other, references),
      galiciaInstallments: mostInstallments(galicia),
      otherInstallments: mostInstallments(other),
    };
  });
}

function brandsOf(
  list: readonly BenchPromotion[],
  versus: string,
  references: ReferencePurchases,
): VersusBrand[] {
  const groups = groupBy(
    list.filter((row) => row.marca_clave),
    (row) => row.marca_clave ?? "",
  );
  return [...groups.entries()].flatMap(([key, rows]) => {
    const galicia = bestOf(ofBank(rows, GALICIA), references);
    const other = bestOf(ofBank(rows, versus), references);
    if (!galicia || !other) return [];
    const name = rows[0]?.titulo ?? "";
    return [{ key, name, galicia, other, difference: galicia.value - other.value }];
  });
}

function winsOf(rubro: VersusRubro, side: "galicia" | "other"): boolean {
  const { galicia, other } = rubro;
  if (!galicia || !other) return false;
  return side === "galicia" ? galicia.value - other.value >= 1 : other.value - galicia.value >= 1;
}

export function versusOf(
  list: readonly BenchPromotion[],
  versus: string,
  references: ReferencePurchases,
): Versus {
  const brands = brandsOf(list, versus, references);
  const wins = brands
    .filter(({ difference }) => difference >= 1)
    .toSorted((one, other) => other.difference - one.difference);
  const losses = brands
    .filter(({ difference }) => difference <= -1)
    .toSorted((one, other) => one.difference - other.difference);
  const rubros = rubrosOf(list, versus, references);
  return {
    galiciaCount: ofBank(list, GALICIA).length,
    otherCount: ofBank(list, versus).length,
    brands: brands.length,
    wins,
    losses,
    ties: brands.length - wins.length - losses.length,
    rubros,
    rubrosWon: rubros.filter((rubro) => winsOf(rubro, "galicia")).length,
    rubrosLost: rubros.filter((rubro) => winsOf(rubro, "other")).length,
  };
}

/** "$12.000 (30 %, tope $15.000 por mes, lunes)". */
export function offerLine({ row, value }: Offer, today: string): string {
  const cap = (row.tope ?? 0) > 0 ? `, ${capText(row)}` : ", sin tope informado";
  const days = row.dias && row.dias !== "Todos los días" ? `, ${row.dias.toLowerCase()}` : "";
  const schedule = scheduleText(row, today);
  const starts = schedule ? `, ${schedule.toLowerCase()}` : "";
  return `${money(value)} (${String(row.pct)} %${cap}${days}${starts})`;
}
