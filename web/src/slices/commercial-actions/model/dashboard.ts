// The dashboard, as data: its period, and how the numbers of the database read.
import { MONTHS_LONG } from "./agenda-dates.ts";
import { isoDate } from "./formatting.ts";
import { PACKAGES } from "./labels.ts";

export type Period = "30" | "90" | "anio" | "q" | "todo";

export const PERIOD_CHOICES: readonly (readonly [Period, string])[] = [
  ["30", "Últimos 30 días"],
  ["90", "Últimos 90 días"],
  ["anio", "Este año"],
  ["q", "Por trimestre o mes…"],
  ["todo", "Todo"],
];

export interface DashboardFilters {
  readonly period: string;
  readonly year: number;
  /** "01".."12"; empty until something is chosen. */
  readonly months: readonly string[];
  readonly openQuarters: readonly number[];
  readonly type: string;
  readonly hunter: string;
  readonly officer: string;
  readonly trials: boolean;
}

export function initialDashboardFilters(): DashboardFilters {
  return {
    period: "90",
    year: new Date().getFullYear(),
    months: [],
    openQuarters: [],
    type: "",
    hunter: "",
    officer: "",
    trials: true,
  };
}

const THIRTY_DAYS = 30;
const NINETY_DAYS = 90;
const MONTHS_PER_QUARTER = 3;
const TWO_DIGITS = 2;
export const QUARTERS: readonly number[] = [1, 2, 3, 4];

function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return isoDate(date);
}

export function periodStart(period: string): string | null {
  if (period === "30") return daysAgo(THIRTY_DAYS);
  if (period === "90") return daysAgo(NINETY_DAYS);
  return period === "anio" ? `${String(new Date().getFullYear())}-01-01` : null;
}

export function quarterMonths(quarter: number): readonly string[] {
  return Array.from({ length: MONTHS_PER_QUARTER }, (_, index) =>
    String((quarter - 1) * MONTHS_PER_QUARTER + index + 1).padStart(TWO_DIGITS, "0"),
  );
}

export function isWholeQuarter(quarter: number, months: readonly string[]): boolean {
  return quarterMonths(quarter).every((month) => months.includes(month));
}

function quarterOfToday(): number {
  return Math.floor(new Date().getMonth() / MONTHS_PER_QUARTER) + 1;
}

/** If nothing was chosen yet, the quarter of today. */
export function chosenMonths({ months }: DashboardFilters): readonly string[] {
  return months.length > 0 ? months : quarterMonths(quarterOfToday());
}

/** "YYYY-MM" of what is chosen, or null if the period does not go by quarter. */
export function periodMonths(filters: DashboardFilters): readonly string[] | null {
  if (filters.period !== "q") return null;
  return chosenMonths(filters).map((month) => `${String(filters.year)}-${month}`);
}

/**
 * Without Shift only what was touched stays. With Shift: if all of it was already there it goes away,
 * and if not, it adds. It never stays empty.
 */
export function touchedMonths(
  filters: DashboardFilters,
  touched: readonly string[],
  adding: boolean,
): DashboardFilters {
  const before = chosenMonths(filters);
  const isAllThere = touched.every((month) => before.includes(month));
  let next = [...touched];
  if (adding) {
    next = isAllThere
      ? before.filter((month) => !touched.includes(month))
      : [...new Set([...before, ...touched])];
  }
  return { ...filters, months: (next.length > 0 ? next : touched.slice(0, 1)).toSorted() };
}

export function withPeriod(filters: DashboardFilters, period: string): DashboardFilters {
  const months =
    period === "q" && filters.months.length === 0
      ? quarterMonths(quarterOfToday())
      : filters.months;
  return { ...filters, period, months };
}

function listText(items: readonly string[]): string {
  if (items.length < TWO_DIGITS) return items.join("");
  return `${items.slice(0, -1).join(", ")} y ${items.at(-1) ?? ""}`;
}

/** "1Q y 3Q de 2026" or "enero y marzo de 2026". */
export function quartersText(filters: DashboardFilters): string {
  const chosen = chosenMonths(filters);
  const whole = QUARTERS.filter((quarter) => isWholeQuarter(quarter, chosen));
  const onlyQuarters = whole.length * MONTHS_PER_QUARTER === chosen.length;
  const names = onlyQuarters
    ? whole.map((quarter) => `${String(quarter)}Q`)
    : chosen.map((month) => MONTHS_LONG[Number(month) - 1] ?? "");
  return `${listText(names)} de ${String(filters.year)}`;
}

