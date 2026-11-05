// What is read and written of the actions. A failure is never an empty list (invariant 24).
import type { Backend, Database } from "@/shared/supabase/index.ts";
import { messageOf } from "../model/failure-text.ts";
import type {
  ActionChanges,
  ActionRow,
  DayOccupancy,
  EventRow,
  ListedAction,
  MessageRow,
  MyCompany,
  NewAction,
  NewPerson,
  PersonChanges,
  PersonRow,
  TakenTime,
  UnreadMessages,
} from "./rows.ts";

const LIST_LIMIT = 500;
const PLANNED_FOR_COMPANY_MAX = 3;
const PLANNED_COLUMNS = "id,fecha,tipo,creada_por,origen";

export class CommercialError extends Error {
  constructor(cause: unknown) {
    super(messageOf(cause), { cause });
  }
}

type Db = Pick<Backend, "db">;
type Rpc = Pick<Backend, "rpc">;

function hasId(value: unknown): value is { readonly id: unknown } {
  return typeof value === "object" && value !== null && "id" in value;
}

function isListedAction(value: unknown): value is ListedAction {
  return hasId(value) && "empresa" in value;
}

function isUnreadMessages(value: unknown): value is UnreadMessages {
  return typeof value === "object" && value !== null && "gestion_id" in value;
}

function isTakenTime(value: unknown): value is TakenTime {
  return hasId(value) && "hora_desde" in value;
}

function isDayOccupancy(value: unknown): value is DayOccupancy {
  return typeof value === "object" && value !== null && "hunter_id" in value;
}

