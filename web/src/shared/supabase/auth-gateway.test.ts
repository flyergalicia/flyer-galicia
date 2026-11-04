import { AuthError } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { AuthListener } from "./auth-gateway.ts";
import { createInventedBackend } from "./testing/invented-backend.ts";
import {
  type Answer,
  INVENTED_USER,
  inventedSession,
  jsonResponse,
} from "./testing/recording-fetch.ts";

function backendAnswering(answer: Answer) {
  return createInventedBackend(answer);
}

const signedInAnswer: Answer = ({ path }) =>
  path.endsWith("/verify") || path.endsWith("/token")
    ? jsonResponse(inventedSession())
    : jsonResponse({ id: "u", aud: "authenticated", role: "authenticated", email: "a@b.c" });

const CREDENTIALS = { email: "ana@bancogalicia.com.ar", password: "secreto123" };

describe("AuthGateway", () => {
  it("signs in with a POST to /auth/v1/token and gives the session", async () => {
    const { backend, network } = backendAnswering(signedInAnswer);

    const result = await backend.auth.signInWithPassword(CREDENTIALS);

    expect(result.ok && result.value.user.email).toBe("ana.inventada@bancogalicia.com.ar");
    const [request] = network.to("/auth/v1/token", "POST");
    expect(request?.query.get("grant_type")).toBe("password");
  });

  it("a wrong password is an answer; a dropped connection is not", async () => {
    const wrong = backendAnswering(() =>
      jsonResponse({ error_code: "invalid_credentials", msg: "Invalid login credentials" }, 400),
    );
    const dropped = backendAnswering(() => {
      throw new TypeError("Failed to fetch");
    });

    await expect(wrong.backend.auth.signInWithPassword(CREDENTIALS)).resolves.toEqual({
      ok: false,
      error: {
        kind: "rejected",
        status: 400,
        code: "invalid_credentials",
        message: "Invalid login credentials",
      },
    });
    const result = await dropped.backend.auth.signInWithPassword(CREDENTIALS);
    expect(!result.ok && result.error.kind).toBe("transient");
  });

  it("a server that is down counts as passing, and too many tries as well", async () => {
    const down = backendAnswering(() => jsonResponse({ msg: "boom" }, 503));
    const tooMany = backendAnswering(() => jsonResponse({ msg: "wait" }, 429));

    const first = await down.backend.auth.signInWithPassword(CREDENTIALS);
    const second = await tooMany.backend.auth.signInWithPassword(CREDENTIALS);

    expect(!first.ok && first.error.kind).toBe("transient");
    expect(!second.ok && second.error).toMatchObject({ kind: "transient", status: 429 });
  });

  it("no saved session is a value, not a failure", async () => {
    const { backend } = backendAnswering(signedInAnswer);

    await expect(backend.auth.getSession()).resolves.toEqual({ ok: true, value: null });
  });

  it("reading the session that breaks ends up as a failure, not as an exception", async () => {
    const { backend } = backendAnswering(signedInAnswer);
    vi.spyOn(backend.db.auth, "getSession").mockRejectedValue(new Error("lock"));

    await expect(backend.auth.getSession()).resolves.toEqual({
      ok: false,
      error: { kind: "transient", status: null, code: null, message: "lock" },
    });
  });

  it("an error that is not an Error still gives a message", async () => {
    const { backend } = backendAnswering(signedInAnswer);
    vi.spyOn(backend.db.auth, "getSession").mockRejectedValue("lock");

    const result = await backend.auth.getSession();

    expect(!result.ok && result.error.message).toBe("lock");
  });

  it("an error of reading the session comes back as such", async () => {
    const { backend } = backendAnswering(signedInAnswer);
    vi.spyOn(backend.db.auth, "getSession").mockResolvedValue({
      data: { session: null },
      error: new AuthError("bad", 500, "unexpected_failure"),
    });

    const result = await backend.auth.getSession();

    expect(!result.ok && result.error).toMatchObject({ kind: "transient", status: 500 });
  });

  it("updates the password with a PUT to /auth/v1/user", async () => {
    const { backend, network } = backendAnswering(signedInAnswer);
    await backend.auth.signInWithPassword(CREDENTIALS);

    const result = await backend.auth.updatePassword("ClaveNueva456");

    expect(result.ok).toBe(true);
    expect(network.to("/auth/v1/user", "PUT")[0]?.body).toMatchObject({
      password: "ClaveNueva456",
    });
  });

  it("a refused password comes back with what the server said", async () => {
    const { backend, network } = backendAnswering(signedInAnswer);
    await backend.auth.signInWithPassword(CREDENTIALS);
    network.answerWith(() => jsonResponse({ error_code: "weak", msg: "Clave débil" }, 422));

    await expect(backend.auth.updatePassword("corta")).resolves.toMatchObject({
      ok: false,
      error: { kind: "rejected", status: 422, message: "Clave débil" },
    });
  });

  it("redeems entrar_como with a POST to /auth/v1/verify", async () => {
    const { backend, network } = backendAnswering(signedInAnswer);

    const result = await backend.auth.verifyOneTimeToken({
      tokenHash: "hash-inventado",
      type: "magiclink",
    });

    expect(result.ok && result.value?.user.id).toBe(INVENTED_USER.id);
    expect(network.to("/auth/v1/verify", "POST")[0]?.body).toMatchObject({
      token_hash: "hash-inventado",
      type: "magiclink",
    });
  });

  it("a one-time permission that does not work is told", async () => {
    const { backend } = backendAnswering(() => jsonResponse({ msg: "expired" }, 403));

    const result = await backend.auth.verifyOneTimeToken({
      tokenHash: "viejo",
      type: "magiclink",
    });

    expect(!result.ok && result.error.kind).toBe("rejected");
  });

  it("signs out with a POST to /auth/v1/logout, globally or only here", async () => {
    const { backend, network } = backendAnswering(({ path }) =>
      path.endsWith("/logout")
        ? new Response(null, { status: 204 })
        : jsonResponse(inventedSession()),
    );
    await backend.auth.signInWithPassword(CREDENTIALS);
    await expect(backend.auth.signOut()).resolves.toEqual({ ok: true, value: undefined });
    await backend.auth.signInWithPassword(CREDENTIALS);
    await backend.auth.signOut("local");

    expect(network.to("/auth/v1/logout", "POST").map(({ query }) => query.get("scope"))).toEqual([
      "global",
      "local",
    ]);
  });

  it("a sign-out that cannot reach the server says so", async () => {
    const { backend, network } = backendAnswering(({ path }) =>
      path.endsWith("/logout")
        ? jsonResponse({ msg: "down" }, 503)
        : jsonResponse(inventedSession()),
    );
    await backend.auth.signInWithPassword(CREDENTIALS);

    const result = await backend.auth.signOut();

    expect(!result.ok && result.error.kind).toBe("transient");
    expect(network.to("/auth/v1/logout")).toHaveLength(1);
  });

  it("everyone listening shares one subscription, and the last to leave closes it", () => {
    const { backend } = backendAnswering(signedInAnswer);
    const unsubscribe = vi.fn<() => void>();
    const callbacks: AuthListener[] = [];
    const subscribe = vi
      .spyOn(backend.db.auth, "onAuthStateChange")
      .mockImplementation((callback) => {
        callbacks.push(callback);
        return { data: { subscription: { id: "s", callback, unsubscribe } } };
      });
    const first = vi.fn<AuthListener>();
    const second = vi.fn<AuthListener>();

    const stopFirst = backend.auth.onAuthStateChange(first);
    const stopSecond = backend.auth.onAuthStateChange(second);
    callbacks[0]?.("SIGNED_IN", null);

    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledWith("SIGNED_IN", null);
    expect(second).toHaveBeenCalledWith("SIGNED_IN", null);

    stopFirst();
    callbacks[0]?.("SIGNED_OUT", null);
    expect(first).not.toHaveBeenCalledWith("SIGNED_OUT", null);
    expect(second).toHaveBeenCalledWith("SIGNED_OUT", null);
    expect(unsubscribe).not.toHaveBeenCalled();

    stopSecond();
    expect(unsubscribe).toHaveBeenCalledTimes(1);

    backend.auth.onAuthStateChange(first)();
    expect(subscribe).toHaveBeenCalledTimes(2);
    expect(unsubscribe).toHaveBeenCalledTimes(2);
  });
});
