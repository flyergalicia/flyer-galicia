// How dates, times and numbers read on these screens.

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const TIME_PARTS = /^(\d{1,2}):(\d{2})/;
const MINUTES_PER_HOUR = 60;
const TWO_DIGITS = 2;

function twoDigits(value: number): string {
  return String(value).padStart(TWO_DIGITS, "0");
}

export function isoDate(date: Date): string {
  return `${String(date.getFullYear())}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`;
}

export function today(): string {
  return isoDate(new Date());
}

/** "5 mar", with the year only if it is not this one. */
export function dateLabel(value: string | null | undefined): string {
  if (!value) return "";
  const [year = "", month = "1", day = "1"] = value.slice(0, 10).split("-");
  const shownYear = year === String(new Date().getFullYear()) ? "" : ` ${year}`;
  return `${String(Number(day))} ${MONTHS[Number(month) - 1] ?? ""}${shownYear}`;
}

export function addDays(iso: string, days: number): string {
  const [year = 0, month = 1, day = 1] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return isoDate(date);
}

/** The database keeps "10:00:00": on screen it is "10:00". */
export function timeOf(value: string | null | undefined): string {
  return value ? value.slice(0, 5) : "";
}

export interface HasTimes {
  readonly hora_desde?: string | null;
  readonly hora_hasta?: string | null;
}

export function timeRange({ hora_desde: from, hora_hasta: to }: HasTimes): string {
  const start = timeOf(from);
  if (!start) return "";
  const end = timeOf(to);
  return end ? `${start}–${end}` : `desde ${start}`;
}

export function minutesOf(value: string | null | undefined): number | null {
  const parts = TIME_PARTS.exec(value ?? "");
  return parts ? Number(parts[1]) * MINUTES_PER_HOUR + Number(parts[2]) : null;
}

/**
 * Two actions overlap if both have a time and their spans cross. Without an end, an hour is taken.
 * Without a time nothing is compared: it is not known.
 */
export function overlaps(a: HasTimes, b: HasTimes): boolean {
  const startA = minutesOf(a.hora_desde);
  const startB = minutesOf(b.hora_desde);
  if (startA === null || startB === null) return false;
  const endA = minutesOf(a.hora_hasta) ?? startA + MINUTES_PER_HOUR;
  const endB = minutesOf(b.hora_hasta) ?? startB + MINUTES_PER_HOUR;
  return startA < endB && startB < endA;
}

/** Null if the times are right; if not, what the notice says. */
export function timeProblem({ hora_desde: from, hora_hasta: to }: HasTimes): string | null {
  if (to && !from) return "Poné también la hora de inicio (o borrá la de fin).";
  if (from && to && (minutesOf(to) ?? 0) <= (minutesOf(from) ?? 0)) {
    return "La hora de fin tiene que ser después de la de inicio.";
  }
  return null;
}

export function percent(part: number, whole: number): string {
  return whole ? `${String(Math.round((part * 100) / whole))}%` : "—";
}

export function number(value: number | null | undefined): string {
  return (value ?? 0).toLocaleString("es-AR");
}

export function dateTimeLabel(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${dateLabel(isoDate(date))} ${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;
}