function rowsOf(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

export async function readActionList({ rpc }: Rpc, onlyMine: boolean) {
  const answer = await rpc("gestiones_lista", { p_limit: LIST_LIMIT, p_solo_mio: onlyMine });
  if (!answer.ok) throw new CommercialError(answer.error);
  return rowsOf(answer.value).filter(isListedAction);
}

/** The chips of the list: if it fails, there are none. */
export async function readUnreadMessages({
  rpc,
}: Rpc): Promise<ReadonlyMap<string, UnreadMessages>> {
  const answer = await rpc("gestiones_mensajes_nuevos");
  if (!answer.ok) return new Map();
  const rows = rowsOf(answer.value).filter(isUnreadMessages);
  return new Map(rows.map((row) => [row.gestion_id, row]));
}

export async function readMyCompanies({ db }: Db, me: string): Promise<readonly MyCompany[]> {
  const { data, error } = await db
    .from("padron_empresas")
    .select("empresa,cuits")
    .eq("user_id", me)
    .order("empresa");
  if (error) throw new CommercialError(error);
  return data ?? [];
}

export async function readAction({ db }: Db, id: string): Promise<ActionRow | null> {
  const { data, error } = await db.from("gestiones").select("*").eq("id", id).maybeSingle();
  if (error) throw new CommercialError(error);
  return data;
}

/** A list can go over 1000 people: Supabase cuts there. */
export async function readPeopleOf(
  { db, fetchAllRows }: Pick<Backend, "db" | "fetchAllRows">,
  id: string,
): Promise<readonly PersonRow[]> {
  const answer = await fetchAllRows((from, to) =>
    db
      .from("gestion_prospectos")
      .select("*")
      .eq("gestion_id", id)
      .order("created_at")
      .order("id")
      .range(from, to),
  );
  if (!answer.ok) throw new CommercialError(answer.error.cause);
  return answer.value;
}

export async function readMessagesOf({ db }: Db, id: string): Promise<readonly MessageRow[]> {
  const { data, error } = await db
    .from("gestion_mensajes")
    .select("*")
    .eq("gestion_id", id)
    .order("created_at");
  if (error) throw new CommercialError(error);
  return data ?? [];
}

export async function readEventsOf({ db }: Db, id: string): Promise<readonly EventRow[]> {
  const { data, error } = await db
    .from("gestion_eventos")
    .select("*")
    .eq("gestion_id", id)
    .order("at");
  if (error) throw new CommercialError(error);
  return data ?? [];
}

export async function readHunterDay({ rpc }: Rpc, hunter: string, date: string) {
  const answer = await rpc("gestiones_ocupado", { p_hunter: hunter, p_fecha: date });
  if (!answer.ok) throw new CommercialError(answer.error);
  return rowsOf(answer.value).filter(isTakenTime);
}

export async function readDayOccupancy({ rpc }: Rpc, date: string) {
  const answer = await rpc("gestiones_dia", { p_fecha: date });
  if (!answer.ok) throw new CommercialError(answer.error);
  return rowsOf(answer.value).filter(isDayOccupancy);
}

export interface PlannedForCompany {
  readonly id: string;
  readonly fecha: string;
}

/** What this hunter already has planned for a company: it is offered to be completed. */
export async function readPlannedForCompany(
  { db }: Db,
  { hunter, owner, company }: { hunter: string; owner: string; company: string },
): Promise<readonly PlannedForCompany[]> {
  const { data } = await db
    .from("gestiones")
    .select(PLANNED_COLUMNS)
    .eq("hunter_id", hunter)
    .eq("estado", "planificada")
    .eq("dueno_id", owner)
    .eq("empresa_key", company.trim().toLowerCase())
    .order("fecha")
    .limit(PLANNED_FOR_COMPANY_MAX);
  return data ?? [];
}

/** The database writes the same key again on saving (migration 046). */
function withKey(action: NewAction): Database["public"]["Tables"]["gestiones"]["Insert"] {
  return { ...action, empresa_key: action.empresa.toLowerCase() };
}

export async function insertAction({ db }: Db, action: NewAction): Promise<ActionRow> {
  const { data, error } = await db.from("gestiones").insert(withKey(action)).select().single();
  if (error) throw new CommercialError(error);
  return data;
}

export async function insertSeriesDate({ db }: Db, action: NewAction): Promise<void> {
  const { error } = await db.from("gestiones").insert(withKey(action)).select("id").single();
  if (error) throw new CommercialError(error);
}

/** Null: it is no longer visible for whoever saves it. */
export async function updateAction(
  { db }: Db,
  id: string,
  changes: ActionChanges,
): Promise<ActionRow | null> {
  const { data, error } = await db
    .from("gestiones")
    .update(changes)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throw new CommercialError(error);
  return data;
}

export async function saveAction(
  { db }: Db,
  id: string,
  changes: ActionChanges,
): Promise<ActionRow> {
  const { data, error } = await db.from("gestiones").update(changes).eq("id", id).select().single();
  if (error) throw new CommercialError(error);
  return data;
}

export async function deleteAction({ db }: Db, id: string): Promise<void> {
  const { error } = await db.from("gestiones").delete().eq("id", id);
  if (error) throw new CommercialError(error);
}

export async function insertPeople({ db }: Db, people: readonly NewPerson[]) {
  const { data, error } = await db
    .from("gestion_prospectos")
    .insert([...people])
    .select();
  if (error) throw new CommercialError(error);
  return data;
}

/** The list of a new data list: only whether it was saved matters. */
export async function insertPeopleOfList({ db }: Db, people: readonly NewPerson[]): Promise<void> {
  const { error } = await db
    .from("gestion_prospectos")
    .insert([...people])
    .select("id");
  if (error) throw new CommercialError(error);
}

export async function insertPerson({ db }: Db, person: NewPerson): Promise<PersonRow> {
  const { data, error } = await db.from("gestion_prospectos").insert(person).select().single();
  if (error) throw new CommercialError(error);
  return data;
}

export async function updatePerson(
  { db }: Db,
  id: string,
  changes: PersonChanges,
): Promise<PersonRow> {
  const { data, error } = await db
    .from("gestion_prospectos")
    .update(changes)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new CommercialError(error);
  return data;
}

export async function deletePerson({ db }: Db, id: string): Promise<void> {
  const { error } = await db.from("gestion_prospectos").delete().eq("id", id);
  if (error) throw new CommercialError(error);
}

export async function markSeriesSeen({ rpc }: Rpc, series: string): Promise<void> {
  const answer = await rpc("gestion_marcar_vista", { p_serie: series });
  if (!answer.ok) throw new CommercialError(answer.error);
}

export async function markActionRead({ rpc }: Rpc, id: string): Promise<void> {
  const answer = await rpc("gestion_marcar_leida", { p_gestion: id });
  if (!answer.ok) throw new CommercialError(answer.error);
}

export async function markActionUnread({ rpc }: Rpc, id: string): Promise<void> {
  const answer = await rpc("gestion_marcar_no_leida", { p_gestion: id });
  if (!answer.ok) throw new CommercialError(answer.error);
}

export async function markAllRead({ rpc }: Rpc): Promise<void> {
  const answer = await rpc("gestiones_marcar_todas_leidas");
  if (!answer.ok) throw new CommercialError(answer.error);
}

export async function sendMessage({ rpc }: Rpc, id: string, text: string): Promise<void> {
  const answer = await rpc("gestion_mensaje_enviar", { p_gestion: id, p_texto: text });
  if (!answer.ok) throw new CommercialError(answer.error);
}

export async function reportCannotAttend(
  { rpc }: Rpc,
  id: string,
  reason: string | null,
): Promise<void> {
  const answer = await rpc("gestion_no_puedo", { p_gestion: id, p_motivo: reason });
  if (!answer.ok) throw new CommercialError(answer.error);
}
