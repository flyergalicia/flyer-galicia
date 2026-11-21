// A row of flyer_disenos as Estudio and Guardar en Estudio read it. What is saved is only the design
// (not the officers nor the amounts): it serves for any company.
import type { QueryClient } from "@tanstack/react-query";

/** Who changed something tells it here: Estudio reads the list again from this key. */
export const STUDIO_DESIGNS_QUERY_KEY = ["studio", "designs"] as const;

export const DESIGN_COLUMNS =
  "id,user_id,autor,nombre,empresa,opcion,base_name,miniatura,estado,nota_admin,opcion_publicada,pedido_at,revisado_at,created_at,updated_at,compartido_por,compartido_de,compartido_at";

export type DesignStatus = "privado" | "pedido" | "consulta" | "publicado" | "rechazado";

export interface DesignRow {
  readonly id: string;
  readonly user_id: string | null;
  readonly autor: string | null;
  readonly nombre: string;
  readonly empresa: string | null;
  readonly opcion: number;
  readonly base_name: string | null;
  readonly miniatura: string | null;
  readonly estado: string;
  readonly nota_admin: string | null;
  readonly opcion_publicada: number | null;
  readonly pedido_at: string | null;
  readonly revisado_at: string | null;
  readonly created_at: string | null;
  readonly updated_at: string | null;
  readonly compartido_por: string | null;
  readonly compartido_de: string | null;
  readonly compartido_at: string | null;
}

export function isDesignRow(value: unknown): value is DesignRow {
  return typeof value === "object" && value !== null && "id" in value && "nombre" in value;
}

/** An open request: it waits for the administrator, or for the author to answer a question. */
export function isOpenRequest({ estado }: Pick<DesignRow, "estado">): boolean {
  return estado === "pedido" || estado === "consulta";
}

/** A design that was saved or changed goes on the list, without reading all the thumbnails again. */
export function upsertDesign(queryClient: QueryClient, row: DesignRow): void {
  queryClient.setQueryData<readonly DesignRow[]>(STUDIO_DESIGNS_QUERY_KEY, (list) => {
    if (!list) return list;
    const at = list.findIndex(({ id }) => id === row.id);
    return at >= 0 ? list.with(at, row) : [row, ...list];
  });
}
