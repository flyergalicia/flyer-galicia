import {
  type CloudHandler,
  type CloudReply,
  type CloudRequest,
  contentRange,
  databaseError,
  emptyReply,
  jsonBody,
  jsonReply,
  pagedRows,
} from "../http.ts";
import { type CloudState, type Row } from "../state.ts";

const MISSING_RELATION = "relation does not exist";

function readOnlyRows(state: CloudState, table: string): Row[] {
  const tables: Record<string, Row[]> = {
    promos_bench_cache: state.benchmarkPromotions,
    promos_bench_marcas: state.benchmarkBrands,
    promos_bench_meta: state.benchmarkMeta,
    promos_bench_hist: state.benchmarkHistory,
  };
  return tables[table] ?? [];
}

export const benchmarkTables: CloudHandler = (request) => {
  const { state, path, file } = request;
  state.benchmarkRequests.push(path);
  return state.benchmarkTablesMissing
    ? databaseError(MISSING_RELATION, "42P01", 404)
    : pagedRows(request, readOnlyRows(state, file));
};

function writeRow(request: CloudRequest, rows: Row[]): CloudReply | undefined {
  const { method, query, state } = request;
  const body = jsonBody(request);
  state.benchmarkCardWrites.push({ method, body, idFilter: query.get("id") });
  const id = (query.get("id") ?? "").replace(/^eq\./, "");
  const index = rows.findIndex((row) => row.id === id);
  if (method === "POST") {
    rows.push({ id: `nueva${String(rows.length)}x`, ...body });
    return jsonReply([], 201);
  }
  if (method === "PATCH") {
    if (index >= 0) Object.assign(rows[index] ?? {}, body);
    return emptyReply(204);
  }
  if (method === "DELETE") {
    if (index >= 0) rows.splice(index, 1);
    return emptyReply(204);
  }
  return undefined;
}

/** Writable by the administrator only, like the policy in the database (migration 042). */
function adminWritableTable(
  rowsOf: (state: CloudState) => Row[],
  isMissing: (state: CloudState) => boolean,
): CloudHandler {
  return (request) => {
    const { state, method, user } = request;
    if (isMissing(state)) return databaseError(MISSING_RELATION, "42P01", 404);
    const rows = rowsOf(state);
    if (method === "GET") {
      return jsonReply(rows, 200, { "Content-Range": contentRange(0, rows.length, rows.length) });
    }
    if (user.role !== "admin") {
      return databaseError(
        'new row violates row-level security policy for table "promos_bench_tarjetas"',
        "42501",
        403,
      );
    }
    return writeRow(request, rows);
  };
}

export const benchmarkCards = adminWritableTable(
  (state) => state.benchmarkCards,
  (state) => state.benchmarkCardsMissing,
);

export const benchmarkManual = adminWritableTable(
  (state) => state.benchmarkManual,
  (state) => state.benchmarkManualMissing,
);
