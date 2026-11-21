// What the panel reads of the logs: the flyers that came out, the changes in the companies and the
// audit. A failure is a failure, never "nothing yet" (invariant 24); an export reads every page.
import type { Backend } from "@/shared/supabase/index.ts";
import type { AuditRow } from "../model/audit.ts";
import type { CompanyLogRow } from "../model/company-log.ts";
import type { FlyerLog } from "../model/flyer-logs.ts";
import { type PeopleNames, peopleNames } from "../model/people.ts";
import { messageOf } from "./read-error.ts";

const REGISTRY_COLUMNS = "id,user_id,empresa,config_name,format,flyer_type,created_at";
const RECENT_COLUMNS = "id,user_id,empresa,config_name,format,created_at";
const COMPANY_LOG_COLUMNS = "id,user_id,usuario,accion,empresa,cambios,total,created_at";
export const REGISTRY_LIMIT = 300;
export const COMPANY_LOG_LIMIT = 500;
export const AUDIT_LIMIT = 300;

export class ReadError extends Error {}

function failed(error: unknown): never {
  throw new ReadError(messageOf(error));
}

export async function readPeopleNames(db: Backend["db"]): Promise<PeopleNames> {
  const { data, error } = await db.from("profiles").select("id,full_name,email_asesor");
  if (error) failed(error);
  return peopleNames(data);
}

export interface RegistryFilters {
  readonly company: string;
  readonly user: string;
  readonly from: string;
  readonly to: string;
}

export const NO_REGISTRY_FILTERS: RegistryFilters = { company: "", user: "", from: "", to: "" };

function registryQuery(db: Backend["db"], { company, from, to }: RegistryFilters) {
  let query = db
    .from("flyer_logs")
    .select(REGISTRY_COLUMNS)
    .not("user_id", "is", null)
    .order("created_at", { ascending: false });
  if (company.trim()) query = query.ilike("empresa", `%${company.trim()}%`);
  if (from) query = query.gte("created_at", `${from}T00:00:00`);
  if (to) query = query.lte("created_at", `${to}T23:59:59`);
  return query;
}

export async function readRegistros(
  db: Backend["db"],
  filters: RegistryFilters,
): Promise<readonly FlyerLog[]> {
  const { data, error } = await registryQuery(db, filters).limit(REGISTRY_LIMIT);
  if (error) failed(error);
  return data;
}

/** Everything that matches, by pages: the id breaks the ties, so no page repeats or skips rows. */
export async function readAllRegistros(
  { db, fetchAllRows }: Pick<Backend, "db" | "fetchAllRows">,
  filters: RegistryFilters,
): Promise<readonly FlyerLog[]> {
  const answer = await fetchAllRows((from, to) =>
    registryQuery(db, filters).order("id", { ascending: false }).range(from, to),
  );
  if (!answer.ok) failed(answer.error.cause);
  return answer.value;
}

export async function readRecentFlyers(db: Backend["db"]): Promise<readonly FlyerLog[]> {
  const { data, error } = await db
    .from("flyer_logs")
    .select(RECENT_COLUMNS)
    .not("user_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) failed(error);
  return data;
}

export async function readAllFlyerLogs({
  db,
  fetchAllRows,
}: Pick<Backend, "db" | "fetchAllRows">): Promise<readonly FlyerLog[]> {
  const answer = await fetchAllRows((from, to) =>
    db
      .from("flyer_logs")
      .select(RECENT_COLUMNS)
      .not("user_id", "is", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to),
  );
  if (!answer.ok) failed(answer.error.cause);
  return answer.value;
}

export interface CompanyLogFilters {
  readonly user: string;
  readonly company: string;
  readonly action: string;
  readonly from: string;
  readonly to: string;
}

export const NO_COMPANY_LOG_FILTERS: CompanyLogFilters = {
  user: "",
  company: "",
  action: "",
  from: "",
  to: "",
};

function companyLogQuery(db: Backend["db"], filters: CompanyLogFilters) {
  const company = filters.company.trim();
  let query = db
    .from("padron_log")
    .select(COMPANY_LOG_COLUMNS)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (company) query = query.ilike("empresa", `%${company}%`);
  if (filters.action) query = query.eq("accion", filters.action);
  if (filters.from) query = query.gte("created_at", `${filters.from}T00:00:00`);
  if (filters.to) query = query.lte("created_at", `${filters.to}T23:59:59`);
  return query;
}

export async function readCompanyLog(
  db: Backend["db"],
  filters: CompanyLogFilters,
): Promise<readonly CompanyLogRow[]> {
  const { data, error } = await companyLogQuery(db, filters).limit(COMPANY_LOG_LIMIT);
  if (error) failed(error);
  return data;
}

export async function readAllCompanyLog(
  { db, fetchAllRows }: Pick<Backend, "db" | "fetchAllRows">,
  filters: CompanyLogFilters,
): Promise<readonly CompanyLogRow[]> {
  const answer = await fetchAllRows((from, to) => companyLogQuery(db, filters).range(from, to));
  if (!answer.ok) failed(answer.error.cause);
  return answer.value;
}

export async function readAudit(db: Backend["db"], action: string): Promise<readonly AuditRow[]> {
  let query = db
    .from("audit_log")
    .select("id,created_at,actor_email,accion,objetivo_email,detalle")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(AUDIT_LIMIT);
  if (action) query = query.eq("accion", action);
  const { data, error } = await query;
  if (error) failed(error);
  return data;
}
