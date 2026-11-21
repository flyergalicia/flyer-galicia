// Mis empresas is private to each person and lives in `padron_empresas`: who sees what is decided by
// the server. A failure is never read as an empty list (invariant 24).
import {
  type BorrowedCompany,
  type Company,
  type CompanyOfficer,
  sanitizeCategory,
  sanitizeCompanies,
} from "@/shared/domain/company-registry/index.ts";
import type { Backend, Json, RpcFailure } from "@/shared/supabase/index.ts";

export const COMPANIES_QUERY_KEY = ["company-registry", "companies"] as const;
export const SUBSTITUTE_COMPANIES_QUERY_KEY = ["company-registry", "substitute-companies"] as const;

const COLUMNS = "empresa,cuits,config,asesores,rubro,created_at";
const CONNECTION_WORDS = /failed to fetch|networkerror|load failed|network request|timeout|abort/i;

export interface CompanyList {
  readonly rows: readonly Company[];
  /** When the list was last loaded, as the status line says it. */
  readonly updatedAt: string;
}

export class CompaniesReadError extends Error {
  constructor(cause: unknown) {
    super("The companies could not be read", { cause });
  }
}

/** What is said about a failure: "sin conexión" and nothing technical. */
export function failureText(cause: unknown): string {
  const message =
    typeof cause === "object" && cause !== null ? Reflect.get(cause, "message") : cause;
  const text = typeof message === "string" ? message : "";
  return !text || CONNECTION_WORDS.test(text) ? "sin conexión" : "error del servidor";
}

function latestOf(rows: readonly { readonly created_at: string | null }[]): string {
  return rows.reduce(
    (latest, { created_at: created }) => (created && created > latest ? created : latest),
    "",
  );
}

/** Every company, by pages (invariant 7): a list of more than 1000 was being cut without a word. */
export async function readCompanies(
  { db, fetchAllRows }: Pick<Backend, "db" | "fetchAllRows">,
  userId: string,
): Promise<CompanyList> {
  const answer = await fetchAllRows((from, to) =>
    db
      .from("padron_empresas")
      .select(COLUMNS)
      .eq("user_id", userId)
      .order("empresa", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (!answer.ok) throw new CompaniesReadError(answer.error.cause);
  return { rows: sanitizeCompanies(answer.value), updatedAt: latestOf(answer.value) };
}

function officerJson({ nombre, celular, email }: CompanyOfficer) {
  return { nombre, celular, email };
}

function companyJson({ empresa, cuits, config, asesores, rubro }: Company) {
  const { opcion, importe, importe2, txt } = sanitizeCategory(rubro);
  return {
    empresa,
    cuits: [...cuits],
    config,
    asesores: asesores.map(officerJson),
    rubro: { opcion, importe, importe2, txt },
  };
}

/** Replaces the list at once: if anything fails in the server, it stays as it was. */
export async function replaceCompanies(
  { rpc }: Pick<Backend, "rpc">,
  rows: readonly Company[],
): Promise<RpcFailure | null> {
  const answer = await rpc("padron_replace", { p_rows: rows.map(companyJson) satisfies Json });
  return answer.ok ? null : answer.error;
}

function ownerName(row: unknown): string {
  const name: unknown =
    typeof row === "object" && row !== null ? Reflect.get(row, "dueno_nombre") : null;
  return (typeof name === "string" ? name.trim() : "") || "otro oficial";
}

function borrowedCompanyOf(row: unknown): BorrowedCompany[] {
  const [company] = sanitizeCompanies([row]);
  if (!company) return [];
  return [{ ...company, owner: { id: company.user_id ?? "", nombre: ownerName(row) } }];
}

/**
 * The companies of whoever chose this person as substitute: the database checks it on each call, so
 * that when they take the person out the next read brings nothing. A cut does not mean that.
 */
export async function readSubstituteCompanies({
  rpc,
}: Pick<Backend, "rpc">): Promise<readonly BorrowedCompany[]> {
  const answer = await rpc("padron_suplencias");
  if (!answer.ok) throw new Error(answer.error.message);
  const rows: readonly unknown[] = Array.isArray(answer.value) ? answer.value : [];
  return rows.flatMap(borrowedCompanyOf);
}

export interface SubstituteRequest {
  readonly empresa: string;
  readonly owner: string;
  readonly officers: readonly CompanyOfficer[];
  /** Null: that data is not touched. */
  readonly config: string | null;
  readonly category: Company["rubro"] | null;
}

export async function askOwnerForChange(
  { rpc }: Pick<Backend, "rpc">,
  { empresa, owner, officers, config, category }: SubstituteRequest,
): Promise<RpcFailure | null> {
  const answer = await rpc("padron_suplencia_proponer", {
    p_empresa: empresa,
    p_dueno: owner,
    p_asesores: officers.map(officerJson),
    p_config: config,
    p_rubro: category ? { ...sanitizeCategory(category) } : null,
    p_nota: null,
  });
  return answer.ok ? null : answer.error;
}
