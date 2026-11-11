import { describe, expect, it } from "vitest";
import type { PermissionKey } from "@/shared/session/permissions.ts";
import { databasePanes } from "./database-panes.ts";

function allowing(...keys: string[]) {
  return (key: PermissionKey) => keys.includes(key);
}

describe("the panes of Base de datos", () => {
  it("are what each person may see", () => {
    expect(databasePanes(allowing("padron_buscar", "asesores_guardados"), 0)).toEqual([
      { id: "empresas", label: "Mis empresas" },
      { id: "asesores", label: "Mis asesores" },
      { id: "propuestas", label: "Cambios pendientes" },
    ]);
    expect(databasePanes(allowing("asesores_guardados"), 0)).toEqual([
      { id: "asesores", label: "Mis asesores" },
    ]);
  });

  it("bring what waits for a decision, also to whoever has no companies", () => {
    expect(databasePanes(allowing(), 2)).toEqual([
      { id: "propuestas", label: "Cambios pendientes (2)" },
    ]);
  });
});
