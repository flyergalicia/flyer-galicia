import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types.ts";
import { type FailureKind, failureKind } from "./network-status.ts";
import { failure, type Result, success } from "./result.ts";

type Functions = Database["public"]["Functions"];
type KeysOf<Union> = Union extends unknown ? keyof Union : never;
type ValueOf<Union, Key extends PropertyKey> = Union extends unknown
  ? Key extends keyof Union
    ? Exclude<Union[Key], undefined>
    : never
  : never;

/**
 * Exactly the keys the app sends today, all of them present. The types come from the migrations;
 * only the keys in `MayBeNull` admit the null the current app passes.
 */
type Params<
  Name extends keyof Functions,
  Keys extends KeysOf<Functions[Name]["Args"]>,
  MayBeNull extends Keys = never,
> = {
  readonly [Key in Keys]: Key extends MayBeNull
    ? ValueOf<Functions[Name]["Args"], Key>
    : Exclude<ValueOf<Functions[Name]["Args"], Key>, null>;
};

type NoParams = Readonly<Record<string, never>>;

export interface RpcParams {
  asesores_replace: Params<"asesores_replace", "p_rows">;
  colegas_para_suplente: NoParams;
  flyer_diseno_compartir: Params<"flyer_diseno_compartir", "p_id" | "p_para">;
  flyer_diseno_consultar: Params<"flyer_diseno_consultar", "p_id" | "p_texto">;
  flyer_diseno_responder: Params<"flyer_diseno_responder", "p_id" | "p_texto">;
  gestion_marcar_leida: Params<"gestion_marcar_leida", "p_gestion">;
  gestion_marcar_no_leida: Params<"gestion_marcar_no_leida", "p_gestion">;
  gestion_marcar_vista: Params<"gestion_marcar_vista", "p_serie">;
  gestion_mensaje_enviar: Params<"gestion_mensaje_enviar", "p_gestion" | "p_texto">;
  gestion_no_puedo: Params<"gestion_no_puedo", "p_gestion" | "p_motivo", "p_motivo">;
  gestiones_dia: Params<"gestiones_dia", "p_fecha">;
  gestiones_empresas: Params<"gestiones_empresas", "p_limit" | "p_q">;
  gestiones_lista: Params<"gestiones_lista", "p_limit" | "p_solo_mio">;
  gestiones_marcar_todas_leidas: NoParams;
  gestiones_mensajes_nuevos: NoParams;
  gestiones_ocupacion: Params<"gestiones_ocupacion", "p_desde" | "p_hasta">;
  gestiones_ocupado: Params<"gestiones_ocupado", "p_fecha" | "p_hunter">;
  gestiones_personas: NoParams;
  gestiones_tablero: Params<
    "gestiones_tablero",
    | "p_desde"
    | "p_dueno"
    | "p_hasta"
    | "p_hunter"
    | "p_meses"
    | "p_prueba"
    | "p_solo_mio"
    | "p_tipo",
    "p_desde" | "p_dueno" | "p_hasta" | "p_hunter" | "p_meses" | "p_tipo"
  >;
  padron_propuesta_aprobar: Params<
    "padron_propuesta_aprobar",
    "p_comentario" | "p_id",
    "p_comentario"
  >;
  padron_propuesta_consultar: Params<"padron_propuesta_consultar", "p_id" | "p_texto">;
  padron_propuesta_crear: Params<
    "padron_propuesta_crear",
    "p_asesores" | "p_dueno" | "p_empresa" | "p_nota",
    "p_nota"
  >;
  padron_propuesta_rechazar: Params<"padron_propuesta_rechazar", "p_id" | "p_motivo", "p_motivo">;
  padron_propuesta_responder: Params<
    "padron_propuesta_responder",
    "p_asesores" | "p_id" | "p_texto"
  >;
  padron_replace: Params<"padron_replace", "p_rows">;
  padron_suplencia_proponer: Params<
    "padron_suplencia_proponer",
    "p_asesores" | "p_config" | "p_dueno" | "p_empresa" | "p_nota" | "p_rubro",
    "p_config" | "p_nota" | "p_rubro"
  >;
  padron_suplencias: NoParams;
  prueba_cambiar_rol: Params<"prueba_cambiar_rol", "p_role">;
}

export type RpcName = keyof RpcParams;

/** Without keys to send, the second argument does not exist. */
export type RpcArguments<Name extends RpcName> = RpcParams[Name] extends NoParams
  ? []
  : [params: RpcParams[Name]];

export interface RpcFailure {
  readonly kind: FailureKind;
  readonly status: number;
  /** As Postgres sends it. */
  readonly code: string | null;
  /** The text the rules of the database raise, such as `GES_PISA: ...`. */
  readonly message: string;
  readonly details: string | null;
  readonly hint: string | null;
}

export type CallRpc = <Name extends RpcName>(
  name: Name,
  ...args: RpcArguments<Name>
) => Promise<Result<unknown, RpcFailure>>;

interface RpcAnswer {
  readonly data: unknown;
  readonly status: number;
  readonly error: {
    readonly code?: string;
    readonly message: string;
    readonly details?: string | null;
    readonly hint?: string | null;
  } | null;
}

function unknownFailure(cause: unknown): RpcFailure {
  return {
    kind: "transient",
    status: 0,
    code: null,
    message: cause instanceof Error ? cause.message : String(cause),
    details: null,
    hint: null,
  };
}

export function createRpc(client: SupabaseClient<Database>): CallRpc {
  return async (name, ...args) => {
    try {
      const answer: RpcAnswer = await client.rpc(name, args[0] ?? {});
      const { data, error, status } = answer;
      if (!error) return success(data);
      return failure({
        kind: failureKind(status),
        status,
        code: error.code || null,
        message: error.message,
        details: error.details ?? null,
        hint: error.hint ?? null,
      });
    } catch (cause) {
      return failure(unknownFailure(cause));
    }
  };
}
