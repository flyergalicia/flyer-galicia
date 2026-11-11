// The trays over the agenda, which do not depend on the week: who to contact, what is waiting for a
// hunter, who asked to be replaced and the data lists to work on.
import type { AgendaExtras, PersonToContact, TrayAction } from "../api/agenda.ts";
import { today } from "./formatting.ts";
import type { AgendaView } from "./agenda-place.ts";

export const TRAY_ROWS = 6;

export interface Trays {
  readonly toContact: readonly PersonToContact[];
  readonly unassigned: readonly TrayAction[];
  readonly reassign: readonly TrayAction[];
  readonly dataLists: readonly TrayAction[];
}

function withHunter(list: readonly TrayAction[]): readonly TrayAction[] {
  return list.filter(({ hunter_id: id }) => id);
}

/**
 * Looking at the agenda of ONE hunter, the trays show what is theirs, or everything gets mixed. What
 * has no hunter still shows: it is precisely what has to be shared out.
 */
export function traysOf(
  extras: AgendaExtras,
  {
    isHunter,
    hunter,
    view,
  }: {
    readonly isHunter: boolean;
    readonly hunter: string;
    readonly view: AgendaView;
  },
): Trays {
  const isOfOne = Boolean(hunter) && !isHunter && view !== "mes";
  const shown = (list: readonly TrayAction[]) =>
    isOfOne ? list.filter(({ hunter_id: id }) => id === hunter) : list;
  return {
    toContact: isHunter ? extras.toContact : [],
    unassigned: isHunter ? [] : extras.unassigned,
    reassign: withHunter(shown(extras.cannotAttend)),
    dataLists: withHunter(shown(extras.dataLists)),
  };
}

export interface ContactGroups {
  /** They had a date before today. */
  readonly overdue: readonly PersonToContact[];
  readonly ofToday: readonly PersonToContact[];
}

export function contactGroups(people: readonly PersonToContact[]): ContactGroups {
  const now = today();
  return {
    overdue: people.filter(({ proximo }) => (proximo ?? "") < now),
    ofToday: people.filter(({ proximo }) => (proximo ?? "") >= now),
  };
}
