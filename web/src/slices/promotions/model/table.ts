// How the table shows the rows: what passes the filters, in what order, and what it counts.
import {
  baseBrand,
  brandGroupKey,
  decodeEntities,
  formatDate,
  isBetterPromotion,
  isNewPromotion,
  isOnlinePromotion,
  lowerCased,
  promotionHasPercent,
  PROMOTION_STATUSES,
  type PromotionStatus,
  STATUS_LABEL,
  statusText,
  whereText,
} from "@/shared/domain/promotions/index.ts";
import type { ResultRow } from "./result-rows.ts";

export interface TableFilters {
  /** The search box over the table: it looks at several columns. */
  readonly global: string;
  readonly logo: "" | "con" | "sin";
  readonly brand: string;
  readonly match: string;
  readonly category: string;
  readonly where: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly status: "" | PromotionStatus;
  readonly hideOnline: boolean;
  readonly oneRowPerBrand: boolean;
  readonly onlyNew: boolean;
  readonly onlyPercent: boolean;
}

export const NO_FILTERS: TableFilters = {
  global: "",
  logo: "",
  brand: "",
  match: "",
  category: "",
  where: "",
  startDate: "",
  endDate: "",
  status: "",
  hideOnline: false,
  oneRowPerBrand: false,
  onlyNew: false,
  onlyPercent: false,
};

export type SortField =
  | "logo"
  | "brand"
  | "match"
  | "category"
  | "where"
  | "startDate"
  | "endDate"
  | "status";

export interface TableOrder {
  /** Empty: the order of the list. */
  readonly field: "" | SortField;
  readonly direction: 1 | -1;
}

export const NATURAL_ORDER: TableOrder = { field: "", direction: 1 };

/** What is on the screen, so that filtering by what can be read works. */
function textFields({ brand, promotion, startDate }: ResultRow) {
  return {
    brand,
    match: promotion ? decodeEntities(promotion.titulo) : "",
    category: promotion ? decodeEntities(promotion.subtitulo) : "",
    startDate: promotion ? formatDate(startDate) : "",
    endDate: promotion ? formatDate(promotion.fecha_hasta) : "",
    where: promotion ? whereText(promotion) : "",
  };
}

function contains(text: string, query: string): boolean {
  return !query || lowerCased(text).includes(lowerCased(query));
}

function passesTicks({ promotion }: ResultRow, filters: TableFilters): boolean {
  if (filters.hideOnline && isOnlinePromotion(promotion)) return false;
  if (filters.onlyNew && !isNewPromotion(promotion)) return false;
  return !filters.onlyPercent || promotionHasPercent(promotion);
}

function passesLogo({ promotion }: ResultRow, filters: TableFilters): boolean {
  const hasLogo = Boolean(promotion?.imagen);
  if (filters.logo === "con") return hasLogo;
  return filters.logo !== "sin" || !hasLogo;
}

function passesColumns(fields: ReturnType<typeof textFields>, filters: TableFilters): boolean {
  if (filters.category && fields.category !== filters.category) return false;
  return (
    contains(fields.brand, filters.brand) &&
    contains(fields.match, filters.match) &&
    contains(fields.where, filters.where) &&
    contains(fields.startDate, filters.startDate) &&
    contains(fields.endDate, filters.endDate)
  );
}

function passesGlobal(
  row: ResultRow,
  fields: ReturnType<typeof textFields>,
  { global }: TableFilters,
): boolean {
  if (!global) return true;
  return (
    [fields.brand, fields.match, fields.category, fields.where].some((text) =>
      contains(text, global),
    ) ||
    contains(statusText(row.status, row.startDate), global) ||
    (isNewPromotion(row.promotion) && contains("Nueva", global))
  );
}

function passesFilters(row: ResultRow, filters: TableFilters): boolean {
  if (filters.status && row.status !== filters.status) return false;
  if (!passesLogo(row, filters) || !passesTicks(row, filters)) return false;
  const fields = textFields(row);
  return passesColumns(fields, filters) && passesGlobal(row, fields, filters);
}

