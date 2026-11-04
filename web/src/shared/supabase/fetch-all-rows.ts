import { failure, type Result, success } from "./result.ts";

export const ROWS_PER_PAGE = 1000;

export interface PageAnswer<Row> {
  readonly data: readonly Row[] | null;
  readonly error: unknown;
}

/** Asks for one window of rows, always with a stable order: without one, pages repeat rows. */
export type PageBuilder<Row> = (from: number, to: number) => PromiseLike<PageAnswer<Row>>;

export interface PartialRows<Row> {
  readonly cause: unknown;
  /** What had arrived before it failed. */
  readonly partialRows: readonly Row[];
}

/**
 * PostgREST answers at most 1000 rows per query and says nothing about the rest, so this keeps
 * asking while a page comes full (invariant 7).
 */
export function fetchAllRows<Row>(
  buildPage: PageBuilder<Row>,
  pageSize: number = ROWS_PER_PAGE,
): Promise<Result<Row[], PartialRows<Row>>> {
  return nextPage(buildPage, pageSize, 0, []);
}

async function nextPage<Row>(
  buildPage: PageBuilder<Row>,
  pageSize: number,
  from: number,
  rows: Row[],
): Promise<Result<Row[], PartialRows<Row>>> {
  let answer: PageAnswer<Row>;
  try {
    answer = await buildPage(from, from + pageSize - 1);
  } catch (cause) {
    return failure({ cause, partialRows: rows });
  }
  if (answer.error) return failure({ cause: answer.error, partialRows: rows });
  const page = answer.data ?? [];
  rows.push(...page);
  return page.length === pageSize
    ? nextPage(buildPage, pageSize, from + pageSize, rows)
    : success(rows);
}
