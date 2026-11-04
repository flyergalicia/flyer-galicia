import type { AuthGateway } from "./auth-gateway.ts";
import { failure, type Result, success } from "./result.ts";

export const EDGE_TIMEOUT_MS = 25_000;
export const EDGE_TIMEOUT_MESSAGE =
  "Tardó demasiado en responder. Revisá tu conexión y probá de nuevo.";
export const EDGE_NETWORK_MESSAGE = "Error de red";
const EDGE_HTTP_MESSAGE = "Error";

type NoPayload = Readonly<Record<string, never>>;
interface ForAccount {
  readonly uid: string;
}
interface StudioNotice {
  readonly id: string;
  readonly que: string;
}

export interface EdgeActions {
  "auth-admin": {
    approve_reset: ForAccount;
    approve_user: ForAccount;
    create_user: {
      readonly email: string;
      readonly full_name: string;
      readonly password: string;
      readonly role: string;
      readonly status: string;
    };
    cuentas_prueba: NoPayload;
    delete_user: ForAccount;
    deny_reset: ForAccount;
    entrar_como: ForAccount;
    notify_estudio: StudioNotice | (StudioNotice & { readonly flyer: string });
    notify_estudio_pedido: { readonly id: string };
    notify_self_password: NoPayload;
    register: {
      readonly email: string;
      readonly full_name: string;
      readonly password: string;
    };
    request_reset: { readonly email: string; readonly password: string };
    set_password:
      | (ForAccount & {
          readonly password: string;
          readonly enviar_a?: never;
          readonly enviar_nombre?: never;
        })
      | (ForAccount & {
          readonly password: string;
          readonly enviar_a: string;
          readonly enviar_nombre: string;
        });
  };
  "benchmark-sync": {
    bbva: NoPayload;
    galicia: { readonly presupuestoMs: number };
    marcas: { readonly presupuestoMs: number };
    supervielle: NoPayload;
    sync: { readonly banco: string };
  };
  "promos-galicia": {
    detalle: { readonly ids: readonly number[] };
    sync: NoPayload;
    ubicacion: { readonly localidad: string; readonly provincia: string };
  };
}

export type EdgeFunction = keyof EdgeActions;
export type EdgeAction<Fn extends EdgeFunction> = keyof EdgeActions[Fn] & string;

/** Without keys to send, the payload does not exist. */
export type EdgeArguments<
  Fn extends EdgeFunction,
  Action extends EdgeAction<Fn>,
> = EdgeActions[Fn][Action] extends NoPayload ? [] : [payload: EdgeActions[Fn][Action]];

export type EdgeFailure =
  | { readonly kind: "timeout"; readonly message: string }
  | { readonly kind: "network"; readonly message: string }
  /** The function answered, with an error. `data` is what it said. */
  | {
      readonly kind: "http";
      readonly status: number;
      readonly message: string;
      readonly data: unknown;
    };

export type CallEdge = <Fn extends EdgeFunction, Action extends EdgeAction<Fn>>(
  fn: Fn,
  action: Action,
  ...args: EdgeArguments<Fn, Action>
) => Promise<Result<unknown, EdgeFailure>>;

interface EdgeDependencies {
  readonly url: string;
  readonly anonKey: string;
  readonly fetch: typeof fetch;
  readonly auth: Pick<AuthGateway, "getSession">;
}

const CUT = Symbol("cut");

/** Whatever is taking this long, the cut wins: reading the session can hang too. */
function untilCut<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    signal.addEventListener(
      "abort",
      () => {
        reject(CUT);
      },
      { once: true },
    );
    work.then(resolve, reject);
  });
}

async function readBody(response: Response): Promise<{ parsed: boolean; data: unknown }> {
  try {
    return { parsed: true, data: await response.json() };
  } catch (cause) {
    if (cause === CUT) throw cause;
    return { parsed: false, data: null };
  }
}

function httpFailure(status: number, data: unknown): EdgeFailure {
  const said =
    data !== null && typeof data === "object" && "error" in data ? data.error : undefined;
  return {
    kind: "http",
    status,
    message: typeof said === "string" && said ? said : EDGE_HTTP_MESSAGE,
    data,
  };
}

function headersFor(anonKey: string, token: string | null): Record<string, string> {
  return {
    apikey: anonKey,
    "Content-Type": "application/json",
    ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
  };
}

export function createCallEdge({ url, anonKey, fetch: send, auth }: EdgeDependencies): CallEdge {
  return async (fn, action, ...args) => {
    const controller = new AbortController();
    const { signal } = controller;
    const timer = setTimeout(() => {
      controller.abort();
    }, EDGE_TIMEOUT_MS);
    try {
      const session = await untilCut(auth.getSession(), signal);
      if (!session.ok) return failure({ kind: "network", message: EDGE_NETWORK_MESSAGE });
      const response = await untilCut(
        send(`${url}/functions/v1/${fn}`, {
          method: "POST",
          headers: headersFor(anonKey, session.value?.access_token ?? null),
          body: JSON.stringify({ action, ...args[0] }),
          signal,
        }),
        signal,
      );
      const { parsed, data } = await untilCut(readBody(response), signal);
      if (!response.ok || !parsed) return failure(httpFailure(response.status, data));
      return success(data);
    } catch (cause) {
      return failure(
        cause === CUT || signal.aborted
          ? { kind: "timeout", message: EDGE_TIMEOUT_MESSAGE }
          : { kind: "network", message: EDGE_NETWORK_MESSAGE },
      );
    } finally {
      clearTimeout(timer);
    }
  };
}
