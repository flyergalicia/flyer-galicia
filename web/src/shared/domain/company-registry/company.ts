// A company of Mis empresas, as `padron_empresas` keeps it. The names of its fields are a contract
// with the database and with what is saved: see docs/GLOSARIO.md.
import { cashbackIndex, cashbackName } from "./cashback.ts";
import { asText, digitsOf, formatTaxId, normalizeName, parseTaxIds } from "./text.ts";

export const OFFICERS_PER_COMPANY = 4;

const ANGLE_BRACKETS = /[<>]/g;
const MAX_CATEGORY_TEXT = 40;

export interface CompanyOfficer {
  readonly nombre: string;
  readonly celular: string;
  readonly email: string;
}

/** The benefit of a company by category: option of the flyer, caps in digits, text of the sheet. */
export interface CompanyCategory {
  readonly opcion: number;
  readonly importe: string;
  readonly importe2: string;
  readonly txt: string;
}

export interface Company {
  readonly empresa: string;
  readonly cuits: readonly string[];
  readonly config: string;
  readonly asesores: readonly CompanyOfficer[];
  readonly rubro: CompanyCategory;
  /** Only when the query asked for it: a Hunter needs them to propose a change to the owner. */
  readonly id?: unknown;
  readonly user_id?: string;
}

/** A company of whoever chose this person as substitute. It never joins the person's own list. */
export interface BorrowedCompany extends Company {
  readonly owner: { readonly id: string; readonly nombre: string };
}

export type SearchableCompany = Company | BorrowedCompany;

export function isBorrowed(company: SearchableCompany): company is BorrowedCompany {
  return "owner" in company;
}

function field(row: unknown, key: string): unknown {
  return typeof row === "object" && row !== null ? Reflect.get(row, key) : undefined;
}

function text(row: unknown, key: string): string {
  return asText(field(row, key)).trim();
}

export function sanitizeCategory(row: unknown): CompanyCategory {
  const option = Number.parseInt(asText(field(row, "opcion")), 10);
  return {
    opcion: option > 0 ? option : 0,
    importe: digitsOf(field(row, "importe")),
    importe2: digitsOf(field(row, "importe2")),
    txt: asText(field(row, "txt")).replace(ANGLE_BRACKETS, "").trim().slice(0, MAX_CATEGORY_TEXT),
  };
}

function sanitizeOfficers(list: unknown): CompanyOfficer[] {
  const rows: readonly unknown[] = Array.isArray(list) ? list : [];
  return Array.from({ length: OFFICERS_PER_COMPANY }, (_, position) => {
    const officer = rows[position];
    return {
      nombre: text(officer, "nombre"),
      celular: text(officer, "celular"),
      email: text(officer, "email"),
    };
  });
}

function sanitizeTaxIds(value: unknown): string[] {
  const list: readonly unknown[] = Array.isArray(value) ? value : parseTaxIds(value);
  return [...new Set(list.map(digitsOf).filter(Boolean))];
}

function sanitizeCompany(row: unknown): Company | null {
  if (typeof row !== "object" || row === null) return null;
  const cuits = sanitizeTaxIds(field(row, "cuits"));
  const empresa = text(row, "empresa");
  if (!empresa && cuits.length === 0) return null;
  const id = field(row, "id");
  const owner = field(row, "user_id");
  return {
    empresa,
    cuits,
    config: text(row, "config"),
    asesores: sanitizeOfficers(field(row, "asesores")),
    rubro: sanitizeCategory(field(row, "rubro")),
    ...(id == null ? {} : { id }),
    ...(owner == null ? {} : { user_id: asText(owner) }),
  };
}

/** A row may arrive incomplete: it is cleaned once, on arrival, and from there its shape is fixed. */
export function sanitizeCompanies(rows: unknown): Company[] {
  const list: readonly unknown[] = Array.isArray(rows) ? rows : [];
  return list.flatMap((row) => sanitizeCompany(row) ?? []);
}

export function emptyOfficer(): CompanyOfficer {
  return { nombre: "", celular: "", email: "" };
}

export function newCompany(): Company {
  return {
    empresa: "",
    cuits: [],
    config: "",
    asesores: Array.from({ length: OFFICERS_PER_COMPANY }, emptyOfficer),
    rubro: sanitizeCategory(null),
  };
}

export function officerCount({ asesores }: Pick<Company, "asesores">): number {
  return asesores.filter(({ nombre }) => nombre.trim()).length;
}

export function officersLabel(company: Pick<Company, "asesores">): string {
  const count = officerCount(company);
  if (count === 0) return "sin oficiales asignados";
  return `${String(count)} oficial${count > 1 ? "es" : ""}`;
}

export function taxIdCount(rows: readonly Pick<Company, "cuits">[]): number {
  return rows.reduce((total, { cuits }) => total + cuits.length, 0);
}

export function taxIdsLine(company: Pick<Company, "cuits">, separator = "  ·  "): string {
  return company.cuits.map(formatTaxId).join(separator);
}

/** The exact razón social, so as not to repeat a company that was written by hand. */
export function findByName<T extends Company>(rows: readonly T[], name: string): T | null {
  const wanted = normalizeName(name);
  if (!wanted) return null;
  return rows.find(({ empresa }) => normalizeName(empresa) === wanted) ?? null;
}

/** The companies this person can reach by searching: their own first, then the borrowed ones. */
export function searchableCompanies(
  own: readonly Company[],
  borrowed: readonly BorrowedCompany[],
): readonly SearchableCompany[] {
  return borrowed.length > 0 ? [...own, ...borrowed] : own;
}

/** What the search and the suggestions say under each name: tax ids, cashback and officers. */
export function companySubtitle(company: Company, cashbackNames: readonly string[]): string {
  const index = cashbackIndex(company.config, cashbackNames);
  const cashback = index < 0 ? "SIN CASHBACK" : cashbackName(index, cashbackNames);
  const details = `${cashback}  ·  ${officersLabel(company)}`;
  return company.cuits.length > 0 ? `${taxIdsLine(company)}  —  ${details}` : details;
}
