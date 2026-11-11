import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  type DesignRow,
  isDesignRow,
  isOpenRequest,
  STUDIO_DESIGNS_QUERY_KEY,
  upsertDesign,
} from "./design-row.ts";

function row(id: string, nombre = id): DesignRow {
  return {
    id,
    nombre,
    user_id: null,
    autor: null,
    empresa: null,
    opcion: 9,
    base_name: null,
    miniatura: null,
    estado: "privado",
    nota_admin: null,
    opcion_publicada: null,
    pedido_at: null,
    revisado_at: null,
    created_at: null,
    updated_at: null,
    compartido_por: null,
    compartido_de: null,
    compartido_at: null,
  };
}

describe("a row of designs", () => {
  it("is recognized", () => {
    expect(isDesignRow(row("a"))).toBe(true);
    expect(isDesignRow({ id: "a" })).toBe(false);
    expect(isDesignRow(null)).toBe(false);
  });

  it("is an open request while it waits for somebody", () => {
    expect(isOpenRequest({ estado: "pedido" })).toBe(true);
    expect(isOpenRequest({ estado: "consulta" })).toBe(true);
    expect(isOpenRequest({ estado: "privado" })).toBe(false);
  });

  it("goes on the list: first if it is new, in its place if not", () => {
    const client = new QueryClient();
    upsertDesign(client, row("nobody asked yet"));
    expect(client.getQueryData(STUDIO_DESIGNS_QUERY_KEY)).toBeUndefined();
    client.setQueryData(STUDIO_DESIGNS_QUERY_KEY, [row("a"), row("b")]);
    upsertDesign(client, row("c"));
    upsertDesign(client, row("b", "otro nombre"));
    expect(client.getQueryData<readonly DesignRow[]>(STUDIO_DESIGNS_QUERY_KEY)).toEqual([
      row("c"),
      row("a"),
      row("b", "otro nombre"),
    ]);
  });
});
