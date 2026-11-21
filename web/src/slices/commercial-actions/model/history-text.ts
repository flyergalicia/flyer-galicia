// What happened to an action, in Spanish. The history is written by the database.
import type { Json } from "@/shared/supabase/index.ts";
import { dateLabel } from "./formatting.ts";
import { ACTION_STATES, DISCARD_REASONS, PACKAGES_SHORT } from "./labels.ts";
import { nameOf, type Who } from "./who.ts";

export interface HistoryEvent {
  readonly que: string;
  readonly quien: string | null;
  readonly detalle: Json;
}

type Detail = Readonly<Record<string, string | undefined>>;

function detailOf(detail: Json): Detail {
  if (typeof detail !== "object" || detail === null || Array.isArray(detail)) return {};
  return Object.fromEntries(
    Object.entries(detail).flatMap(([key, value]) =>
      typeof value === "string" ? [[key, value]] : [],
    ),
  );
}

function when(date: string | undefined, from: string | undefined, to: string | undefined): string {
  const time = from ? ` ${from}${to ? `–${to}` : ""}` : "";
  return `${date ? dateLabel(date) : ""}${time}`;
}

type Writers = Readonly<
  Record<string, (who: string, detail: Detail, name: (id?: string) => string) => string>
>;

const WRITERS: Writers = {
  registrada: (who) => `${who} la registró.`,
  derivada: (who, { hunter }, name) => `${who} se la derivó a ${name(hunter)}.`,
  por_asignar: (who, { lider }, name) =>
    `${who} la mandó al equipo para que la asigne ${name(lider)}.`,
  hunter: (who, { de, a }, name) =>
    de ? `${who} se la pasó de ${name(de)} a ${name(a)}.` : `${who} se la asignó a ${name(a)}.`,
  horario: (who, detail) =>
    `${who} cambió el día u horario: ${when(detail["fecha_de"], detail["desde_de"], detail["hasta_de"])} → ${when(detail["fecha_a"], detail["desde_a"], detail["hasta_a"])}.`,
  estado: (who, { a }) =>
    `${who} la marcó como ${(ACTION_STATES[a ?? ""] ?? String(a)).toLowerCase()}.`,
  no_puede: (who, { motivo }) => `${who} avisó que no puede ir${motivo ? `: ${motivo}` : ""}.`,
  alta: (who, { nombre, paquete }) =>
    `${who} marcó el alta de ${String(nombre)} (${PACKAGES_SHORT[paquete ?? ""] ?? "sin paquete cargado"}).`,
  descarte: (who, { nombre, motivo }) =>
    `${who} descartó a ${String(nombre)} (${DISCARD_REASONS[motivo ?? ""] ?? "sin motivo"}).`,
};

/** Always with the name, also one's own: "Vos se la derivó" does not read well. */
export function historyText(who: Who, { que, quien, detalle }: HistoryEvent): string {
  const name = (id?: string | null) => (id && who.people[id]?.nombre) || nameOf(who, id);
  const author = name(quien);
  const write = WRITERS[que];
  return write ? write(author, detailOf(detalle), name) : `${author}: ${que}`;
}
