// Test support: the screen of Benchmark over simulated tables of promotions, brands, sources, cards and
// promotions loaded by hand. A table set as missing answers as one that does not exist.
import { render } from "vitest-browser-react";
import { ADVISOR, type AppAnswers, createAppHarness } from "@/shared/lib/testing/app-harness.tsx";
import { jsonResponse, type RecordedRequest } from "@/shared/supabase/testing/recording-fetch.ts";
import { PlaceDeskReader } from "@/shared/lib/testing/PlaceDeskReader.tsx";
import { BenchmarkStage } from "./BenchmarkStage.tsx";

type Row = Readonly<Record<string, unknown>>;

export interface BenchTables {
  promotions: Row[];
  brands: Row[];
  meta: Row[];
  cards: Row[];
  manual: Row[];
  /** Tables that do not answer: as a migration not applied, or a connection that dropped. */
  missing: Set<string>;
  /** What the edge function was asked, in order. */
  calls: Row[];
  /** While set, the promotions do not answer: a slow reading. */
  gate: Promise<void> | null;
}

const MISSING = { message: 'relation "x" does not exist', code: "42P01" };

function eq(value: string | null): string {
  return value?.replace(/^eq\./, "") ?? "";
}

function writable(rows: Row[], table: string, tables: BenchTables) {
  return ({ method, query, body }: RecordedRequest): Response => {
    if (tables.missing.has(table)) return jsonResponse(MISSING, 404);
    const id = eq(query.get("id"));
    const index = rows.findIndex((row) => row["id"] === id);
    if (method === "POST") {
      rows.push({ id: `nueva${String(rows.length)}`, ...Object(body) });
      return new Response(null, { status: 201 });
    }
    if (method === "PATCH") {
      if (index >= 0) rows[index] = { ...rows[index], ...Object(body) };
      return new Response(null, { status: 204 });
    }
    if (method === "DELETE") {
      if (index >= 0) rows.splice(index, 1);
      return new Response(null, { status: 204 });
    }
    return jsonResponse(rows);
  };
}

function readOnly(rows: () => Row[], table: string, tables: BenchTables) {
  return async (): Promise<Response> => {
    if (table === "promos_bench_cache" && tables.gate) await tables.gate;
    return tables.missing.has(table) ? jsonResponse(MISSING, 404) : jsonResponse(rows());
  };
}

export interface BenchmarkCloud extends Omit<AppAnswers, "admin"> {
  /** The person is the administrator. */
  readonly isAdmin?: boolean;
  readonly promotions?: readonly Row[];
  readonly brands?: readonly Row[];
  readonly meta?: readonly Row[];
  readonly cards?: readonly Row[];
  readonly manual?: readonly Row[];
  readonly missing?: readonly string[];
  readonly handLoadedPage?: boolean;
  /** What benchmark-sync answers; by default, done with nothing left. */
  readonly sync?: (body: Row) => Response | Promise<Response>;
}

export async function openBenchmark(cloud: BenchmarkCloud = {}) {
  const { isAdmin = true, handLoadedPage = false, sync, tables: extraTables, ...rest } = cloud;
  const tables: BenchTables = {
    promotions: [...(cloud.promotions ?? [])],
    brands: [...(cloud.brands ?? [])],
    meta: [...(cloud.meta ?? [])],
    cards: [...(cloud.cards ?? [])],
    manual: [...(cloud.manual ?? [])],
    missing: new Set(cloud.missing ?? []),
    calls: [],
    gate: null,
  };
  const harness = createAppHarness({
    ...rest,
    profile: { ...ADVISOR, role: isAdmin ? "admin" : "asesor" },
    files: {
      "_facultades.json": { roles: { asesor: { benchmark: true } } },
      ...cloud.files,
    },
    tables: {
      promos_bench_cache: readOnly(() => tables.promotions, "promos_bench_cache", tables),
      promos_bench_marcas: readOnly(() => tables.brands, "promos_bench_marcas", tables),
      promos_bench_meta: readOnly(() => tables.meta, "promos_bench_meta", tables),
      promos_bench_tarjetas: writable(tables.cards, "promos_bench_tarjetas", tables),
      promos_bench_manual: writable(tables.manual, "promos_bench_manual", tables),
      ...extraTables,
    },
    functions: {
      "benchmark-sync": async (request) => {
        const body: Row = Object(request.body);
        tables.calls.push(body);
        if (sync) return sync(body);
        return jsonResponse({ data: { resultados: [{ total: 1 }], pendientes: 0 } });
      },
    },
  });
  harness.storeSession();
  const screen = await render(
    harness.wrap(
      <>
        <PlaceDeskReader />
        <BenchmarkStage handLoadedPage={handLoadedPage} />
      </>,
    ),
  );
  return { screen, harness, tables };
}
