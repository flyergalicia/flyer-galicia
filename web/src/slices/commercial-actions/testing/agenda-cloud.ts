// Test support: what the agenda reads of the table of actions, told apart by what it asks.
import { type Answer, jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import { fieldsOf } from "./commercial-cloud.ts";
import { anAction } from "./fixtures.ts";

type Row = object;

export interface AgendaTable {
  /** What the period has: the agenda reads it from and to a date. */
  readonly period?: readonly Row[];
  readonly dataLists?: readonly Row[];
  readonly unassigned?: readonly Row[];
  readonly cannotAttend?: readonly Row[];
}

function isInRange(row: Row, query: URLSearchParams): boolean {
  const date = String(Reflect.get(row, "fecha"));
  const dates = query.getAll("fecha");
  const from = dates.find((value) => value.startsWith("gte."))?.slice(4) ?? "";
  const to = dates.find((value) => value.startsWith("lte."))?.slice(4) ?? "9999";
  return date >= from && date <= to;
}

function isOfHunter(row: Row, query: URLSearchParams): boolean {
  const hunter = query.get("hunter_id")?.replace(/^eq\./, "");
  return !hunter || Reflect.get(row, "hunter_id") === hunter;
}

/** What the table of actions answers to the agenda, to what opens from it and to saving. */
export function agendaTable(table: AgendaTable = {}): Answer {
  const { period = [], dataLists = [], unassigned = [], cannotAttend = [] } = table;
  const all = [...period, ...dataLists, ...unassigned, ...cannotAttend];
  return (request) => {
    const { method, query, body } = request;
    if (method === "POST") return jsonResponse(anAction({ id: "new", ...fieldsOf(body) }), 201);
    const id = query.get("id") ?? "";
    if (id.startsWith("eq.")) {
      return jsonResponse(all.filter((row) => Reflect.get(row, "id") === id.slice(3)));
    }
    if (id.startsWith("in.")) return jsonResponse(all);
    if (query.get("tipo") === "eq.datos") {
      return jsonResponse(dataLists.filter((row) => isOfHunter(row, query)));
    }
    if (query.get("hunter_id") === "is.null") return jsonResponse(unassigned);
    if (query.has("no_puede_at")) return jsonResponse(cannotAttend);
    if (query.has("fecha")) {
      return jsonResponse(period.filter((row) => isInRange(row, query) && isOfHunter(row, query)));
    }
    return jsonResponse([]);
  };
}
