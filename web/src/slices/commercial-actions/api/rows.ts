// The rows as they come from the database. The names of their columns are a contract.
import type { Database } from "@/shared/supabase/index.ts";

type Tables = Database["public"]["Tables"];

export type ActionRow = Tables["gestiones"]["Row"];
export type PersonRow = Tables["gestion_prospectos"]["Row"];
export type MessageRow = Tables["gestion_mensajes"]["Row"];
export type EventRow = Tables["gestion_eventos"]["Row"];
export type NewAction = Omit<Tables["gestiones"]["Insert"], "empresa_key">;
export type ActionChanges = Tables["gestiones"]["Update"];
export type PersonChanges = Tables["gestion_prospectos"]["Update"];
export type NewPerson = Tables["gestion_prospectos"]["Insert"];

/** gestiones_lista adds what its list counts. */
export interface ListedAction extends ActionRow {
  readonly n_pros: number;
  readonly n_altas: number;
  readonly n_datos: number;
}

export interface UnreadMessages {
  readonly gestion_id: string;
  readonly n: number;
}

/** What is known of a time taken: another person's company comes hidden. */
export interface TakenTime {
  readonly id: string;
  readonly hora_desde: string | null;
  readonly hora_hasta: string | null;
  readonly tipo: string;
  readonly empresa: string | null;
}

export interface DayOccupancy {
  readonly hunter_id: string | null;
  readonly hora_desde: string | null;
  readonly hora_hasta: string | null;
}

export interface MyCompany {
  readonly empresa: string;
  readonly cuits: readonly string[] | null;
}
