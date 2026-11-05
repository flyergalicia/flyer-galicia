// Dates as Benchmark counts them: in Argentina (UTC-3), as AAAA-MM-DD, which compare as text.

const DAY_MS = 86_400_000;
const ARGENTINA_OFFSET_MS = 3 * 3_600_000;

/** The date of today, or of n days from now, in Argentina. */
export function argentinaDay(daysAhead = 0, now: number = Date.now()): string {
  return new Date(now - ARGENTINA_OFFSET_MS + daysAhead * DAY_MS).toISOString().slice(0, 10);
}

/** "dd/m" without leading zeros, from a date or a moment; empty when there is none. */
export function shortDate(value: string | null | undefined): string {
  if (!value) return "";
  const onlyDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (onlyDate) return `${String(Number(onlyDate[3]))}/${String(Number(onlyDate[2]))}`;
  const moment = new Date(value);
  if (Number.isNaN(moment.getTime())) return "";
  return `${String(moment.getDate())}/${String(moment.getMonth() + 1)}`;
}

/** The day of the week of today in Argentina: 0 is Monday. */
export function todayWeekday(now: number = Date.now()): number {
  return (new Date(`${argentinaDay(0, now)}T12:00:00`).getDay() + 6) % 7;
}

export const WEEKDAYS = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
] as const;

/** The name of a day of the week, 0 being Monday; empty for any other number. */
export function dayName(day: number): string {
  return WEEKDAYS[day] ?? "";
}

/** Whether a promotion is valid on that day of the week: without days, it is valid every day. */
export function validOnDay(days: readonly number[] | null | undefined, day: number): boolean {
  return !days || days.length === 0 || days.includes(day);
}
