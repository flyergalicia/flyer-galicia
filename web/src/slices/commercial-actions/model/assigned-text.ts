import type { ActionFormValues } from "./action-form.ts";
import type { PastedPerson } from "./people-paste.ts";
import { nameOf, type Who } from "./who.ts";

/** What the notice says after forwarding or assigning. */
export function assignedText(
  who: Who,
  values: ActionFormValues,
  created: number,
  people: readonly PastedPerson[] | null,
): string {
  const { hunter_id: hunter, lider_id: leader } = values;
  const start = hunter
    ? `Derivada a ${nameOf(who, hunter)}`
    : `Queda para que la asigne ${nameOf(who, leader)}`;
  const list = people?.length
    ? `, con ${String(people.length)}${people.length === 1 ? " persona para contactar" : " personas para contactar"}`
    : "";
  const dates = created > 0 ? `, con las ${String(created + 1)} fechas planificadas` : "";
  const end = hunter
    ? " Le aparece en su agenda y en la marca de su avatar."
    : ' Le aparece en su bandeja "Por asignar".';
  return `${start}${list}${dates}.${end}`;
}
