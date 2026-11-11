// Where the agenda is looking: which view, which week, month and day, and whose agenda. What is
// remembered is what the person chose; the rest is worked out from today.
import {
  addMonths,
  daysOfWeek,
  mondayOf,
  monthEnd,
  monthOf,
  monthStart,
  monthTitle,
  weekRangeText,
} from "./agenda-dates.ts";
import { addDays, dateLabel, today } from "./formatting.ts";

export type AgendaView = "sem" | "dia" | "equipo" | "mes";
export type AgendaMove = -1 | 0 | 1;

export interface AgendaPlace {
  /** Null: not chosen, and it depends on the profile. */
  readonly view: AgendaView | null;
  readonly monday: string | null;
  readonly month: string | null;
  readonly day: string | null;
  readonly hunter: string;
}

export const NO_PLACE: AgendaPlace = {
  view: null,
  monday: null,
  month: null,
  day: null,
  hunter: "",
};

const DAYS_PER_WEEK = 7;
const SUNDAY = 6;

/** What was saved on this computer, if it is a view. */
export function savedView(value: string | null): AgendaView | null {
  return value === "sem" || value === "dia" || value === "equipo" || value === "mes" ? value : null;
}

/** Whoever assigns starts on all the hunters; a hunter, on their own week. */
export function viewOf({ view }: AgendaPlace, role: string): AgendaView {
  return view ?? (role === "hunter" ? "sem" : "equipo");
}

export function mondayShown({ monday }: AgendaPlace): string {
  return monday ?? mondayOf(today());
}

export function monthShown({ month }: AgendaPlace): string {
  return month ?? monthOf(today());
}

function hasOneDay(view: AgendaView): boolean {
  return view === "equipo" || view === "dia";
}

export interface DateRange {
  readonly from: string;
  readonly to: string;
}

/** The memory goes by range: week, day and day of the team look at the same week. */
export function rangeOf(place: AgendaPlace, view: AgendaView): DateRange {
  if (view === "mes") {
    const month = monthShown(place);
    return { from: monthStart(month), to: monthEnd(month) };
  }
  const monday = mondayShown(place);
  return { from: monday, to: addDays(monday, DAYS_PER_WEEK - 1) };
}

/** Sunday only if it has something. */
export function daysShown(
  place: AgendaPlace,
  actions: readonly { readonly fecha: string }[],
): readonly string[] {
  const week = daysOfWeek(mondayShown(place));
  return actions.some(({ fecha }) => fecha === week[SUNDAY]) ? week : week.slice(0, SUNDAY);
}

/** The day being looked at: the chosen one if it is on the week, or today, or its Monday. */
export function dayShown(
  place: AgendaPlace,
  view: AgendaView,
  days: readonly string[],
): string | null {
  if (view === "mes") return place.day;
  const now = today();
  const day = place.day ?? (hasOneDay(view) ? now : null);
  if (day && days.includes(day)) return day;
  return days.includes(now) ? now : (days[0] ?? null);
}

/** "27 al 2 de nov", "30 oct" or "Noviembre 2026". */
export function titleOf(
  place: AgendaPlace,
  view: AgendaView,
  day: string | null,
  days: readonly string[],
): string {
  if (view === "mes") return monthTitle(monthShown(place));
  if (hasOneDay(view) && day) return dateLabel(day);
  return weekRangeText(days[0] ?? "", days.at(-1) ?? "");
}

export function moveWord(view: AgendaView): string {
  if (view === "mes") return "Mes";
  return hasOneDay(view) ? "Día" : "Semana";
}

export function moved(place: AgendaPlace, view: AgendaView, by: AgendaMove): AgendaPlace {
  const now = today();
  if (view === "mes") {
    return { ...place, month: by === 0 ? monthOf(now) : addMonths(monthShown(place), by) };
  }
  if (hasOneDay(view)) {
    const next = by === 0 ? now : addDays(place.day ?? now, by);
    return { ...place, day: next, monday: mondayOf(next) };
  }
  const monday = by === 0 ? mondayOf(now) : addDays(mondayShown(place), DAYS_PER_WEEK * by);
  return { ...place, monday, day: null };
}

/** The new period stands where the one before was, not to lose sight of what was being looked at. */
export function withView(place: AgendaPlace, view: AgendaView, next: AgendaView): AgendaPlace {
  const now = today();
  const month = monthShown(place);
  const startOfMonth = month === monthOf(now) ? now : monthStart(month);
  const anchor = view === "mes" ? startOfMonth : (place.day ?? place.monday ?? now);
  if (next === "mes") return { ...place, view: next, month: monthOf(anchor) };
  return {
    ...place,
    view: next,
    monday: mondayOf(anchor),
    day: hasOneDay(next) ? anchor : null,
  };
}

/** What was just saved shows: it goes to its date. */
export function atDate(place: AgendaPlace, date: string): AgendaPlace {
  return { ...place, monday: mondayOf(date), month: monthOf(date), day: date };
}
