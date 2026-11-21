import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EDGE_TIMEOUT_MESSAGE, EDGE_TIMEOUT_MS, type EdgeActions } from "./edge-functions.ts";
import { createInventedBackend, INVENTED_ANON_KEY } from "./testing/invented-backend.ts";
import { inventedSession, jsonResponse } from "./testing/recording-fetch.ts";

afterEach(() => {
  vi.useRealTimers();
});

type Payload<
  Fn extends keyof EdgeActions,
  Action extends keyof EdgeActions[Fn],
> = EdgeActions[Fn][Action];
type KeysOfUnion<Union> = Union extends unknown ? keyof Union : never;

/** Written so that the compiler rejects a function, an action or a key of more or of less. */
const DECLARED: {
  readonly [Fn in keyof EdgeActions]: {
    readonly [Action in keyof EdgeActions[Fn]]: readonly (readonly KeysOfUnion<
      Payload<Fn, Action>
    >[])[];
  };
} = {
  "auth-admin": {
    approve_reset: [["uid"]],
    approve_user: [["uid"]],
    create_user: [["email", "full_name", "password", "role", "status"]],
    cuentas_prueba: [[]],
    delete_user: [["uid"]],
    deny_reset: [["uid"]],
    entrar_como: [["uid"]],
    notify_estudio: [
      ["id", "que"],
      ["flyer", "id", "que"],
    ],
    notify_estudio_pedido: [["id"]],
    notify_self_password: [[]],
    register: [["email", "full_name", "password"]],
    request_reset: [["email", "password"]],
    set_password: [
      ["password", "uid"],
      ["enviar_a", "enviar_nombre", "password", "uid"],
    ],
  },
  "benchmark-sync": {
    bbva: [[]],
    galicia: [["presupuestoMs"]],
    marcas: [["presupuestoMs"]],
    supervielle: [[]],
    sync: [["banco"]],
  },
  "promos-galicia": {
    detalle: [["ids"]],
    sync: [[]],
    ubicacion: [["localidad", "provincia"]],
  },
};

interface FunctionEntry {
  readonly kind: string;
  readonly name: string;
  readonly action: string;
  readonly payload: readonly string[];
}

function signedInBackend() {
  return createInventedBackend(({ path }) =>
    path.startsWith("/auth/") ? jsonResponse(inventedSession()) : jsonResponse({ ok: 1 }),
  );
}