/** First what has to be fixed on the flyer, last what is fine. */
const STATUS_URGENCY: Readonly<Record<PromotionStatus, number>> = {
  NO_ENCONTRADA: 0,
  VENCIDA: 1,
  FUERA_PROV: 2,
  VENCE_ESTE_MES: 3,
  REVISAR: 4,
  PROXIMA: 5,
  SIN_FECHA: 6,
  VIGENTE: 7,
};

const NO_DATE = "9999";
/** What is empty goes last: to sort is to group what was found. */
const AFTER_ALL = "￿";

function sortValue(row: ResultRow, field: SortField): string | number {
  if (field === "status") return STATUS_URGENCY[row.status];
  if (field === "logo") return row.promotion?.imagen ? 0 : 1;
  if (field === "startDate") {
    return row.promotion && row.startDate ? row.startDate.slice(0, 10) : NO_DATE;
  }
  if (field === "endDate") return row.promotion?.fecha_hasta?.slice(0, 10) ?? NO_DATE;
  return textFields(row)[field].toLowerCase() || AFTER_ALL;
}

export interface VisibleRow {
  readonly row: ResultRow;
  /** Where it is on the list: the tie of an order keeps it. */
  readonly position: number;
  /** How many promotions the tick of one row per brand hides behind this one. */
  readonly hidden: number;
  /** The names that were joined, when there are several. */
  readonly joinedNames: readonly string[] | null;
}

function titleOfRow({ brand, promotion }: ResultRow): string {
  return brand || (promotion?.titulo ?? "");
}

interface BrandGroup {
  best: VisibleRow;
  count: number;
  names: string[];
}

function replacesBest(candidate: ResultRow, best: ResultRow): boolean {
  if (!candidate.promotion) return false;
  return !best.promotion || isBetterPromotion(candidate.promotion, best.promotion);
}

/**
 * What stands for each brand: the running one that ends later. The short names come from the WHOLE
 * list: hiding a row must not change how the others are grouped.
 */
function oneRowPerBrand(
  visible: readonly VisibleRow[],
  allRows: readonly ResultRow[],
): VisibleRow[] {
  const bases = new Set(allRows.map(titleOfRow).filter(Boolean).map(baseBrand));
  const groups = new Map<string, BrandGroup>();
  for (const entry of visible) {
    const title = titleOfRow(entry.row);
    const key = keyOfGroup(entry, title, bases);
    const group = groups.get(key) ?? { best: entry, count: 0, names: [] };
    groups.set(key, group);
    group.count += 1;
    if (!group.names.includes(title)) group.names.push(title);
    if (replacesBest(entry.row, group.best.row)) group.best = entry;
  }
  return [...groups.values()].map(standingFor);
}

function standingFor({ best, count, names }: BrandGroup): VisibleRow {
  return { ...best, hidden: count - 1, joinedNames: names.length > 1 ? names : null };
}

/** On Buscar the group is the pasted line. Without a title, each row is its own group. */
function keyOfGroup({ row, position }: VisibleRow, title: string, bases: ReadonlySet<string>) {
  if (row.group !== null) return `g${String(row.group)}`;
  return title ? brandGroupKey(baseBrand(title), bases) : `#${String(position)}`;
}

function sortRows(visible: readonly VisibleRow[], { field, direction }: TableOrder): VisibleRow[] {
  if (!field) return [...visible];
  return visible.toSorted((one, other) => {
    const oneValue = sortValue(one.row, field);
    const otherValue = sortValue(other.row, field);
    if (oneValue < otherValue) return -direction;
    if (oneValue > otherValue) return direction;
    return one.position - other.position;
  });
}

export function visibleRows(
  rows: readonly ResultRow[],
  filters: TableFilters,
  order: TableOrder,
): VisibleRow[] {
  const passing = rows.flatMap((row, position) =>
    passesFilters(row, filters) ? [{ row, position, hidden: 0, joinedNames: null }] : [],
  );
  return sortRows(filters.oneRowPerBrand ? oneRowPerBrand(passing, rows) : passing, order);
}

export function hasFilters(filters: TableFilters): boolean {
  return Object.values(filters).some(Boolean);
}

