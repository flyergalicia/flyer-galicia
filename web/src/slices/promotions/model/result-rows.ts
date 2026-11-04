// The rows of the table: one per brand pasted on Buscar, plus the other promotions of each brand;
// one per promotion of the zone on Activas.
import {
  type Candidate,
  decodeEntities,
  finalStatus,
  isInLocality,
  isInProvince,
  isModoPromotion,
  matchBrand,
  type Promotion,
  promotionsByTitle,
  type PromotionStatus,
  siblingPromotions,
} from "@/shared/domain/promotions/index.ts";

export interface ResultRow {
  /** Which row it is, whatever happens to the list. */
  readonly key: number;
  /** As it was pasted; on Activas, the name of the promotion. */
  readonly brand: string;
  /** The pasted line it comes from: two brands written differently are never joined. */
  readonly group: number | null;
  readonly status: PromotionStatus;
  readonly promotion: Promotion | null;
  readonly candidates: readonly Candidate[];
  readonly needsReview: boolean;
  /** Ticked out of the report. */
  readonly excluded: boolean;
  /** undefined: not asked yet. null: asked, and there is none. */
  readonly startDate: string | null | undefined;
  /** The row whose coincidence brought it: it goes away if that one changes. */
  readonly siblingOf: number | null;
}

type NewRow = Pick<ResultRow, "brand" | "status" | "promotion"> & Partial<ResultRow>;

let lastKey = 0;

function createRow(row: NewRow): ResultRow {
  lastKey += 1;
  return {
    key: lastKey,
    group: null,
    candidates: [],
    needsReview: false,
    excluded: false,
    // Those that have not started bring their date: nobody has to ask for it.
    startDate: row.promotion?.fecha_desde || undefined,
    siblingOf: null,
    ...row,
  };
}

function siblingRows(
  row: ResultRow,
  byTitle: ReadonlyMap<string, readonly Promotion[]>,
  province: string,
  monthRef: Date,
): ResultRow[] {
  if (!row.promotion) return [];
  return siblingPromotions(row.promotion, byTitle).map((promotion) =>
    createRow({
      brand: row.brand,
      group: row.group,
      status: finalStatus(promotion, province, monthRef),
      promotion,
      siblingOf: row.key,
    }),
  );
}

export interface PlaceChoice {
  readonly province: string;
  readonly locality: string;
  readonly category: string;
  readonly localityIds: readonly (string | number)[] | null;
}

function mainRow(
  brand: string,
  group: number,
  catalog: readonly Promotion[],
  province: string,
  monthRef: Date,
): ResultRow {
  const { best, candidates, needsReview } = matchBrand(brand, catalog);
  if (!best) {
    return createRow({ brand, group, status: "NO_ENCONTRADA", promotion: null });
  }
  return createRow({
    brand,
    group,
    status: needsReview ? "REVISAR" : finalStatus(best.promotion, province, monthRef),
    promotion: best.promotion,
    candidates,
    needsReview,
  });
}

export interface SearchResult {
  /** What goes on the table. */
  readonly rows: readonly ResultRow[];
  /** One per pasted brand. */
  readonly brandRows: readonly ResultRow[];
}

/** Every promotion of each brand goes together, under the one the search chose. */
export function searchRows(
  brands: readonly string[],
  catalog: readonly Promotion[],
  province: string,
  monthRef: Date,
): SearchResult {
  const byTitle = promotionsByTitle(catalog);
  const brandRows = brands.map((brand, group) =>
    mainRow(brand, group, catalog, province, monthRef),
  );
  const rows = brandRows.flatMap((row) =>
    row.promotion && !row.needsReview
      ? [row, ...siblingRows(row, byTitle, province, monthRef)]
      : [row],
  );
  return { rows, brandRows };
}

