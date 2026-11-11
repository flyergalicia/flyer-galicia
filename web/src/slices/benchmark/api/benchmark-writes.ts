// What the administrator writes: the cards and the promotions loaded by hand. The database only lets
// an administrator do it (migrations 042 and 043).
import type { Backend } from "@/shared/supabase/index.ts";
import type { CardWrite } from "../model/card-form.ts";
import type { HandLoadedWrite } from "../model/hand-loaded-form.ts";

/** "error": the database said no, with its words; "network": it did not answer. */
export type WriteOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly kind: "error"; readonly message: string }
  | { readonly ok: false; readonly kind: "network" };

interface Answered {
  readonly error: { readonly message?: string } | null;
}

/** What an answer of the database means for whoever wrote. */
export async function outcomeOf(asking: PromiseLike<Answered>): Promise<WriteOutcome> {
  try {
    const { error } = await asking;
    if (error) return { ok: false, kind: "error", message: error.message || "error" };
    return { ok: true };
  } catch {
    return { ok: false, kind: "network" };
  }
}

type Database = Pick<Backend, "db">;

export function saveCard({ db }: Database, id: string, row: CardWrite): Promise<WriteOutcome> {
  const table = db.from("promos_bench_tarjetas");
  return outcomeOf(id ? table.update(row).eq("id", id) : table.insert(row));
}

export function removeCard({ db }: Database, id: string): Promise<WriteOutcome> {
  return outcomeOf(db.from("promos_bench_tarjetas").delete().eq("id", id));
}

export function saveHandLoaded(
  { db }: Database,
  id: string,
  row: HandLoadedWrite,
): Promise<WriteOutcome> {
  const table = db.from("promos_bench_manual");
  const written = {
    ...row,
    dias_n: [...row.dias_n],
    provincias: row.provincias && [...row.provincias],
  };
  return outcomeOf(id ? table.update(written).eq("id", id) : table.insert(written));
}

export function removeHandLoaded({ db }: Database, id: string): Promise<WriteOutcome> {
  return outcomeOf(db.from("promos_bench_manual").delete().eq("id", id));
}

/** What the screen says when it could not save or remove. */
export function writeProblem(outcome: WriteOutcome, verb: "guardar" | "quitar"): string | null {
  if (outcome.ok) return null;
  if (outcome.kind === "network") return `No se pudo ${verb}. Revisá la conexión.`;
  return `No se pudo ${verb}: ${outcome.message}`;
}
