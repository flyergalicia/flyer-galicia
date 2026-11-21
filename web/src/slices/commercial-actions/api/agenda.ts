// What the agenda reads. The actions of the period are what it is about: a failure says so. Who else
// is busy and the trays go apart: the agenda still shows without them, and says what is missing.
import type { Backend } from "@/shared/supabase/index.ts";
import { byDayAndTime } from "../model/agenda-dates.ts";
import type { FoundCompany } from "../model/agenda-paste.ts";
import type { DateRange } from "../model/agenda-place.ts";
import { today } from "../model/formatting.ts";
import { MAX_PEOPLE_ON_LIST } from "../model/labels.ts";
import { CommercialError } from "./actions.ts";
import type { ActionRow, NewAction, PersonRow } from "./rows.ts";

const AGENDA_COLUMNS =
  "id,empresa,cuit,tipo,modalidad,fecha,vence,hora_desde,hora_hasta,lugar,estado,hunter_id,dueno_id,creada_por,origen,lider_id,no_puede_at,visto_hunter,visto_dueno,prueba";
const TRAY_COLUMNS =
  "id,empresa,cuit,tipo,fecha,vence,hora_desde,hora_hasta,estado,hunter_id,dueno_id,creada_por,lider_id,no_puede_at,no_puede_motivo,origen";
const CONTACT_COLUMNS = "id,nombre,contacto,proximo,estado,gestion_id";
const AGENDA_LIMIT = 2000;
const DATA_LISTS_LIMIT = 200;
const TRAY_LIMIT = 100;
const WEEK_LIMIT = 200;
const COMPANIES_LIMIT = 20;
const OPEN_STATES = ["a_contactar", "prospecto", "en_gestion"];

type Db = Pick<Backend, "db">;
type Rpc = Pick<Backend, "rpc">;

export type AgendaAction = Pick<
  ActionRow,
  | "id"
  | "empresa"
  | "cuit"
  | "tipo"
  | "modalidad"
  | "fecha"
  | "vence"
  | "hora_desde"
  | "hora_hasta"
  | "lugar"
  | "estado"
  | "hunter_id"
  | "dueno_id"
  | "creada_por"
  | "origen"
  | "lider_id"
  | "no_puede_at"
  | "visto_hunter"
  | "visto_dueno"
  | "prueba"
>;

export type TrayAction = Pick<
  ActionRow,
  | "id"
  | "empresa"
  | "cuit"
  | "tipo"
  | "fecha"
  | "vence"
  | "hora_desde"
  | "hora_hasta"
  | "estado"
  | "hunter_id"
  | "dueno_id"
  | "creada_por"
  | "lider_id"
  | "no_puede_at"
  | "no_puede_motivo"
  | "origen"
>;

export type PersonToContact = Pick<
  PersonRow,
  "id" | "nombre" | "contacto" | "proximo" | "estado" | "gestion_id"
>;

/** The time of a hunter as somebody who may not see the company knows it. */
export interface OccupiedTime {
  readonly id: string;
  readonly hunter_id: string;
  readonly fecha: string;
  readonly hora_desde: string | null;
  readonly hora_hasta: string | null;
  readonly tipo: string;
  readonly empresa: string | null;
}

export interface ListProgress {
  /** People on the list. */
  readonly total: number;
  /** Those no longer "A contactar". */
  readonly contacted: number;
  readonly signups: number;
}

export interface AgendaExtras {
  readonly dataLists: readonly TrayAction[];
  readonly unassigned: readonly TrayAction[];
  readonly cannotAttend: readonly TrayAction[];
  readonly toContact: readonly PersonToContact[];
  readonly progress: Readonly<Record<string, ListProgress>>;
  readonly companies: Readonly<Record<string, string>>;
}

export interface AgendaData {
  readonly actions: readonly AgendaAction[];
  /** Taken with companies that whoever looks cannot see. */
  readonly occupied: readonly OccupiedTime[];
  readonly occupiedFailed: boolean;
  readonly extras: AgendaExtras;
  readonly extrasFailed: boolean;
}

const NO_EXTRAS: AgendaExtras = {
  dataLists: [],
  unassigned: [],
  cannotAttend: [],
  toContact: [],
  progress: {},
  companies: {},
};

