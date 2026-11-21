// flyer_disenos and its conversation: Estudio reads the designs (only tipo 'diseno': the sets of brands
// and the flyers to copy live in the same table), and changes them. A failure is never an empty list
// (invariant 24).
import type { Cut, LogoChange } from "@/shared/flyer-engine/index.ts";
import type { StoredDesign } from "@/shared/lib/studio/design-desk.ts";
import { DESIGN_COLUMNS, type DesignRow, isDesignRow } from "@/shared/lib/studio/design-row.ts";
import type { Backend } from "@/shared/supabase/index.ts";

const CONTENT_COLUMNS = "id,datos,opcion,base_name,nombre,empresa,user_id,estado";
const MESSAGE_COLUMNS = "diseno_id,rol,tipo,texto,autor_nombre,created_at";
const PEOPLE_COLUMNS = "id,full_name,email,email_asesor,role,status";

export interface DesignMessage {
  readonly diseno_id: string;
  readonly rol: string | null;
  readonly texto: string | null;
  readonly autor_nombre: string | null;
  readonly created_at: string | null;
}

export type Threads = Readonly<Record<string, readonly DesignMessage[]>>;

export class StudioError extends Error {
  constructor(cause: unknown) {
    super("Estudio could not do that", { cause });
  }
}

export async function readDesigns({
  db,
  fetchAllRows,
}: Pick<Backend, "db" | "fetchAllRows">): Promise<readonly DesignRow[]> {
  const answer = await fetchAllRows((from, to) =>
    db
      .from("flyer_disenos")
      .select(DESIGN_COLUMNS)
      .eq("tipo", "diseno")
      .order("updated_at", { ascending: false })
      .range(from, to),
  );
  if (!answer.ok) throw new StudioError(answer.error.cause);
  return answer.value.filter(isDesignRow);
}

export async function readDesign({ db }: Pick<Backend, "db">, id: string): Promise<DesignRow> {
  const { data, error } = await db
    .from("flyer_disenos")
    .select(DESIGN_COLUMNS)
    .eq("id", id)
    .single();
  if (error || !isDesignRow(data)) throw new StudioError(error);
  return data;
}

/** What a design holds, tolerant with what earlier versions stored. */
export interface DesignContent {
  readonly changes: readonly LogoChange[];
  readonly uploads: Readonly<Record<string, string>>;
  readonly cuts: readonly Cut[];
  readonly legal: string | null;
}

function fieldOf(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
}

function isChangeList(value: unknown): value is readonly LogoChange[] {
  return Array.isArray(value);
}

function isCutList(value: unknown): value is readonly Cut[] {
  return Array.isArray(value);
}

function isPictureMap(value: unknown): value is Readonly<Record<string, string>> {
  return typeof value === "object" && value !== null;
}

export function contentOf(datos: unknown): DesignContent {
  const changes = fieldOf(datos, "cambios");
  const uploads = fieldOf(datos, "subidos");
  const cuts = fieldOf(datos, "recortes");
  const legal = fieldOf(datos, "legal");
  return {
    changes: isChangeList(changes) ? changes : [],
    uploads: isPictureMap(uploads) ? uploads : {},
    cuts: isCutList(cuts) ? cuts : [],
    legal: typeof legal === "string" ? legal : null,
  };
}

export interface DesignWithContent extends DesignContent {
  readonly id: string;
  readonly name: string;
  readonly company: string;
  readonly option: number;
  readonly baseName: string;
  readonly ownerId: string | null;
  readonly status: string;
}

export async function readDesignContent(
  { db }: Pick<Backend, "db">,
  id: string,
): Promise<DesignWithContent> {
  const { data, error } = await db
    .from("flyer_disenos")
    .select(CONTENT_COLUMNS)
    .eq("id", id)
    .single();
  if (error || !data) throw new StudioError(error);
  return {
    id: data.id,
    name: data.nombre,
    company: data.empresa ?? "",
    option: data.opcion,
    baseName: data.base_name ?? "",
    ownerId: data.user_id,
    status: data.estado,
    ...contentOf(data.datos),
  };
}

/** What the flyer editor needs to open it. */
export function storedDesign(
  design: DesignWithContent,
  myId: string,
  cameFromAdministrator: boolean,
): StoredDesign {
  const mine = design.ownerId === myId;
  const { ownerId: _owner, ...rest } = design;
  return { ...rest, mine, shared: cameFromAdministrator && mine };
}

export async function readThreads(
  { db }: Pick<Backend, "db">,
  ids: readonly string[],
): Promise<Threads> {
  if (ids.length === 0) return {};
  const { data, error } = await db
    .from("flyer_diseno_mensajes")
    .select(MESSAGE_COLUMNS)
    .in("diseno_id", [...ids])
    .order("created_at", { ascending: true });
  if (error) throw new StudioError(error);
  const threads: Record<string, DesignMessage[]> = {};
  for (const message of data) (threads[message.diseno_id] ??= []).push(message);
  return threads;
}

export interface DesignChange {
  readonly estado: string;
  readonly nota_admin?: string;
  readonly opcion_publicada?: number;
}

export type ChangeOutcome =
  | { readonly kind: "changed"; readonly row: DesignRow }
  /** It was not in the states it had to be: somebody changed it meanwhile. */
  | { readonly kind: "changed-meanwhile" }
  | { readonly kind: "failed"; readonly cause: unknown };

function isNoRow(error: { code?: string; message?: string; details?: string }): boolean {
  const text = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""}`;
  return /PGRST116|0 rows|no rows/i.test(text);
}

export async function changeDesign(
  { db }: Pick<Backend, "db">,
  id: string,
  fields: DesignChange,
  expected: readonly string[],
): Promise<ChangeOutcome> {
  try {
    const { data, error } = await db
      .from("flyer_disenos")
      .update(fields)
      .eq("id", id)
      .in("estado", [...expected])
      .select(DESIGN_COLUMNS)
      .single();
    if (error) {
      return isNoRow(error) ? { kind: "changed-meanwhile" } : { kind: "failed", cause: error };
    }
    return isDesignRow(data) ? { kind: "changed", row: data } : { kind: "changed-meanwhile" };
  } catch (cause) {
    return { kind: "failed", cause };
  }
}

export async function deleteDesign({ db }: Pick<Backend, "db">, id: string): Promise<void> {
  const { error } = await db.from("flyer_disenos").delete().eq("id", id);
  if (error) throw new StudioError(error);
}

export interface Person {
  readonly id: string;
  readonly full_name: string | null;
  readonly email: string | null;
  readonly email_asesor: string | null;
  readonly role: string | null;
  readonly status: string | null;
}

export async function readPeople({ db }: Pick<Backend, "db">): Promise<readonly Person[]> {
  const { data, error } = await db.from("profiles").select(PEOPLE_COLUMNS);
  if (error) throw new StudioError(error);
  return data;
}

/** Whether the row is still open, just before creating the flyer of a publication. */
export async function readStatus({ db }: Pick<Backend, "db">, id: string): Promise<string> {
  const { data, error } = await db.from("flyer_disenos").select("estado").eq("id", id).single();
  if (error) throw new StudioError(error);
  return data.estado;
}
