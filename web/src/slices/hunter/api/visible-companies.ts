// Every company the database lets this person see: for a Hunter, those of all the officers. There is
// no filter by owner on purpose: the server decides who sees what. A failure is thrown, so that it is
// never read as an empty list (invariant 24).
import {
  type Company,
  normalizeName,
  sanitizeCompanies,
} from "@/shared/domain/company-registry/index.ts";
import type { Backend } from "@/shared/supabase/index.ts";

export const VISIBLE_COMPANIES_QUERY_KEY = ["hunter", "companies"] as const;

/** `user_id`: a proposal has to name the owner, and the row tells which proposal is its own. */
const COLUMNS = "empresa,cuits,config,asesores,rubro,created_at,id,user_id";

/** The order is put here: the database's is by id, the only one that does not repeat rows in pages. */
function byName(rows: readonly Company[]): readonly Company[] {
  const collator = new Intl.Collator();
  return rows
    .map((company) => ({ company, name: normalizeName(company.empresa) }))
    .toSorted((one, other) => collator.compare(one.name, other.name))
    .map(({ company }) => company);
}

export async function readVisibleCompanies({
  db,
  fetchAllRows,
}: Pick<Backend, "db" | "fetchAllRows">): Promise<readonly Company[]> {
  const answer = await fetchAllRows((from, to) =>
    db.from("padron_empresas").select(COLUMNS).order("id", { ascending: true }).range(from, to),
  );
  if (!answer.ok) throw new Error("The companies could not be read", { cause: answer.error.cause });
  return byName(sanitizeCompanies(answer.value));
}
