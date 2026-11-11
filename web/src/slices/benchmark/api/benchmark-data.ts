// What Benchmark reads. benchmark-sync leaves everything normalized: here it is only read. Each read
// that fails says so (invariant 24): a table that could not be read is not one without rows.
import { type Backend, failure, type Result, success } from "@/shared/supabase/index.ts";
import { withoutDuplicates } from "../model/dedup.ts";
import { handLoadedRow } from "../model/hand-loaded.ts";
import type {
  BenchBrand,
  BenchPromotion,
  HandLoadedPromotion,
  PremiumCard,
  SourceMeta,
} from "../model/rows.ts";

type Reader = Pick<Backend, "db" | "fetchAllRows">;

/** What was read. A part that could not be read is null: the screen says so. */
export interface BenchmarkData {
  /** The promotions of the comparison, each once, with those loaded by hand. */
  readonly rows: readonly BenchPromotion[];
  readonly brands: readonly BenchBrand[] | null;
  readonly meta: readonly SourceMeta[] | null;
  readonly handLoaded: readonly HandLoadedPromotion[] | null;
}

interface Answer<Row> {
  readonly data: readonly Row[] | null;
  readonly error: unknown;
}

async function listOf<Row>(asking: PromiseLike<Answer<Row>>): Promise<readonly Row[] | null> {
  try {
    const { data, error } = await asking;
    return error ? null : (data ?? []);
  } catch {
    return null;
  }
}

async function promotionsOf({ db, fetchAllRows }: Reader) {
  return fetchAllRows((from, to) =>
    db.from("promos_bench_cache").select("*").order("id").range(from, to),
  );
}

async function brandsOf({ db, fetchAllRows }: Reader): Promise<readonly BenchBrand[] | null> {
  const answer = await fetchAllRows((from, to) =>
    db.from("promos_bench_marcas").select("*").order("marca_clave").range(from, to),
  );
  return answer.ok ? answer.value : null;
}

/** The promotions could not be read: without them there is nothing to compare. */
export const PROMOTIONS_UNREAD =
  "No se pudieron leer las promos del Benchmark. ¿Está aplicada la migración 039?";

export async function readBenchmark(
  reader: Reader,
  today: string,
): Promise<Result<BenchmarkData, string>> {
  const { db } = reader;
  const [promotions, brands, meta, handLoaded] = await Promise.all([
    promotionsOf(reader),
    brandsOf(reader),
    listOf<SourceMeta>(db.from("promos_bench_meta").select("*")),
    listOf<HandLoadedPromotion>(db.from("promos_bench_manual").select("*")),
  ]);
  if (!promotions.ok) return failure(PROMOTIONS_UNREAD);
  const byHand = (handLoaded ?? []).map((promotion) => handLoadedRow(promotion, today));
  return success({
    rows: withoutDuplicates([...promotions.value, ...byHand]),
    brands,
    meta,
    handLoaded,
  });
}

/** The cards, apart: saving one reads only them again. Null: they could not be read. */
export function readCards({ db }: Pick<Backend, "db">): Promise<readonly PremiumCard[] | null> {
  return listOf<PremiumCard>(db.from("promos_bench_tarjetas").select("*"));
}
