// Data → Cambios en las empresas (`padron_log`): what the server wrote each time somebody saved
// their companies, told in words. A modification shows only what really changed.
import {
  categoryLabel,
  digitsOf,
  formatTaxId,
  type Options,
  sameCategory,
} from "@/shared/domain/company-registry/index.ts";

export interface CompanyLogRow {
  readonly id: number | string;
  readonly user_id: string | null;
  readonly usuario: string | null;
  readonly accion: string;
  readonly empresa: string | null;
  readonly cambios: unknown;
  readonly total: number | null;
  readonly created_at: string | null;
}

export const ACTION_NAMES: Readonly<Record<string, string>> = {
  alta: "Alta",
  modificacion: "Modificación",
  baja: "Baja",
};

export type DetailPart = readonly [label: string, text: string];

interface Change {
  readonly antes?: unknown;
  readonly despues?: unknown;
}

function changeOf(changes: unknown, key: string): Change | null {
  if (typeof changes !== "object" || changes === null) return null;
  const change: unknown = Reflect.get(changes, key);
  return typeof change === "object" && change !== null ? change : null;
}

function list(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function taxIdsText(value: unknown): string {
  return list(value).map(formatTaxId).filter(Boolean).join(", ") || "sin CUIT";
}

/** What a value written in the log reads like. */
function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return value ? JSON.stringify(value) : "";
}

function cashbackText(value: unknown): string {
  return value && textOf(value).trim() ? textOf(value) : "sin cashback";
}

function field(officer: unknown, key: string): string {
  if (typeof officer !== "object" || officer === null) return "";
  const value: unknown = Reflect.get(officer, key);
  return value === null || value === undefined ? "" : textOf(value).trim();
}

function officersText(value: unknown): string {
  const count = list(value).filter((officer) => field(officer, "nombre")).length;
  if (!count) return "sin oficiales";
  return `${String(count)} oficial${count > 1 ? "es" : ""}`;
}

const isEmpty = (officer: unknown) =>
  !field(officer, "nombre") && !field(officer, "celular") && !field(officer, "email");
const whoIs = (officer: unknown) =>
  field(officer, "nombre") || field(officer, "email") || field(officer, "celular") || "sin nombre";

function fieldChange(before: unknown, after: unknown, key: string, said: string): string {
  const one = field(before, key);
  const other = field(after, key);
  return one === other ? "" : `${said} ${one || "—"} → ${other || "—"}`;
}

/** One officer: added, taken out, replaced by somebody else, or corrected field by field. */
function officerChange(before: unknown, after: unknown): DetailPart | null {
  if (isEmpty(before) && isEmpty(after)) return null;
  if (isEmpty(before)) return ["Oficial agregado", whoIs(after)];
  if (isEmpty(after)) return ["Oficial quitado", whoIs(before)];
  const renamed = field(before, "nombre") !== field(after, "nombre");
  const newContact =
    field(before, "celular") !== field(after, "celular") ||
    field(before, "email") !== field(after, "email");
  // Another name and another contact: it is another person, not a correction.
  if (renamed && newContact) return ["Oficial reemplazado", `${whoIs(before)} → ${whoIs(after)}`];
  const changes = [
    fieldChange(before, after, "nombre", "nombre"),
    fieldChange(before, after, "celular", "celular"),
    fieldChange(before, after, "email", "mail"),
  ].filter(Boolean);
  if (!changes.length) return null;
  const named = changes.length === 3 ? after : before;
  return ["Oficial", `${whoIs(named)} · ${changes.join(" · ")}`];
}

function officerChanges(change: Change): DetailPart[] {
  const before = list(change.antes);
  const after = list(change.despues);
  const parts: DetailPart[] = [];
  for (let at = 0; at < Math.max(before.length, after.length); at += 1) {
    const part = officerChange(before[at] ?? {}, after[at] ?? {});
    if (part) parts.push(part);
  }
  return parts;
}

function taxIdChange(change: Change): DetailPart | null {
  const before = list(change.antes).map(digitsOf).filter(Boolean);
  const after = list(change.despues).map(digitsOf).filter(Boolean);
  const added = after.filter((id) => !before.includes(id));
  const removed = before.filter((id) => !after.includes(id));
  const parts = [
    added.length ? `+ ${added.map(formatTaxId).join(", ")}` : "",
    removed.length ? `− ${removed.map(formatTaxId).join(", ")}` : "",
  ].filter(Boolean);
  return parts.length ? ["CUIT", parts.join("  ")] : null;
}

function categoryText(value: unknown, options: Options): string {
  return categoryLabel(value, options) || "sin rubro";
}

/** A whole company, as it came in or went out. */
function snapshot(row: CompanyLogRow, options: Options): DetailPart[] {
  const side = row.accion === "alta" ? "despues" : "antes";
  const parts: DetailPart[] = [];
  const add = (label: string, key: string, text: (value: unknown) => string) => {
    const change = changeOf(row.cambios, key);
    if (change) parts.push([label, text(change[side])]);
  };
  add("CUIT", "cuits", taxIdsText);
  add("Cashback", "config", cashbackText);
  add("Oficiales", "asesores", officersText);
  add("Rubro", "rubro", (value) => categoryText(value, options));
  return parts;
}

function modification(row: CompanyLogRow, options: Options): DetailPart[] {
  const parts: DetailPart[] = [];
  const taxIds = changeOf(row.cambios, "cuits");
  const taxIdPart = taxIds ? taxIdChange(taxIds) : null;
  if (taxIdPart) parts.push(taxIdPart);
  const cashback = changeOf(row.cambios, "config");
  if (cashback) {
    const before = cashbackText(cashback.antes);
    const after = cashbackText(cashback.despues);
    if (before !== after) parts.push(["Cashback", `${before} → ${after}`]);
  }
  const officers = changeOf(row.cambios, "asesores");
  if (officers) parts.push(...officerChanges(officers));
  const category = changeOf(row.cambios, "rubro");
  if (category && !sameCategory(category.antes, category.despues)) {
    parts.push([
      "Rubro",
      `${categoryText(category.antes, options)} → ${categoryText(category.despues, options)}`,
    ]);
  }
  return parts;
}

export function changeDetails(row: CompanyLogRow, options: Options): DetailPart[] {
  if (row.accion === "alta" || row.accion === "baja") return snapshot(row, options);
  return modification(row, options);
}

/** A modification with no real change (only of format) is neither shown nor exported. */
export function isRelevant(row: CompanyLogRow, options: Options): boolean {
  return row.accion !== "modificacion" || changeDetails(row, options).length > 0;
}

export function detailsText(row: CompanyLogRow, options: Options): string {
  return changeDetails(row, options)
    .map(([label, text]) => `${label}: ${text}`)
    .join(" · ");
}

/** The name is a copy kept in the row: it survives the user being deleted. */
export function byUser(rows: readonly CompanyLogRow[], query: string): readonly CompanyLogRow[] {
  const text = query.toLowerCase();
  if (!text) return rows;
  return rows.filter((row) => (row.usuario ?? "").toLowerCase().includes(text));
}

export const COMPANY_LOG_HEAD = [
  "Fecha/Hora",
  "Usuario",
  "Acción",
  "Empresa",
  "Detalle",
  "Empresas (total)",
];
export const COMPANY_LOG_WIDTHS = [22, 28, 14, 36, 70, 12];
