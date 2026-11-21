// Guardar en Estudio: a new row of flyer_disenos, or the changes of the design that is open. What is
// saved is only the design: it serves for any company.
import { DESIGN_COLUMNS, type DesignRow, isDesignRow } from "@/shared/lib/studio/design-row.ts";
import type { Backend, Json } from "@/shared/supabase/index.ts";
import { SavedSetsError } from "./saved-sets.ts";

export interface DesignContent {
  readonly v: number;
  readonly cambios: unknown;
  readonly subidos: unknown;
  readonly recortes: unknown;
  readonly legal: string;
}

export interface DesignFields {
  readonly nombre: string;
  readonly empresa: string;
  readonly opcion: number;
  readonly base_name: string;
  readonly datos: DesignContent;
  readonly miniatura: string;
}

function asJson(data: DesignContent): Json {
  const copy: Json = JSON.parse(JSON.stringify(data));
  return copy;
}

export async function saveDesign(
  { db }: Pick<Backend, "db">,
  fields: DesignFields,
  sameAs: string | null,
): Promise<DesignRow> {
  const row = { ...fields, datos: asJson(fields.datos) };
  const request = sameAs
    ? db.from("flyer_disenos").update(row).eq("id", sameAs)
    : db.from("flyer_disenos").insert({ estado: "privado", ...row });
  const { data, error } = await request.select(DESIGN_COLUMNS).single();
  if (error || !isDesignRow(data)) throw new SavedSetsError(error);
  return data;
}
