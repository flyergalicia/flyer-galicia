import type { PermissionKey } from "@/shared/session/index.ts";

export type DatabasePane = "empresas" | "asesores" | "propuestas";

export interface DatabasePaneInfo {
  readonly id: DatabasePane;
  readonly label: string;
}

/**
 * What each person can see now. Cambios pendientes shows for whoever has companies and for whoever
 * already has something to decide: a substitute may have none of their own.
 */
export function databasePanes(
  can: (key: PermissionKey) => boolean,
  pendingCount: number,
): readonly DatabasePaneInfo[] {
  const panes: DatabasePaneInfo[] = [];
  if (can("padron_buscar")) panes.push({ id: "empresas", label: "Mis empresas" });
  if (can("asesores_guardados")) panes.push({ id: "asesores", label: "Mis asesores" });
  if (can("padron_buscar") || pendingCount > 0) {
    panes.push({
      id: "propuestas",
      label: `Cambios pendientes${pendingCount > 0 ? ` (${String(pendingCount)})` : ""}`,
    });
  }
  return panes;
}
