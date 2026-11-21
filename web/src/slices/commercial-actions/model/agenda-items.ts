// What goes on the calendar: what whoever looks can open, and what they only know is taken.
import type { AgendaAction, OccupiedTime } from "../api/agenda.ts";

export function asOwnItem(action: AgendaAction) {
  return { ...action, isHidden: false };
}

export function asHiddenItem(time: OccupiedTime) {
  return { ...time, isHidden: true };
}
