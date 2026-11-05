// The saved sets of brands live in flyer_disenos with tipo 'combinacion': each person sees theirs and
// the administrator all of them. The list asks only for what it shows; the content comes when applying.
import type { Backend, Json } from "@/shared/supabase/index.ts";
import type { SavedSetData } from "../model/saved-set.ts";

export const SAVED_SETS_QUERY_KEY = ["logo-editor", "saved-sets"] as const;

const COLUMNS =
  "id,nombre,user_id,autor,updated_at,opcion,miniatura,v:datos->>v,resumen:datos->>resumen,flyer:datos->>flyer,prov:datos->>prov";
const CONTENT_COLUMNS = "id,datos,opcion,base_name,nombre,empresa,user_id,estado";

export interface SavedSetRow {
  readonly id: string;
  readonly nombre: string;
  readonly user_id: string | null;
  readonly autor: string | null;
  readonly updated_at: string | null;
  readonly opcion: number | null;
  readonly miniatura: string | null;
  readonly v: string | null;
  readonly resumen: string | null;
  readonly flyer: string | null;
  readonly prov: string | null;
}

export interface SavedSetFields {
  readonly nombre: string;
  readonly opcion: number;
  readonly base_name: string;
  readonly datos: SavedSetData;
  readonly miniatura: string;
}

function isRow(value: unknown): value is SavedSetRow {
  return typeof value === "object" && value !== null && "id" in value;
}

export class SavedSetsError extends Error {
  constructor(cause: unknown) {
    super("The saved sets could not be used", { cause });
  }
}

/** A failure is never an empty list (invariant 24). */
export async function readSavedSets({
  db,
  fetchAllRows,
}: Pick<Backend, "db" | "fetchAllRows">): Promise<readonly SavedSetRow[]> {
  const answer = await fetchAllRows((from, to) =>
    db
      .from("flyer_disenos")
      .select(COLUMNS)
      .eq("tipo", "combinacion")
      .order("updated_at", { ascending: false })
      .range(from, to),
  );
  if (!answer.ok) throw new SavedSetsError(answer.error.cause);
  return answer.value.filter(isRow);
}

function asJson(data: SavedSetData): Json {
  const copy: Json = JSON.parse(JSON.stringify(data));
  return copy;
}

export async function saveSavedSet(
  { db }: Pick<Backend, "db">,
  fields: SavedSetFields,
  replacing: string,
): Promise<SavedSetRow> {
  const row = { ...fields, datos: asJson(fields.datos) };
  const request = replacing
    ? db.from("flyer_disenos").update(row).eq("id", replacing)
    : db
        .from("flyer_disenos")
        .insert({ empresa: "", estado: "privado", tipo: "combinacion", ...row });
  const { data, error } = await request.select(COLUMNS).single();
  if (error || !isRow(data)) throw new SavedSetsError(error);
  return data;
}

export async function deleteSavedSet({ db }: Pick<Backend, "db">, id: string): Promise<void> {
  const { error } = await db.from("flyer_disenos").delete().eq("id", id);
  if (error) throw new SavedSetsError(error);
}

/** Only Estudio renames one. */
export async function renameSavedSet(
  { db }: Pick<Backend, "db">,
  id: string,
  nombre: string,
): Promise<void> {
  const { error } = await db
    .from("flyer_disenos")
    .update({ nombre })
    .eq("id", id)
    .select(COLUMNS)
    .single();
  if (error) throw new SavedSetsError(error);
}

/** A set stored by an earlier version may lack what came later. */
type StoredContent = Omit<SavedSetData, "grupos" | "subidos"> & Partial<SavedSetData>;

function isContent(value: unknown): value is StoredContent {
  return (
    typeof value === "object" && value !== null && "items" in value && Array.isArray(value.items)
  );
}

/** What a set holds, tolerant with what was stored by earlier versions. */
export async function readSavedSetContent(
  { db }: Pick<Backend, "db">,
  id: string,
): Promise<{ readonly name: string; readonly data: SavedSetData | null }> {
  const { data, error } = await db
    .from("flyer_disenos")
    .select(CONTENT_COLUMNS)
    .eq("id", id)
    .single();
  if (error) throw new SavedSetsError(error);
  const content: unknown = data?.datos;
  if (!isContent(content) || content.items.length === 0) {
    return { name: data?.nombre ?? "", data: null };
  }
  return {
    name: data?.nombre ?? "",
    data: { ...content, grupos: content.grupos ?? [], subidos: content.subidos ?? {} },
  };
}

/** What is said about a failure. */
export function failureText(cause: unknown): string {
  const inner = cause instanceof SavedSetsError ? cause.cause : cause;
  const message =
    typeof inner === "object" && inner !== null ? Reflect.get(inner, "message") : inner;
  const text = typeof message === "string" ? message : "";
  if (/does not exist|relation|schema cache/i.test(text)) {
    return "falta preparar la base para Estudio (avisale al administrador).";
  }
  if (/row-level security|permission|policy/i.test(text)) return "no tenés permiso para hacer eso.";
  if (!text || /failed to fetch|networkerror|network/i.test(text))
    return "sin conexión. Probá de nuevo.";
  return text;
}
