// What a test may read of Benchmark that the screen does not show whole: which promotions count, and
// how the screen would name one. It only reads.
import type { BenchmarkValue } from "./benchmark-context.ts";
import {
  audienceText,
  bestOf,
  capText,
  mostInstallments,
  promotionLink,
  returned,
  scheduleText,
} from "./offers.ts";
import type { BenchPromotion } from "./rows.ts";

export interface OfferQuery {
  readonly bank?: string;
  readonly rubro?: string;
  readonly titles?: readonly string[];
}

function matches(row: BenchPromotion, { bank, rubro, titles }: OfferQuery): boolean {
  return (
    (bank === undefined || row.banco === bank) &&
    (rubro === undefined || row.rubro === rubro) &&
    (titles === undefined || titles.includes(row.titulo ?? ""))
  );
}

export function benchmarkProbe({ filtered, screen, days }: BenchmarkValue) {
  const { references } = screen;
  return {
    promotions: () =>
      filtered.map((row) => ({
        title: row.titulo,
        bank: row.banco,
        rubro: row.rubro,
        source: row.fuente ?? null,
        days: row.dias ?? "",
        brandKey: row.marca_clave ?? "",
        banksSharing: row.bancos_n ?? null,
        returned: returned(row, references),
        cap: row.tope ?? null,
        audience: audienceText(row),
      })),
    bestOffer: (query: OfferQuery) => {
      const best = bestOf(
        filtered.filter((row) => matches(row, query)),
        references,
      );
      return best
        ? {
            title: best.row.titulo,
            returned: best.value,
            cap: best.row.tope ?? null,
            audience: audienceText(best.row),
            source: best.row.fuente ?? null,
          }
        : null;
    },
    mostInstallments: (bank: string) =>
      mostInstallments(filtered.filter((row) => row.banco === bank))?.cuotas ?? null,
    present: (row: BenchPromotion) => ({
      link: promotionLink(row),
      schedule: scheduleText(row, days.today),
      cap: capText(row),
      audience: audienceText(row),
    }),
  };
}

export type BenchmarkProbe = ReturnType<typeof benchmarkProbe>;