describe("callEdge", () => {
  it("declares exactly the functions, actions and keys of the network contract", () => {
    const entries: readonly FunctionEntry[] = JSON.parse(
      readFileSync("tests/fixtures/network-contract.json", "utf8"),
    );
    const contract = entries.filter(({ kind }) => kind === "function");
    const declared = Object.entries(DECLARED).flatMap(([name, actions]) =>
      Object.entries(actions).flatMap(([action, variants]) =>
        Object.values<readonly string[]>(variants).map((payload) =>
          JSON.stringify([name, action, payload]),
        ),
      ),
    );

    expect(declared.toSorted()).toEqual(
      contract
        .map(({ name, action, payload }) => JSON.stringify([name, action, payload]))
        .toSorted(),
    );
  });

  it("sends {action,...payload} with the public key, and the token only with a session", async () => {
    const { backend, network, url } = signedInBackend();

    const anonymous = await backend.callEdge("auth-admin", "request_reset", {
      email: "ana@bancogalicia.com.ar",
      password: "ClaveNueva123",
    });

    expect(anonymous).toEqual({ ok: true, value: { ok: 1 } });
    const [first] = network.to("/functions/v1/auth-admin", "POST");
    expect(first?.url).toBe(`${url}/functions/v1/auth-admin`);
    expect(first?.body).toEqual({
      action: "request_reset",
      email: "ana@bancogalicia.com.ar",
      password: "ClaveNueva123",
    });
    expect(first?.headers.get("apikey")).toBe(INVENTED_ANON_KEY);
    expect(first?.headers.get("content-type")).toBe("application/json");
    expect(first?.headers.get("authorization")).toBeNull();

    const session = await backend.auth.signInWithPassword({ email: "a@b.c", password: "x" });
    await backend.callEdge("promos-galicia", "sync");

    const [second] = network.to("/functions/v1/promos-galicia", "POST");
    expect(second?.body).toEqual({ action: "sync" });
    expect(session.ok && `Bearer ${session.value.access_token}`).toBe(
      second?.headers.get("authorization"),
    );
  });

  it("the variants of a payload are told apart by the compiler", () => {
    const { backend } = signedInBackend();
    const accepted = (): unknown => [
      backend.callEdge("auth-admin", "notify_estudio", { id: "d", que: "aprobado" }),
      backend.callEdge("auth-admin", "notify_estudio", { id: "d", que: "x", flyer: "Rubros" }),
      backend.callEdge("auth-admin", "set_password", { uid: "u", password: "p" }),
      backend.callEdge("auth-admin", "set_password", {
        uid: "u",
        password: "p",
        enviar_a: "a@b.c",
        enviar_nombre: "Ana",
      }),
    ];
    const refused = (): unknown => [
      // @ts-expect-error not an action of this function
      backend.callEdge("promos-galicia", "register", {}),
      // @ts-expect-error not a function
      backend.callEdge("otra", "sync"),
      // @ts-expect-error `enviar_nombre` goes with `enviar_a`
      backend.callEdge("auth-admin", "set_password", { uid: "u", password: "p", enviar_a: "a" }),
      // @ts-expect-error `uid` is missing
      backend.callEdge("auth-admin", "delete_user", {}),
      // @ts-expect-error this action takes nothing
      backend.callEdge("promos-galicia", "sync", { banco: "x" }),
    ];
    expect([accepted, refused]).toHaveLength(2);
  });

  it("cuts at 25 s with the message of the old app", async () => {
    vi.useFakeTimers();
    const { backend } = createInventedBackend(({ init }) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Promise(() => undefined);
    });
    let settled = false;
    const call = backend.callEdge("promos-galicia", "sync").then((result) => {
      settled = true;
      return result;
    });

    await vi.advanceTimersByTimeAsync(24_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    await expect(call).resolves.toEqual({
      ok: false,
      error: { kind: "timeout", message: EDGE_TIMEOUT_MESSAGE },
    });
    expect(EDGE_TIMEOUT_MESSAGE).toBe(
      "Tardó demasiado en responder. Revisá tu conexión y probá de nuevo.",
    );
  });

  it("the signal is what cuts the request itself", async () => {
    vi.useFakeTimers();
    const signals: (AbortSignal | null | undefined)[] = [];
    const { backend } = createInventedBackend(({ init }) => {
      signals.push(init?.signal);
      return new Promise(() => undefined);
    });

    const call = backend.callEdge("promos-galicia", "sync");
    await vi.advanceTimersByTimeAsync(EDGE_TIMEOUT_MS);
    await call;

    expect(signals[0]?.aborted).toBe(true);
  });

  it("a body that never ends is cut too", async () => {
    vi.useFakeTimers();
    const { backend } = createInventedBackend(
      () =>
        new Response(
          new ReadableStream({
            start: () => undefined,
          }),
        ),
    );

    const call = backend.callEdge("promos-galicia", "sync");
    await vi.advanceTimersByTimeAsync(EDGE_TIMEOUT_MS);

    await expect(call).resolves.toMatchObject({ ok: false, error: { kind: "timeout" } });
  });

  it("does not leave the timer running after an answer", async () => {
    vi.useFakeTimers();
    const { backend } = signedInBackend();
    await backend.auth.getSession();
    const timers = vi.getTimerCount();

    await backend.callEdge("promos-galicia", "sync");

    expect(vi.getTimerCount()).toBe(timers);
  });

  it("if reading the session hangs, it is cut as well", async () => {
    vi.useFakeTimers();
    const { backend, network } = signedInBackend();
    vi.spyOn(backend.auth, "getSession").mockReturnValue(new Promise(() => undefined));

    const call = backend.callEdge("promos-galicia", "sync");
    await vi.advanceTimersByTimeAsync(EDGE_TIMEOUT_MS);

    await expect(call).resolves.toMatchObject({ ok: false, error: { kind: "timeout" } });
    expect(network.requests).toEqual([]);
  });

  it("if reading the session fails, it answers with an error instead of hanging", async () => {
    const { backend, network } = signedInBackend();
    vi.spyOn(backend.db.auth, "getSession").mockRejectedValue(new Error("lock"));

    await expect(backend.callEdge("promos-galicia", "sync")).resolves.toEqual({
      ok: false,
      error: { kind: "network", message: "Error de red" },
    });
    expect(network.requests).toEqual([]);
  });

  it("a dropped connection is `network`", async () => {
    const { backend } = createInventedBackend(() => {
      throw new TypeError("Failed to fetch");
    });

    await expect(backend.callEdge("promos-galicia", "sync")).resolves.toEqual({
      ok: false,
      error: { kind: "network", message: "Error de red" },
    });
  });

  it("an error of the function is `http`, with what it said", async () => {
    const { backend } = createInventedBackend(() =>
      jsonResponse({ error: "Demasiados pedidos seguidos" }, 429),
    );

    await expect(
      backend.callEdge("auth-admin", "request_reset", { email: "a", password: "b" }),
    ).resolves.toEqual({
      ok: false,
      error: {
        kind: "http",
        status: 429,
        message: "Demasiados pedidos seguidos",
        data: { error: "Demasiados pedidos seguidos" },
      },
    });
  });

  it.each([
    ["no error text", () => jsonResponse({ detail: "x" }, 500)],
    ["an empty one", () => jsonResponse({ error: "" }, 500)],
    ["a list", () => jsonResponse([], 500)],
    ["no JSON", () => new Response("<html>Bad gateway</html>", { status: 502 })],
  ])("an answer with %s still is `http`", async (_what, answer) => {
    const { backend } = createInventedBackend(answer);

    const result = await backend.callEdge("promos-galicia", "sync");

    expect(!result.ok && result.error).toMatchObject({ kind: "http", message: "Error" });
  });

  it("a good status with a body that is not JSON is not a result", async () => {
    const { backend } = createInventedBackend(() => new Response("hola", { status: 200 }));

    const result = await backend.callEdge("promos-galicia", "sync");

    expect(!result.ok && result.error).toMatchObject({ kind: "http", status: 200, data: null });
  });
});