/** What is dubious or missing is said at once, with the proposal: "Alta Volta → ¿Volta?". */
export function searchNotice(brandRows: readonly ResultRow[]): string | null {
  const toReview = brandRows.filter(({ needsReview }) => needsReview);
  const notFound = brandRows.filter(({ status }) => status === "NO_ENCONTRADA");
  const parts: string[] = [];
  if (toReview.length > 0) {
    const proposals = toReview
      .slice(0, 3)
      .map(({ brand, promotion }) => `${brand} → ¿${decodeEntities(promotion?.titulo)}?`)
      .join(", ");
    parts.push(
      `${String(toReview.length)} para revisar: ${proposals}${toReview.length > 3 ? "..." : ""}`,
    );
  }
  if (notFound.length > 0) {
    const names = notFound
      .slice(0, 4)
      .map(({ brand }) => brand)
      .join(", ");
    parts.push(
      `${String(notFound.length)} sin coincidencia: ${names}${notFound.length > 4 ? "..." : ""}. Si es una promo nueva de hoy, tocá «Actualizar catálogo ahora» y volvé a validar`,
    );
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** The date of start is asked only for what shows as certain; MODO brings its own. */
export function idsToAskStartDate(rows: readonly ResultRow[]): number[] {
  return rows.flatMap(({ promotion, needsReview }) =>
    promotion && !needsReview && !isModoPromotion(promotion) ? galiciaIds([promotion.id]) : [],
  );
}

/** Galicia only answers for its own ids. */
export function galiciaIds(ids: readonly (number | string)[]): number[] {
  return ids.filter((id) => typeof id === "number");
}

function isInZone(promotion: Promotion, choice: PlaceChoice, ids: ReadonlySet<string> | null) {
  if (!isInProvince(promotion, choice.province)) return false;
  if (ids && !isInLocality(promotion, choice.province, choice.locality, ids)) return false;
  return !choice.category || decodeEntities(promotion.subtitulo) === choice.category;
}

/** Everything current in the zone, by name. */
export function activeRows(
  catalog: readonly Promotion[],
  choice: PlaceChoice,
  now: Date,
): ResultRow[] {
  const ids =
    choice.locality && choice.localityIds ? new Set(choice.localityIds.map(String)) : null;
  return catalog
    .filter((promotion) => isInZone(promotion, choice, ids))
    .map((promotion) =>
      createRow({
        brand: decodeEntities(promotion.titulo),
        status: finalStatus(promotion, choice.province, now),
        promotion,
      }),
    )
    .toSorted((one, other) => (one.brand.toLowerCase() < other.brand.toLowerCase() ? -1 : 1));
}

/** Another province changes the verdict of each brand, not which one it is. */
export function withStatusesOf(
  rows: readonly ResultRow[],
  province: string,
  monthRef: Date,
): readonly ResultRow[] {
  const withStatus = (row: ResultRow, promotion: Promotion): ResultRow => ({
    ...row,
    status: finalStatus(promotion, province, monthRef),
  });
  return rows.map((row) =>
    row.promotion && !row.needsReview ? withStatus(row, row.promotion) : row,
  );
}

/** Only for the promotions that were answered for. */
export function withStartDates(
  rows: readonly ResultRow[],
  dates: Readonly<Record<string, string | null>>,
): readonly ResultRow[] {
  const dated = (row: ResultRow, startDate: string | null): ResultRow => ({ ...row, startDate });
  return rows.map((row) => {
    const date = row.promotion ? dates[String(row.promotion.id)] : undefined;
    return date === undefined ? row : dated(row, date);
  });
}

export interface ChosenMatch {
  readonly rows: readonly ResultRow[];
  /** Whose date of start to ask: the chosen one. */
  readonly chosenId: number | string | null;
  /** And those that came with it. */
  readonly siblingIds: readonly (number | string)[];
}

/**
 * What the person chose on a row to review: a candidate, or none. The other promotions of the brand
 * that was chosen go below it, and those of the match of before go away.
 */
export function withChosenMatch(
  rows: readonly ResultRow[],
  key: number,
  index: number,
  catalog: readonly Promotion[],
  province: string,
  monthRef: Date,
): ChosenMatch | null {
  const row = rows.find((one) => one.key === key);
  if (!row) return null;
  const candidate = row.candidates[index];
  const chosen: ResultRow = {
    ...row,
    promotion: candidate?.promotion ?? null,
    status: candidate ? finalStatus(candidate.promotion, province, monthRef) : "NO_ENCONTRADA",
    needsReview: false,
    startDate: null,
  };
  const siblings = siblingRows(chosen, promotionsByTitle(catalog), province, monthRef);
  return {
    rows: rows
      .filter(({ siblingOf }) => siblingOf !== key)
      .flatMap((one) => (one.key === key ? [chosen].concat(siblings) : [one])),
    chosenId: chosen.promotion?.id ?? null,
    siblingIds: siblings.flatMap(({ promotion }) => (promotion ? [promotion.id] : [])),
  };
}

/** What can be saved as watched brands, and what stays out of it. */
export function watchableRows(rows: readonly ResultRow[]) {
  const found = rows.filter(
    ({ promotion, excluded, needsReview, status }) =>
      promotion && !excluded && !needsReview && status !== "NO_ENCONTRADA",
  );
  const left = rows
    .filter((row) => !row.excluded && !found.includes(row))
    .map(({ brand }) => brand);
  return { found, left };
}
