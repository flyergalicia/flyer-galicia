// Mis empresas: what each company of the officer has had, from the list of actions.
import { digitsOf, normalizeName } from "@/shared/domain/company-registry/index.ts";
import type { ListedAction, MyCompany } from "../api/rows.ts";
import { taxIdList } from "./tax-ids.ts";

const MIN_TAX_ID_SEARCH = 4;
/** How many rows it paints. */
export const MAX_COMPANIES = 400;

export interface CompanyStats {
  readonly done: number;
  readonly people: number;
  readonly signups: number;
  readonly planned: number;
  readonly lastDate: string | null;
  readonly lastHunter: string | null;
  readonly news: number;
  readonly forwarded: number;
}

export interface CompanyLine {
  readonly empresa: string;
  readonly cuits: readonly string[];
  readonly key: string;
  readonly stats: CompanyStats;
}

const NOTHING: CompanyStats = {
  done: 0,
  people: 0,
  signups: 0,
  planned: 0,
  lastDate: null,
  lastHunter: null,
  news: 0,
  forwarded: 0,
};

function withAction(stats: CompanyStats, action: ListedAction): CompanyStats {
  const {
    estado,
    visto_dueno: seen,
    fecha,
    hunter_id: hunter,
    n_pros: people,
    n_altas: signups,
  } = action;
  const isDone = estado === "realizada";
  const isLast = isDone && (!stats.lastDate || fecha > stats.lastDate);
  return {
    done: stats.done + (isDone ? 1 : 0),
    people: stats.people + (isDone ? people : 0),
    signups: stats.signups + (isDone ? signups : 0),
    planned: stats.planned + (estado === "planificada" ? 1 : 0),
    lastDate: isLast ? fecha : stats.lastDate,
    lastHunter: isLast ? hunter : stats.lastHunter,
    news: stats.news + (seen ? 0 : 1),
    forwarded: stats.forwarded + (estado === "cancelada" ? 0 : 1),
  };
}

export interface CompaniesTotals {
  readonly done: number;
  readonly people: number;
  readonly signups: number;
}

/** Only what is of this officer counts. */
function statsByCompany(actions: readonly ListedAction[], me: string): Map<string, CompanyStats> {
  const stats = new Map<string, CompanyStats>();
  for (const action of actions) {
    if (action.dueno_id !== me) continue;
    const key = normalizeName(action.empresa);
    stats.set(key, withAction(stats.get(key) ?? NOTHING, action));
  }
  return stats;
}

export function companiesTable(
  companies: readonly MyCompany[],
  actions: readonly ListedAction[],
  me: string,
): { readonly lines: readonly CompanyLine[]; readonly totals: CompaniesTotals } {
  const stats = statsByCompany(actions, me);
  const totals = [...stats.values()].reduce(
    (sum, { done, people, signups }) => ({
      done: sum.done + done,
      people: sum.people + people,
      signups: sum.signups + signups,
    }),
    { done: 0, people: 0, signups: 0 },
  );
  const lines = companies.map(({ empresa, cuits }) => {
    const key = normalizeName(empresa);
    return { empresa, cuits: taxIdList(cuits), key, stats: stats.get(key) ?? NOTHING };
  });
  return { lines, totals };
}

export type CompanyFilterId = "todas" | "derivadas" | "sin" | "plan" | "altas" | "nov";

interface CompanyFilter {
  readonly id: CompanyFilterId;
  readonly label: string;
  readonly matches: (stats: CompanyStats) => boolean;
}

const ALL_COMPANIES: CompanyFilter = { id: "todas", label: "Todas", matches: () => true };

export const COMPANY_FILTERS: readonly CompanyFilter[] = [
  ALL_COMPANIES,
  { id: "derivadas", label: "Derivadas (con acciones)", matches: ({ forwarded }) => forwarded > 0 },
  { id: "sin", label: "Sin derivar", matches: ({ forwarded }) => forwarded === 0 },
  { id: "plan", label: "Con acciones planificadas", matches: ({ planned }) => planned > 0 },
  { id: "altas", label: "Con altas", matches: ({ signups }) => signups > 0 },
  { id: "nov", label: "Con novedades", matches: ({ news }) => news > 0 },
];

function filterOf(id: string): CompanyFilter {
  return COMPANY_FILTERS.find((filter) => filter.id === id) ?? ALL_COMPANIES;
}

export function filteredCompanies(
  lines: readonly CompanyLine[],
  search: string,
  filterId: string,
): readonly CompanyLine[] {
  const text = normalizeName(search);
  const digits = digitsOf(search);
  const { matches } = filterOf(filterId);
  return lines.filter(
    ({ key, cuits, stats }) =>
      (!text ||
        key.includes(text) ||
        (digits.length >= MIN_TAX_ID_SEARCH && cuits.some((id) => id.includes(digits)))) &&
      matches(stats),
  );
}

export function companiesCountText(shown: number, total: number): string {
  return shown === total
    ? `${String(total)} empresas`
    : `${String(shown)} de ${String(total)} empresas`;
}