/** A new run: the column filters go, the ticks are the context the advisor works in. */
export function keepTicks({
  hideOnline,
  oneRowPerBrand: oneRow,
  onlyNew,
  onlyPercent,
}: TableFilters) {
  return { ...NO_FILTERS, hideOnline, oneRowPerBrand: oneRow, onlyNew, onlyPercent };
}

/** Each press on the same column goes on: up, down, and back to the order of the list. */
export function nextOrder(order: TableOrder, field: SortField): TableOrder {
  if (order.field !== field) return { field, direction: 1 };
  return order.direction === 1 ? { field, direction: -1 } : NATURAL_ORDER;
}

export function orderKey({ field, direction }: TableOrder): string {
  return field && direction === -1 ? `${field}:desc` : field;
}

export const ORDER_OPTIONS: readonly (readonly [string, string])[] = [
  ["", "Orden en que las pegué"],
  ["status", "Estado (primero lo que hay que corregir)"],
  ["status:desc", "Estado (primero las vigentes)"],
  ["brand", "Marca (A → Z)"],
  ["brand:desc", "Marca (Z → A)"],
  ["match", "Coincidencia en Galicia (A → Z)"],
  ["category", "Categoría (A → Z)"],
  ["where", "Dónde (A → Z)"],
  ["endDate", "Vencimiento (la que vence primero)"],
  ["endDate:desc", "Vencimiento (la que vence último)"],
  ["startDate", "Inicio (la más antigua)"],
  ["logo", "Con logo primero"],
];

function isSortField(value: string): value is SortField {
  return ORDER_OPTIONS.some(([key]) => key === value);
}

export function orderOfKey(key: string): TableOrder {
  const [field = "", side] = key.split(":");
  if (!isSortField(field)) return NATURAL_ORDER;
  return { field, direction: side === "desc" ? -1 : 1 };
}

export interface StatusChip {
  readonly status: PromotionStatus;
  readonly label: string;
  readonly count: number;
}

export function countByStatus(
  rows: readonly ResultRow[],
): Readonly<Record<PromotionStatus, number>> {
  const counts: Record<PromotionStatus, number> = {
    VIGENTE: 0,
    VENCE_ESTE_MES: 0,
    VENCIDA: 0,
    REVISAR: 0,
    NO_ENCONTRADA: 0,
    SIN_FECHA: 0,
    FUERA_PROV: 0,
    PROXIMA: 0,
  };
  for (const { status, excluded } of rows) {
    if (!excluded) counts[status] += 1;
  }
  return counts;
}

const ALWAYS_COUNTED: readonly PromotionStatus[] = [
  "NO_ENCONTRADA",
  "VENCIDA",
  "VENCE_ESTE_MES",
  "REVISAR",
  "VIGENTE",
];
const ONLY_IF_ANY_ON_ACTIVE: ReadonlySet<PromotionStatus> = new Set([
  "NO_ENCONTRADA",
  "REVISAR",
  "FUERA_PROV",
]);

/**
 * The counters, that also filter. "Próximamente" only when there is any; without a province, the one
 * of out of the province would say 0 forever; on Activas nothing was pasted, so those of a pasted
 * brand show only if they happen.
 */
export function statusChips(
  rows: readonly ResultRow[],
  province: string,
  isActiveTab: boolean,
): StatusChip[] {
  const counts = countByStatus(rows);
  const chips = [...ALWAYS_COUNTED];
  if (counts.PROXIMA > 0) chips.splice(-1, 0, "PROXIMA");
  if (province) chips.splice(1, 0, "FUERA_PROV");
  return chips
    .filter((status) => !isActiveTab || counts[status] > 0 || !ONLY_IF_ANY_ON_ACTIVE.has(status))
    .map((status) => ({ status, label: STATUS_LABEL[status], count: counts[status] }));
}

export function statusesPresent(
  rows: readonly ResultRow[],
  current: TableFilters["status"],
): PromotionStatus[] {
  const counts = countByStatus(rows);
  return PROMOTION_STATUSES.filter((status) => counts[status] > 0 || current === status);
}

export function categoriesPresent(rows: readonly ResultRow[]): string[] {
  const names = rows.flatMap(({ promotion }) =>
    promotion?.subtitulo ? [decodeEntities(promotion.subtitulo)] : [],
  );
  return [...new Set(names)].toSorted();
}
