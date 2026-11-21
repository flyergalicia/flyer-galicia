// The days of the agenda: its weeks go from Monday, its months are "YYYY-MM".
import { addDays, isoDate, minutesOf, MONTHS, timeOf, today } from "./formatting.ts";

const DAYS_PER_WEEK = 7;
const DAY_MS = 86_400_000;
const TWO_DIGITS = 2;
const MONTH_LENGTH = 7;
const LEADING_ZERO = /^0/;
const WHOLE_HOUR = /:00$/;

/** With Monday first. */
export const WEEKDAYS: readonly string[] = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export const MONTHS_LONG: readonly string[] = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function dateOf(iso: string): Date {
  const [year = 0, month = 1, day = 1] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** Of a date, with Monday at 0. */
export function weekdayOf(iso: string): number {
  return (dateOf(iso).getDay() + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK;
}

export function mondayOf(iso: string): string {
  return addDays(iso, -weekdayOf(iso));
}

export function daysOfWeek(monday: string): readonly string[] {
  return Array.from({ length: DAYS_PER_WEEK }, (_, index) => addDays(monday, index));
}

export function monthOf(iso: string): string {
  return iso.slice(0, MONTH_LENGTH);
}

export function monthStart(month: string): string {
  return `${month}-01`;
}

export function monthEnd(month: string): string {
  const [year = 0, number = 1] = month.split("-").map(Number);
  return isoDate(new Date(year, number, 0));
}

export function addMonths(month: string, count: number): string {
  const [year = 0, number = 1] = month.split("-").map(Number);
  const date = new Date(year, number - 1 + count, 1);
  const shown = String(date.getMonth() + 1).padStart(TWO_DIGITS, "0");
  return `${String(date.getFullYear())}-${shown}`;
}

/** From a to b; 0 if one of them is missing. */
export function daysBetween(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  return Math.round((dateOf(b).getTime() - dateOf(a).getTime()) / DAY_MS);
}

/** "19 al 24 de oct", "26 de oct al 1 de nov". */
export function weekRangeText(first: string, last: string): string {
  const [, firstMonth = "", firstDay = ""] = first.split("-");
  const [lastYear = "", lastMonth = "", lastDay = ""] = last.split("-");
  const start =
    firstMonth === lastMonth
      ? String(Number(firstDay))
      : `${String(Number(firstDay))} de ${MONTHS[Number(firstMonth) - 1] ?? ""}`;
  const year = lastYear === today().slice(0, 4) ? "" : ` ${lastYear}`;
  return `${start} al ${String(Number(lastDay))} de ${MONTHS[Number(lastMonth) - 1] ?? ""}${year}`;
}

/** "Noviembre 2026". */
export function monthTitle(month: string): string {
  const [year = "", number = "1"] = month.split("-");
  const name = MONTHS_LONG[Number(number) - 1] ?? "";
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

function shortOf(time: string | null): string {
  return timeOf(time).replace(LEADING_ZERO, "").replace(WHOLE_HOUR, "");
}

/** "10–12", "9:30–13": for the small places of the grid. */
export function shortTime({
  hora_desde: from,
  hora_hasta: to,
}: {
  readonly hora_desde: string | null;
  readonly hora_hasta?: string | null;
}): string {
  if (!from) return "";
  const end = to ? `–${shortOf(to)}` : "";
  return `${shortOf(from)}${end}`;
}

interface Placed {
  readonly fecha: string;
  readonly hora_desde: string | null;
  readonly empresa: string | null;
}

/** By day and time; what has no time goes first. */
export function byDayAndTime(a: Placed, b: Placed): number {
  if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
  const first = minutesOf(a.hora_desde);
  const second = minutesOf(b.hora_desde);
  if (first !== second) {
    if (first === null) return -1;
    return second === null ? 1 : first - second;
  }
  return String(a.empresa).localeCompare(String(b.empresa));
}