function isOccupiedTime(value: unknown): value is OccupiedTime {
  return (
    typeof value === "object" && value !== null && "hunter_id" in value && "hora_desde" in value
  );
}

function rowsOf(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

async function readActionsOfRange(
  { db }: Db,
  range: DateRange,
  hunter: string | null,
): Promise<readonly AgendaAction[]> {
  const query = db
    .from("gestiones")
    .select(AGENDA_COLUMNS)
    .gte("fecha", range.from)
    .lte("fecha", range.to)
    .order("fecha")
    .limit(AGENDA_LIMIT);
  const { data, error } = await (hunter ? query.eq("hunter_id", hunter) : query);
  if (error) throw new CommercialError(error);
  // In the grid, what has a day and a hunter: data lists and what is unassigned go on the trays.
  return (data ?? [])
    .filter(({ tipo, hunter_id: id }) => tipo !== "datos" && id)
    .toSorted(byDayAndTime);
}

export async function readOccupancy({ rpc }: Rpc, { from, to }: DateRange) {
  const answer = await rpc("gestiones_ocupacion", { p_desde: from, p_hasta: to });
  if (!answer.ok) throw new CommercialError(answer.error);
  return rowsOf(answer.value).filter(isOccupiedTime);
}

/** Lists to be checked by hand: a failure must not be read as an empty tray. */
function rowsOrFail<Row>(answer: {
  readonly data: readonly Row[] | null;
  readonly error: unknown;
}): readonly Row[] {
  if (answer.error) throw new CommercialError(answer.error);
  return answer.data ?? [];
}

async function readDataLists({ db }: Db, hunter: string | null) {
  const query = db
    .from("gestiones")
    .select(TRAY_COLUMNS)
    .eq("tipo", "datos")
    .eq("estado", "planificada")
    .order("fecha")
    .limit(DATA_LISTS_LIMIT);
  return rowsOrFail(await (hunter ? query.eq("hunter_id", hunter) : query));
}

async function readUnassigned({ db }: Db) {
  return rowsOrFail(
    await db
      .from("gestiones")
      .select(TRAY_COLUMNS)
      .is("hunter_id", null)
      .eq("estado", "planificada")
      .order("fecha")
      .limit(TRAY_LIMIT),
  );
}

async function readCannotAttend({ db }: Db) {
  return rowsOrFail(
    await db
      .from("gestiones")
      .select(TRAY_COLUMNS)
      .not("no_puede_at", "is", null)
      .eq("estado", "planificada")
      .order("fecha")
      .limit(TRAY_LIMIT),
  );
}

/** A limit on purpose, not paged: this is asked again on each week or month. */
async function readPeopleToContact({ db }: Db) {
  return rowsOrFail(
    await db
      .from("gestion_prospectos")
      .select(CONTACT_COLUMNS)
      .lte("proximo", today())
      .in("estado", OPEN_STATES)
      .order("proximo")
      .order("id")
      .limit(MAX_PEOPLE_ON_LIST),
  );
}

async function readProgress(
  { db, fetchAllRows }: Pick<Backend, "db" | "fetchAllRows">,
  ids: readonly string[],
): Promise<Readonly<Record<string, ListProgress>>> {
  if (ids.length === 0) return {};
  const answer = await fetchAllRows((from, to) =>
    db
      .from("gestion_prospectos")
      .select("id,gestion_id,estado")
      .in("gestion_id", [...ids])
      .order("id")
      .range(from, to),
  );
  if (!answer.ok) throw new CommercialError(answer.error.cause);
  const progress: Record<string, ListProgress> = {};
  for (const { gestion_id: id, estado } of answer.value) {
    const before = progress[id] ?? { total: 0, contacted: 0, signups: 0 };
    progress[id] = {
      total: before.total + 1,
      contacted: before.contacted + (estado === "a_contactar" ? 0 : 1),
      signups: before.signups + (estado === "alta" ? 1 : 0),
    };
  }
  return progress;
}

async function readCompanyNames({ db }: Db, ids: readonly string[]) {
  if (ids.length === 0) return [];
  return rowsOrFail(
    await db
      .from("gestiones")
      .select("id,empresa")
      .in("id", [...ids]),
  );
}

async function readExtras(backend: Backend, who: { readonly hunter: string | null }) {
  const isHunter = who.hunter !== null;
  const [dataLists, unassigned, cannotAttend, toContact] = await Promise.all([
    readDataLists(backend, who.hunter),
    isHunter ? [] : readUnassigned(backend),
    isHunter ? [] : readCannotAttend(backend),
    isHunter ? readPeopleToContact(backend) : [],
  ]);
  const ids = dataLists.map(({ id }) => id);
  const others = toContact.map(({ gestion_id: id }) => id).filter((id) => !ids.includes(id));
  const [progress, names] = await Promise.all([
    readProgress(backend, ids),
    readCompanyNames(backend, others),
  ]);
  const companies = Object.fromEntries(
    [...dataLists, ...names].map(({ id, empresa }) => [id, empresa]),
  );
  return { dataLists, unassigned, cannotAttend, toContact, progress, companies };
}

function isNotMine(mine: readonly AgendaAction[]) {
  const ids = new Set(mine.map(({ id }) => id));
  return ({ id }: OccupiedTime) => !ids.has(id);
}

export async function readAgenda(
  backend: Backend,
  range: DateRange,
  {
    onlyOf,
    asksOccupied,
  }: {
    /** A hunter sees only what is theirs. */
    readonly onlyOf: string | null;
    readonly asksOccupied: boolean;
  },
): Promise<AgendaData> {
  const [actions, occupied, extras] = await Promise.allSettled([
    readActionsOfRange(backend, range, onlyOf),
    asksOccupied ? readOccupancy(backend, range) : [],
    readExtras(backend, { hunter: onlyOf }),
  ]);
  if (actions.status === "rejected") throw actions.reason;
  return {
    actions: actions.value,
    occupied:
      occupied.status === "fulfilled"
        ? occupied.value.filter(isNotMine(actions.value)).toSorted(byDayAndTime)
        : [],
    occupiedFailed: occupied.status === "rejected",
    extras: extras.status === "fulfilled" ? extras.value : NO_EXTRAS,
    extrasFailed: extras.status === "rejected",
  };
}

export interface WeekBlock {
  readonly id: string;
  readonly hunter_id: string | null;
  readonly fecha: string;
  readonly hora_desde: string | null;
  readonly hora_hasta: string | null;
  readonly tipo: string;
  readonly empresa: string | null;
  readonly estado?: string;
}

/** A hunter reads their own actions: the database does not answer them what others have. */
export async function readHunterWeek(
  backend: Backend,
  range: DateRange,
  hunter: string,
  isOwn: boolean,
): Promise<readonly WeekBlock[]> {
  if (!isOwn) return readOccupancy(backend, range);
  const { data, error } = await backend.db
    .from("gestiones")
    .select("id,empresa,tipo,estado,fecha,hora_desde,hora_hasta,hunter_id")
    .eq("hunter_id", hunter)
    .gte("fecha", range.from)
    .lte("fecha", range.to)
    .neq("estado", "cancelada")
    .limit(WEEK_LIMIT);
  if (error) throw new CommercialError(error);
  return data ?? [];
}

export interface CompanyFound extends FoundCompany {
  readonly cuits: readonly string[] | null;
}

function isCompanyFound(value: unknown): value is CompanyFound {
  return typeof value === "object" && value !== null && "empresa" in value && "dueno_id" in value;
}

export async function searchCompanies({ rpc }: Rpc, text: string) {
  const answer = await rpc("gestiones_empresas", { p_q: text, p_limit: COMPANIES_LIMIT });
  if (!answer.ok) throw new CommercialError(answer.error);
  return rowsOf(answer.value).filter(isCompanyFound);
}

export async function insertPastedActions({ db }: Db, rows: readonly NewAction[]) {
  const { data, error } = await db
    .from("gestiones")
    .insert(rows.map((row) => ({ ...row, empresa_key: row.empresa.toLowerCase() })))
    .select("id");
  if (error) throw new CommercialError(error);
  return data ?? [];
}
