import { readFileSync } from "node:fs";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import type { Database } from "./database.types.ts";
import type { RpcName, RpcParams } from "./rpc.ts";
import { createInventedBackend } from "./testing/invented-backend.ts";
import { jsonResponse } from "./testing/recording-fetch.ts";

interface RpcEntry {
  readonly kind: string;
  readonly name: string;
  readonly params: readonly string[];
}

/** Every key of every RPC, written so that the compiler rejects one of more or one of less. */
const DECLARED: {
  readonly [Name in RpcName]: { readonly [Key in keyof RpcParams[Name]]-?: true };
} = {
  asesores_replace: { p_rows: true },
  colegas_para_suplente: {},
  flyer_diseno_compartir: { p_id: true, p_para: true },
  flyer_diseno_consultar: { p_id: true, p_texto: true },
  flyer_diseno_responder: { p_id: true, p_texto: true },
  gestion_marcar_leida: { p_gestion: true },
  gestion_marcar_no_leida: { p_gestion: true },
  gestion_marcar_vista: { p_serie: true },
  gestion_mensaje_enviar: { p_gestion: true, p_texto: true },
  gestion_no_puedo: { p_gestion: true, p_motivo: true },
  gestiones_dia: { p_fecha: true },
  gestiones_empresas: { p_limit: true, p_q: true },
  gestiones_lista: { p_limit: true, p_solo_mio: true },
  gestiones_marcar_todas_leidas: {},
  gestiones_mensajes_nuevos: {},
  gestiones_ocupacion: { p_desde: true, p_hasta: true },
  gestiones_ocupado: { p_fecha: true, p_hunter: true },
  gestiones_personas: {},
  gestiones_tablero: {
    p_desde: true,
    p_dueno: true,
    p_hasta: true,
    p_hunter: true,
    p_meses: true,
    p_prueba: true,
    p_solo_mio: true,
    p_tipo: true,
  },
  padron_propuesta_aprobar: { p_comentario: true, p_id: true },
  padron_propuesta_consultar: { p_id: true, p_texto: true },
  padron_propuesta_crear: { p_asesores: true, p_dueno: true, p_empresa: true, p_nota: true },
  padron_propuesta_rechazar: { p_id: true, p_motivo: true },
  padron_propuesta_responder: { p_asesores: true, p_id: true, p_texto: true },
  padron_replace: { p_rows: true },
  padron_suplencia_proponer: {
    p_asesores: true,
    p_config: true,
    p_dueno: true,
    p_empresa: true,
    p_nota: true,
    p_rubro: true,
  },
  padron_suplencias: {},
  prueba_cambiar_rol: { p_role: true },
};

function contractRpcs(): RpcEntry[] {
  const contract: readonly RpcEntry[] = JSON.parse(
    readFileSync("tests/fixtures/network-contract.json", "utf8"),
  );
  return contract.filter(({ kind }) => kind === "rpc");
}

describe("rpc", () => {
  it("declares exactly the functions and keys of the network contract", () => {
    const contract = Object.fromEntries(
      contractRpcs().map(({ name, params }) => [name, [...params].toSorted()]),
    );
    const declared = Object.fromEntries(
      Object.entries(DECLARED).map(([name, keys]) => [name, Object.keys(keys).toSorted()]),
    );

    expect(declared).toEqual(contract);
  });

  it("its params are what the function of the database takes", () => {
    type Functions = Database["public"]["Functions"];
    expectTypeOf<RpcParams["gestiones_ocupado"]>().toExtend<
      Functions["gestiones_ocupado"]["Args"]
    >();
    expectTypeOf<RpcParams["gestiones_tablero"]>().toExtend<
      Functions["gestiones_tablero"]["Args"]
    >();
    expectTypeOf<RpcParams["padron_replace"]>().toExtend<Functions["padron_replace"]["Args"]>();
  });

  it("posts the params with the exact keys and gives back the answer", async () => {
    const { backend, network } = createInventedBackend(() => jsonResponse([{ id: 1 }]));

    const result = await backend.rpc("gestiones_ocupado", {
      p_hunter: "h-1",
      p_fecha: "2026-11-04",
    });

    expect(result).toEqual({ ok: true, value: [{ id: 1 }] });
    const [request] = network.to("/rest/v1/rpc/gestiones_ocupado", "POST");
    expect(request?.body).toEqual({ p_hunter: "h-1", p_fecha: "2026-11-04" });
  });

  it("without params there is nothing to pass", async () => {
    const { backend, network } = createInventedBackend(() => jsonResponse([]));

    const result = await backend.rpc("gestiones_personas");

    expect(result).toEqual({ ok: true, value: [] });
    expect(network.to("/rest/v1/rpc/gestiones_personas")[0]?.body).toEqual({});
  });

  it("the compiler refuses a name or keys that are not in the contract", () => {
    const { backend } = createInventedBackend(() => jsonResponse([]));
    const refused = (): unknown => [
      // @ts-expect-error not a function of the contract
      backend.rpc("no_existe"),
      // @ts-expect-error p_hunter is missing
      backend.rpc("gestiones_ocupado", { p_fecha: "2026-11-04" }),
      // @ts-expect-error a key of more
      backend.rpc("gestiones_dia", { p_fecha: "2026-11-04", p_hunter: "h" }),
      // @ts-expect-error this one does not take a null
      backend.rpc("gestiones_dia", { p_fecha: null }),
      // @ts-expect-error this one takes nothing
      backend.rpc("gestiones_personas", { p_q: "x" }),
    ];
    expect(refused).toBeTypeOf("function");
  });

  it("a rule of the database reaches the caller with its code and message", async () => {
    const { backend } = createInventedBackend(() =>
      jsonResponse(
        {
          code: "P0001",
          message: "GES_PISA: ese hunter ya tiene algo de 10:00 a 12:00 ese día",
          details: null,
          hint: "cambiá el horario",
        },
        400,
      ),
    );

    const result = await backend.rpc("gestiones_dia", { p_fecha: "2026-11-04" });

    expect(result).toEqual({
      ok: false,
      error: {
        kind: "rejected",
        status: 400,
        code: "P0001",
        message: "GES_PISA: ese hunter ya tiene algo de 10:00 a 12:00 ese día",
        details: null,
        hint: "cambiá el horario",
      },
    });
  });

  it("a dropped connection is not an empty answer", async () => {
    const { backend } = createInventedBackend(() => {
      throw new TypeError("Failed to fetch");
    });

    const result = await backend.rpc("gestiones_personas");

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatchObject({ kind: "transient", status: 0 });
  });

  it("a server that is down is passing too", async () => {
    const { backend } = createInventedBackend(() => jsonResponse({ message: "boom" }, 503));

    const result = await backend.rpc("gestiones_personas");

    expect(!result.ok && result.error).toMatchObject({
      kind: "transient",
      status: 503,
      code: null,
      details: null,
      hint: null,
    });
  });

  it("a client that breaks ends up as a failure too", async () => {
    const { backend } = createInventedBackend(() => jsonResponse([]));
    const broken = vi.spyOn(backend.db, "rpc");

    broken.mockImplementationOnce(() => {
      throw new Error("roto");
    });
    await expect(backend.rpc("gestiones_personas")).resolves.toMatchObject({
      ok: false,
      error: { kind: "transient", message: "roto" },
    });

    // Not an Error on purpose.
    broken.mockImplementationOnce(() => {
      throw "roto";
    });
    await expect(backend.rpc("gestiones_personas")).resolves.toMatchObject({
      ok: false,
      error: { message: "roto" },
    });
  });
});