/** What the chosen period is called, to explain where the numbers come from. */
export function periodText(filters: DashboardFilters): string {
  const { period } = filters;
  if (period === "q") return quartersText(filters);
  if (period === "30") return "los últimos 30 días";
  if (period === "90") return "los últimos 90 días";
  return period === "anio" ? "este año" : "todo";
}

export interface PackageSignups {
  readonly paquete: string | null;
  readonly altas: number;
}

export interface WithAndWithout {
  readonly withPackage: number;
  readonly without: number;
  readonly notLoaded: number;
}

/** "caja" is the signup with no package. */
export function withAndWithout(rows: readonly PackageSignups[]): WithAndWithout {
  const count = { withPackage: 0, without: 0, notLoaded: 0 };
  for (const { paquete, altas } of rows) {
    if (paquete === "caja") count.without += altas;
    else if (paquete && PACKAGES[paquete]) count.withPackage += altas;
    else count.notLoaded += altas;
  }
  return count;
}

/** "7 con paquete (5 Plus · 2 Plus Gold) · 1 sin paquete": the signups of a hunter. */
export function hunterPackagesText(packages: Readonly<Record<string, number>> | null): string {
  const counts = packages ?? {};
  const named = Object.keys(PACKAGES).filter((key) => key !== "caja" && counts[key]);
  const withOne = named.reduce((total, key) => total + (counts[key] ?? 0), 0);
  const without = counts.caja ?? 0;
  if (!withOne && !without) return "";
  const parts = named.map((key) => `${String(counts[key] ?? 0)} ${PACKAGES[key] ?? ""}`);
  const first = withOne ? `${String(withOne)} con paquete (${parts.join(" · ")})` : "";
  const second = without ? `${String(without)} sin paquete` : "";
  return [first, second].filter(Boolean).join(" · ");
}

export interface MonthTotals {
  readonly mes: string;
  readonly prospectos: number;
  readonly altas: number;
}

/** The steps of the axis of the chart of months. */
export function chartScale(highest: number): { readonly step: number; readonly top: number } {
  const step = stepFor(highest);
  return { step, top: Math.ceil(highest / step) * step };
}

function stepFor(highest: number): number {
  if (highest <= 10) return 2;
  if (highest <= 50) return 10;
  if (highest <= 200) return 50;
  return highest <= 1000 ? 200 : 1000;
}

export function monthsOfChart(rows: readonly MonthTotals[]): readonly MonthTotals[] {
  return rows.slice(-12);
}

export function funnelWidth(value: number, base: number): number {
  return value ? Math.max(8, Math.round((value * 100) / base)) : 0;
}

export function signupsPerAction(signups: number, actions: number): string {
  return actions ? (signups / actions).toFixed(1).replace(".", ",") : "—";
}

export interface PersonFigures {
  readonly id: string | null;
  readonly visitas: number;
  readonly prospectos: number;
  readonly altas: number;
  readonly paquetes?: Readonly<Record<string, number>> | null;
}

/** The rows with no owner do not rank, and whoever has more signups goes first. */
export function ranked(rows: readonly PersonFigures[]): readonly PersonFigures[] {
  return rows.filter(({ id }) => id).toSorted((a, b) => b.altas - a.altas || b.visitas - a.visitas);
}

export interface TypeFigures {
  readonly tipo: string;
  readonly modalidad: string;
  readonly visitas: number;
  readonly prospectos: number;
  readonly altas: number;
}

const TYPE_ORDER = [
  "posicion|presencial",
  "posicion|virtual",
  "accion|presencial",
  "accion|virtual",
  "feria|presencial",
  "feria|virtual",
  "datos|virtual",
  "datos|presencial",
];

export function byTypeOrder(rows: readonly TypeFigures[]): readonly TypeFigures[] {
  const position = ({ tipo, modalidad }: TypeFigures) => TYPE_ORDER.indexOf(`${tipo}|${modalidad}`);
  return rows.toSorted((a, b) => position(a) - position(b));
}
