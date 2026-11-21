import { type ReactNode, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import type { AuthChangeEvent, AuthListener } from "@/shared/supabase/index.ts";
import { deferred, jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import { ShowsError } from "@/shared/supabase/testing/ShowsError.tsx";
import {
  type PermissionsValue,
  type SessionActions,
  type SessionValue,
  useCan,
  usePermissions,
  useSession,
  useSessionActions,
} from "./index.ts";
import { SLOW_AFTER_MS } from "./session-machine.ts";
import { ACTIVE_PROFILE, type CloudAnswers, createSessionHarness } from "./test-support.ts";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const CONTRACT_COLUMNS =
  "role,full_name,nombre_asesor,celular_asesor,email_asesor,status,facultades,es_prueba,lider_id,flyer_fav";

interface Seen {
  session: SessionValue | null;
  actions: SessionActions | null;
  permissions: PermissionsValue | null;
}

function Probe({ seen }: { readonly seen: Seen }): ReactNode {
  const session = useSession();
  const actions = useSessionActions();
  const permissions = usePermissions();
  const canTakeNotes = useCan("notas");
  useEffect(() => {
    Object.assign(seen, { session, actions, permissions });
  });
  return (
    <>
      <output data-testid="status">{session.status}</output>
      <output data-testid="slow">{"slow" in session && session.slow ? "slow" : "quick"}</output>
      <output data-testid="notes">{canTakeNotes ? "with notes" : "without notes"}</output>
      <output data-testid="load">{permissions.loadStatus}</output>
      <output data-testid="recovery">{session.passwordRecovery ? "recovery" : "normal"}</output>
    </>
  );
}

async function open(
  answers: CloudAnswers = {},
  options: { signedIn?: boolean; strict?: boolean } = {},
) {
  const harness = createSessionHarness(answers);
  if (options.signedIn ?? true) harness.storeSession();
  const seen: Seen = { session: null, actions: null, permissions: null };
  const screen = await render(
    harness.wrap(<Probe seen={seen} />, options.strict ? { strict: true } : {}),
  );
  const status = screen.getByTestId("status");
  return { harness, seen, screen, status };
}

function readsOfProfile(harness: { network: Harness["network"] }) {
  return harness.network.to("/rest/v1/profiles", "GET");
}

type Harness = ReturnType<typeof createSessionHarness>;

/** How the session hears of events, to fire them from the test. */
function captureEvents(harness: Harness): (event: AuthChangeEvent) => void {
  const listeners: AuthListener[] = [];
  vi.spyOn(harness.backend.auth, "onAuthStateChange").mockImplementation((listener) => {
    listeners.push(listener);
    return () => undefined;
  });
  return (event) => {
    for (const listener of listeners) listener(event, null);
  };
}

/** supabase-js repeats a read by itself; this lets it reach `reads` of them and give up. */
async function letReadsHappen(harness: Harness, reads: number, read = 1): Promise<void> {
  await vi.waitFor(() => {
    expect(readsOfProfile(harness).length).toBeGreaterThanOrEqual(read);
  });
  await vi.advanceTimersByTimeAsync(read < reads ? 4100 : 1);
  if (read < reads) await letReadsHappen(harness, reads, read + 1);
}

function savedFile(roles: unknown) {
  return () => jsonResponse({ roles, updated_at: "x" });
}

function required<T>(value: T | null): T {
  if (value === null) throw new Error("the probe has not rendered yet");
  return value;
}

const droppedConnection = (): never => {
  throw new TypeError("Failed to fetch");
};
/** A passing failure that postgrest-js does not repeat on its own, as it does with the others. */
const serverBusy = () => jsonResponse({ message: "wait" }, 429);

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

describe("entering", () => {
  it("with no saved session, it is signed out and reads nothing", async () => {
    const { status, harness } = await open({}, { signedIn: false });

    await expect.element(status).toHaveTextContent("signed-out");
    expect(readsOfProfile(harness)).toEqual([]);
    expect(harness.entryWrites()).toEqual([]);
  });

  it("with a saved session, it says it is loading until the profile arrives", async () => {
    const answer = deferred<Response>();
    const { status } = await open({ profile: () => answer.promise });

    await expect.element(status).toHaveTextContent("loading");

    answer.resolve(jsonResponse(ACTIVE_PROFILE));
    await expect.element(status).toHaveTextContent("signed-in");
  });

  it("reads the profile with the columns of the contract, as one row", async () => {
    const { status, harness } = await open();

    await expect.element(status).toHaveTextContent("signed-in");
    const [read] = readsOfProfile(harness);
    expect(read?.query.get("select")).toBe(CONTRACT_COLUMNS);
    expect(read?.query.get("id")).toBe(`eq.${USER_ID}`);
    expect(read?.headers.get("accept")).toContain("vnd.pgrst.object");
  });

  it("gives who entered", async () => {
    const { status, seen } = await open({
      profile: { ...ACTIVE_PROFILE, role: "vip", full_name: "" },
    });

    await expect.element(status).toHaveTextContent("signed-in");
    expect(seen.session).toMatchObject({
      status: "signed-in",
      role: "vip",
      isAdmin: false,
      displayName: "ana.inventada@bancogalicia.com.ar",
      user: { id: USER_ID },
      profile: { es_prueba: false },
    });
  });

  it("a profile with no role counts as an asesor, and with no names, the mail is the name", async () => {
    const { status, seen } = await open({
      profile: { ...ACTIVE_PROFILE, role: null, full_name: null, email_asesor: null },
    });

    await expect.element(status).toHaveTextContent("signed-in");
    expect(seen.session).toMatchObject({
      role: "asesor",
      displayName: "ana.inventada@bancogalicia.com.ar",
    });
  });

  it("a pending change of password does not lock the account", async () => {
    const { status, harness } = await open({
      profile: { ...ACTIVE_PROFILE, status: "reset_pending" },
    });

    await expect.element(status).toHaveTextContent("signed-in");
    expect(harness.logouts()).toEqual([]);
  });
});

describe("the write of each entry", () => {
  it("under StrictMode, one PATCH with last_login and nothing else", async () => {
    const { status, harness } = await open({}, { strict: true });

    await expect.element(status).toHaveTextContent("signed-in");
    await vi.waitFor(() => {
      expect(harness.entryWrites()).toHaveLength(1);
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });

    const writes = harness.entryWrites();
    expect(writes).toHaveLength(1);
    expect(writes[0]?.query.get("id")).toBe(`eq.${USER_ID}`);
    expect(writes[0]?.body).toEqual({ last_login: expect.any(String) });
  });

  it("a profile with no mail of its own takes the one of the account", async () => {
    const { harness } = await open({ profile: { ...ACTIVE_PROFILE, email_asesor: null } });

    await vi.waitFor(() => {
      expect(harness.entryWrites()[0]?.body).toMatchObject({
        last_login: expect.any(String),
        email_asesor: "ana.inventada@bancogalicia.com.ar",
      });
    });
  });

  it("an administrator with no mail of their own does not take it", async () => {
    const { harness } = await open({
      profile: { ...ACTIVE_PROFILE, role: "admin", email_asesor: null },
    });

    await vi.waitFor(() => {
      expect(harness.entryWrites()).toHaveLength(1);
    });
    expect(harness.entryWrites()[0]?.body).toEqual({ last_login: expect.any(String) });
  });

  it("reading the profile again does not count as entering", async () => {
    const { status, harness, seen } = await open();
    await expect.element(status).toHaveTextContent("signed-in");
    await vi.waitFor(() => {
      expect(harness.entryWrites()).toHaveLength(1);
    });

    required(seen.actions).refreshProfile();

    await vi.waitFor(() => {
      expect(readsOfProfile(harness)).toHaveLength(2);
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    expect(harness.entryWrites()).toHaveLength(1);
  });

  it("a retry that succeeds counts once, and going out and in again counts again", async () => {
    let isDown = true;
    const { status, harness, seen } = await open({
      profile: () => (isDown ? serverBusy() : jsonResponse(ACTIVE_PROFILE)),
    });
    await expect.element(status).toHaveTextContent("unreachable");
    isDown = false;

    required(seen.actions).retry();
    await expect.element(status).toHaveTextContent("signed-in");
    await vi.waitFor(() => {
      expect(harness.entryWrites()).toHaveLength(1);
    });

    await required(seen.actions).signOut();
    await expect.element(status).toHaveTextContent("signed-out");
    await required(seen.actions).signIn({ email: "a@b.c", password: "x" });
    await expect.element(status).toHaveTextContent("signed-in");

    await vi.waitFor(() => {
      expect(harness.entryWrites()).toHaveLength(2);
    });
  });

  it("a write that fails does not take the person out", async () => {
    const { status, harness } = await open();
    harness.network.answerWith(({ path, method }) =>
      path === "/rest/v1/profiles" && method === "PATCH"
        ? droppedConnection()
        : jsonResponse(ACTIVE_PROFILE),
    );

    await expect.element(status).toHaveTextContent("signed-in");
    await vi.waitFor(() => {
      expect(harness.entryWrites()).toHaveLength(1);
    });
    await expect.element(status).toHaveTextContent("signed-in");
  });
});

describe("a passing failure while reading the profile", () => {
  // supabase-js repeats by itself a read that gets no answer or a 503: four, over 7 seconds.
  it.each([
    ["no answer", droppedConnection, 4],
    ["a server down", () => jsonResponse({ message: "boom" }, 503), 4],
    ["too many requests", serverBusy, 1],
    ["time out", () => jsonResponse({ message: "slow" }, 408), 1],
  ])("%s keeps the session open and offers to retry", async (_what, profile, reads) => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { status, harness, seen } = await open({ profile }, { strict: true });
    await letReadsHappen(harness, reads);

    await expect.element(status).toHaveTextContent("unreachable");
    await vi.waitFor(() => {
      expect(seen.session).toMatchObject({
        status: "unreachable",
        slow: false,
        user: { id: USER_ID },
      });
    });
    expect(harness.logouts()).toEqual([]);
    expect(harness.storedSession()).not.toBeNull();
    expect(harness.entryWrites()).toEqual([]);
  });

  it("retrying reads the profile again with the same session and enters", async () => {
    let isDown = true;
    const { status, harness, seen } = await open({
      profile: () => (isDown ? serverBusy() : jsonResponse(ACTIVE_PROFILE)),
    });
    await expect.element(status).toHaveTextContent("unreachable");
    isDown = false;

    required(seen.actions).retry();

    await expect.element(status).toHaveTextContent("signed-in");
    expect(readsOfProfile(harness)).toHaveLength(2);
    expect(harness.network.to("/auth/v1/token")).toEqual([]);
  });

  it("retrying when the session expired in the meantime goes to the form", async () => {
    const { status, harness, seen } = await open({ profile: serverBusy });
    await expect.element(status).toHaveTextContent("unreachable");
    localStorage.removeItem(harness.storageKey);
    vi.spyOn(harness.backend.auth, "getSession").mockResolvedValue({ ok: true, value: null });

    required(seen.actions).retry();

    await expect.element(status).toHaveTextContent("signed-out");
  });

  it("retrying when the session cannot be read keeps offering to retry", async () => {
    const { status, harness, seen } = await open({ profile: serverBusy });
    await expect.element(status).toHaveTextContent("unreachable");
    vi.spyOn(harness.backend.auth, "getSession").mockResolvedValue({
      ok: false,
      error: { kind: "transient", status: null, code: null, message: "lock" },
    });

    required(seen.actions).retry();

    await expect.element(status).toHaveTextContent("unreachable");
    expect(seen.session).toMatchObject({
      status: "unreachable",
      slow: false,
      user: { id: USER_ID },
    });
    expect(harness.logouts()).toEqual([]);
  });

  it("another account leaves this browser without the session, even with no network", async () => {
    const { status, harness, seen } = await open({ profile: serverBusy });
    await expect.element(status).toHaveTextContent("unreachable");
    harness.network.answerWith(droppedConnection);

    await required(seen.actions).continueWithAnotherAccount();

    await expect.element(status).toHaveTextContent("signed-out");
    expect(harness.logouts()[0]?.query.get("scope")).toBe("local");
    expect(harness.storedSession()).toBeNull();
  });
});

describe("no answer for 10 seconds", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  it("the profile that does not answer stops being a loading state, and the session stays", async () => {
    const answer = deferred<Response>();
    const { status, harness, screen, seen } = await open({ profile: () => answer.promise });
    await vi.waitFor(() => {
      expect(readsOfProfile(harness)).toHaveLength(1);
    });
    // vi.waitFor moves fake timers a little on its own, hence the margin.
    await vi.advanceTimersByTimeAsync(SLOW_AFTER_MS - 1000);
    await expect.element(status).toHaveTextContent("loading");

    await vi.advanceTimersByTimeAsync(1000);

    await expect.element(status).toHaveTextContent("unreachable");
    await expect.element(screen.getByTestId("slow")).toHaveTextContent("slow");
    expect(seen.session).toMatchObject({ user: { id: USER_ID } });
    expect(harness.logouts()).toEqual([]);

    answer.resolve(jsonResponse(ACTIVE_PROFILE));
    await vi.advanceTimersByTimeAsync(1);
    await expect.element(status).toHaveTextContent("signed-in");
  });

  it("if reading the saved session does not answer, the form shows, and it can still enter", async () => {
    const harness = createSessionHarness();
    const session = deferred<{ ok: true; value: null }>();
    vi.spyOn(harness.backend.auth, "getSession").mockReturnValue(session.promise);
    const seen: Seen = { session: null, actions: null, permissions: null };
    const screen = await render(harness.wrap(<Probe seen={seen} />));
    const status = screen.getByTestId("status");
    await expect.element(status).toHaveTextContent("loading");

    await vi.advanceTimersByTimeAsync(SLOW_AFTER_MS);

    await expect.element(status).toHaveTextContent("signed-out");

    session.resolve({ ok: true, value: null });
    await vi.advanceTimersByTimeAsync(1);
    await expect.element(status).toHaveTextContent("signed-out");
  });

  it("the session that was read late still enters from the form", async () => {
    const harness = createSessionHarness();
    harness.storeSession();
    const { getSession } = harness.backend.auth;
    const held = deferred<null>();
    vi.spyOn(harness.backend.auth, "getSession").mockImplementationOnce(async () => {
      await held.promise;
      return getSession();
    });
    const seen: Seen = { session: null, actions: null, permissions: null };
    const screen = await render(harness.wrap(<Probe seen={seen} />));
    const status = screen.getByTestId("status");

    await vi.advanceTimersByTimeAsync(SLOW_AFTER_MS);
    await expect.element(status).toHaveTextContent("signed-out");

    held.resolve(null);

    await expect.element(status).toHaveTextContent("signed-in");
  });

  it("a retry whose session read does not answer brings the card back, not an eternal wait", async () => {
    const { status, harness, seen, screen } = await open({ profile: serverBusy });
    await expect.element(status).toHaveTextContent("unreachable");
    vi.spyOn(harness.backend.auth, "getSession").mockReturnValue(new Promise(() => undefined));

    required(seen.actions).retry();
    await expect.element(status).toHaveTextContent("loading");
    await vi.advanceTimersByTimeAsync(SLOW_AFTER_MS);

    await expect.element(status).toHaveTextContent("unreachable");
    await expect.element(screen.getByTestId("slow")).toHaveTextContent("slow");
    expect(seen.session).toMatchObject({ user: { id: USER_ID } });
  });

  it("an answer after pressing retry does not depend on the earlier try", async () => {
    let answers = 0;
    const pending: ((response: Response) => void)[] = [];
    const { status, seen, harness } = await open({
      profile: () =>
        new Promise<Response>((resolve) => {
          answers += 1;
          pending.push(resolve);
        }),
    });
    await vi.waitFor(() => {
      expect(answers).toBe(1);
    });
    await vi.advanceTimersByTimeAsync(SLOW_AFTER_MS);
    await expect.element(status).toHaveTextContent("unreachable");

    required(seen.actions).retry();
    await vi.waitFor(() => {
      expect(answers).toBe(2);
    });

    pending[0]?.(jsonResponse({ ...ACTIVE_PROFILE, status: "inactive" }));
    await vi.advanceTimersByTimeAsync(1);
    await expect.element(status).toHaveTextContent("loading");
    expect(harness.logouts()).toEqual([]);

    pending[1]?.(jsonResponse(ACTIVE_PROFILE));
    await vi.advanceTimersByTimeAsync(1);
    await expect.element(status).toHaveTextContent("signed-in");
  });
});

describe("a real answer closes the session", () => {
  const rejections = [
    [
      "a profile that does not exist",
      () => jsonResponse({ code: "PGRST116", message: "0 rows" }, 406),
      "not-enabled",
      "Tu cuenta no está habilitada. Contactá al administrador.",
    ],
    [
      "any other refusal",
      () => jsonResponse({ code: "42501", message: "denied" }, 403),
      "unverifiable",
      "No se pudo verificar tu cuenta. Volvé a ingresar.",
    ],
    [
      "an account waiting for approval",
      { ...ACTIVE_PROFILE, status: "pending" },
      "pending",
      "Tu cuenta está pendiente de aprobación del administrador.",
    ],
    [
      "an inactive account",
      { ...ACTIVE_PROFILE, status: "inactive" },
      "inactive",
      "Cuenta inactiva. Contactá al administrador.",
    ],
    [
      "a status nobody knows",
      { ...ACTIVE_PROFILE, status: "otro" },
      "inactive",
      "Cuenta inactiva. Contactá al administrador.",
    ],
  ] as const;

  it.each(rejections)("%s", async (_what, profile, reason, message) => {
    const { status, harness, seen } = await open({ profile }, { strict: true });

    await expect.element(status).toHaveTextContent("rejected");
    expect(seen.session).toMatchObject({ reason, message });
    await vi.waitFor(() => {
      expect(harness.storedSession()).toBeNull();
    });
    expect(harness.logouts()).toHaveLength(1);
    expect(harness.entryWrites()).toEqual([]);
    await expect.element(status).toHaveTextContent("rejected");
  });

  it("after being rejected, it can enter again with another account", async () => {
    let profile: Record<string, unknown> = { ...ACTIVE_PROFILE, status: "pending" };
    const { status, seen } = await open({ profile: () => jsonResponse(profile) });
    await expect.element(status).toHaveTextContent("rejected");
    profile = ACTIVE_PROFILE;

    await required(seen.actions).signIn({ email: "otra@b.c", password: "x" });

    await expect.element(status).toHaveTextContent("signed-in");
  });
});

describe("events of the session", () => {
  it("has a single listener, cleaned up, also under StrictMode", async () => {
    const harness = createSessionHarness();
    const subscribe = vi.spyOn(harness.backend.auth, "onAuthStateChange");
    const stops: ReturnType<typeof vi.fn<() => void>>[] = [];
    subscribe.mockImplementation(() => {
      const stop = vi.fn<() => void>();
      stops.push(stop);
      return stop;
    });
    const seen: Seen = { session: null, actions: null, permissions: null };

    const screen = await render(harness.wrap(<Probe seen={seen} />, { strict: true }));
    await expect.element(screen.getByTestId("status")).toHaveTextContent("signed-out");

    const active = stops.filter((stop) => stop.mock.calls.length === 0);
    expect(active).toHaveLength(1);

    await screen.unmount();
    expect(stops.every((stop) => stop.mock.calls.length === 1)).toBe(true);
  });

  it("a session closed elsewhere moves to signed-out and forgets what it read", async () => {
    const { status, harness } = await open();
    await expect.element(status).toHaveTextContent("signed-in");
    expect(harness.queryClient.getQueryCache().getAll().length).toBeGreaterThan(0);

    await harness.backend.db.auth.signOut({ scope: "local" });

    await expect.element(status).toHaveTextContent("signed-out");
    await vi.waitFor(() => {
      expect(
        harness.queryClient
          .getQueryCache()
          .getAll()
          .filter(({ state }) => state.data !== undefined),
      ).toEqual([]);
    });
  });

  it("the mail link for a new password is exposed for the auth slice", async () => {
    const harness = createSessionHarness();
    const fire = captureEvents(harness);
    const seen: Seen = { session: null, actions: null, permissions: null };
    const screen = await render(harness.wrap(<Probe seen={seen} />));
    const recovery = screen.getByTestId("recovery");
    await expect.element(recovery).toHaveTextContent("normal");

    fire("PASSWORD_RECOVERY");
    await expect.element(recovery).toHaveTextContent("recovery");

    required(seen.actions).dismissPasswordRecovery();
    await expect.element(recovery).toHaveTextContent("normal");
  });

  it("the other events change nothing, such as a refresh of the token", async () => {
    const harness = createSessionHarness();
    harness.storeSession();
    const fire = captureEvents(harness);
    const seen: Seen = { session: null, actions: null, permissions: null };
    const screen = await render(harness.wrap(<Probe seen={seen} />));
    await expect.element(screen.getByTestId("status")).toHaveTextContent("signed-in");

    fire("TOKEN_REFRESHED");
    fire("SIGNED_IN");

    await expect.element(screen.getByTestId("status")).toHaveTextContent("signed-in");
    expect(readsOfProfile(harness)).toHaveLength(1);
  });
});

describe("the actions", () => {
  it("signing in with a wrong password says so and stays out", async () => {
    const { status, harness, seen } = await open({}, { signedIn: false });
    await expect.element(status).toHaveTextContent("signed-out");
    harness.network.answerWith(() =>
      jsonResponse({ error_code: "invalid_credentials", msg: "Invalid" }, 400),
    );

    const result = await required(seen.actions).signIn({ email: "a@b.c", password: "x" });

    expect(!result.ok && result.error.kind).toBe("rejected");
    await expect.element(status).toHaveTextContent("signed-out");
  });

  it("signing in enters", async () => {
    const { status, seen, harness } = await open({}, { signedIn: false });
    await expect.element(status).toHaveTextContent("signed-out");

    await required(seen.actions).signIn({ email: "a@b.c", password: "x" });

    await expect.element(status).toHaveTextContent("signed-in");
    expect(harness.storedSession()).not.toBeNull();
  });

  it("a sign-out that fails without closing the session says so and stays", async () => {
    const { status, harness, seen } = await open();
    await expect.element(status).toHaveTextContent("signed-in");
    vi.spyOn(harness.backend.auth, "signOut").mockResolvedValue({
      ok: false,
      error: { kind: "transient", status: null, code: null, message: "lock" },
    });

    const result = await required(seen.actions).signOut();

    expect(result.ok).toBe(false);
    await expect.element(status).toHaveTextContent("signed-in");
  });

  it("changes to another test account with its one-time permission", async () => {
    const { status, seen, harness } = await open();
    await expect.element(status).toHaveTextContent("signed-in");

    let result;
    result = await required(seen.actions).redeemAccountSwitch("hash-inventado");

    expect(result).toEqual({ ok: true, value: undefined });
    expect(harness.network.to("/auth/v1/verify")[0]?.body).toMatchObject({
      token_hash: "hash-inventado",
      type: "magiclink",
    });
    await expect.element(status).toHaveTextContent("signed-in");
    await vi.waitFor(() => {
      expect(harness.entryWrites()).toHaveLength(2);
    });
  });

  it("a one-time permission that does not work leaves everything as it was", async () => {
    const { status, seen, harness } = await open();
    await expect.element(status).toHaveTextContent("signed-in");
    harness.network.answerWith(() => jsonResponse({ msg: "expired" }, 403));

    const result = await required(seen.actions).redeemAccountSwitch("viejo");

    expect(!result.ok && result.error.kind).toBe("rejected");
    await expect.element(status).toHaveTextContent("signed-in");
  });

  it("a one-time permission that gives no session changes nothing", async () => {
    const { status, seen, harness } = await open();
    await expect.element(status).toHaveTextContent("signed-in");
    vi.spyOn(harness.backend.auth, "verifyOneTimeToken").mockResolvedValue({
      ok: true,
      value: null,
    });

    const result = await required(seen.actions).redeemAccountSwitch("hash");

    expect(result.ok).toBe(true);
    await expect.element(status).toHaveTextContent("signed-in");
    expect(readsOfProfile(harness)).toHaveLength(1);
  });
});

describe("permissions", () => {
  it("before entering, nobody can do anything", async () => {
    const { status, seen, screen } = await open({}, { signedIn: false });
    await expect.element(status).toHaveTextContent("signed-out");

    await expect.element(screen.getByTestId("notes")).toHaveTextContent("without notes");
    expect(seen.permissions).toMatchObject({
      isAdminNow: false,
      effectiveRole: null,
      isHunter: false,
      isLeader: false,
      simulatedRole: null,
      loadStatus: "loading",
    });
  });

  it("the saved ones are read from the bucket, once", async () => {
    const { screen, harness, seen } = await open(
      { permissions: savedFile({ asesor: { notas: true } }) },
      { strict: true },
    );

    await expect.element(screen.getByTestId("notes")).toHaveTextContent("with notes");
    await expect.element(screen.getByTestId("load")).toHaveTextContent("ready");
    expect(seen.permissions?.effectiveRole).toBe("asesor");
    expect(harness.network.to("/storage/v1/object/public/flyers/_facultades.json")).toHaveLength(1);
  });

  it("a file that does not exist is not a failure: the defaults apply", async () => {
    const { screen, status } = await open({ profile: { ...ACTIVE_PROFILE, role: "vip" } });

    await expect.element(status).toHaveTextContent("signed-in");
    await expect.element(screen.getByTestId("load")).toHaveTextContent("ready");
    await expect.element(screen.getByTestId("notes")).toHaveTextContent("with notes");
  });

  it("a failure keeps the defaults, says it failed, and retrying reads them", async () => {
    let isDown = true;
    const { screen, seen } = await open({
      profile: { ...ACTIVE_PROFILE, role: "vip" },
      permissions: () =>
        isDown ? droppedConnection() : jsonResponse({ roles: { vip: { notas: false } } }),
    });

    await expect.element(screen.getByTestId("load")).toHaveTextContent("failed");
    await expect.element(screen.getByTestId("notes")).toHaveTextContent("with notes");

    isDown = false;
    required(seen.permissions).retryLoad();

    await expect.element(screen.getByTestId("load")).toHaveTextContent("ready");
    await expect.element(screen.getByTestId("notes")).toHaveTextContent("without notes");
  });

  it("a file that is not JSON is a failure too", async () => {
    const { screen } = await open({ permissions: () => new Response("<html>") });

    await expect.element(screen.getByTestId("load")).toHaveTextContent("failed");
  });

  it("a server down is a failure, and the hunter lock still holds", async () => {
    const { screen, seen } = await open({
      profile: { ...ACTIVE_PROFILE, role: "hunter" },
      permissions: () => jsonResponse({}, 503),
    });

    await expect.element(screen.getByTestId("load")).toHaveTextContent("failed");
    expect(seen.permissions).toMatchObject({ isHunter: true, effectiveRole: "hunter" });
    expect(seen.permissions?.can("padron_buscar")).toBe(false);
  });

  it("an administrator has everything but what they turned off, and sees as another", async () => {
    const { status, seen, screen } = await open({
      profile: { ...ACTIVE_PROFILE, role: "admin", facultades: { notas: false } },
      permissions: savedFile({ lider: { notas: true } }),
    });
    await expect.element(status).toHaveTextContent("signed-in");
    await expect.element(screen.getByTestId("load")).toHaveTextContent("ready");
    expect(seen.permissions?.isAdminNow).toBe(true);
    expect(seen.permissions?.can("benchmark")).toBe(true);
    await expect.element(screen.getByTestId("notes")).toHaveTextContent("without notes");

    required(seen.actions).startRolePreview("lider");

    await expect.element(screen.getByTestId("notes")).toHaveTextContent("with notes");
    expect(seen.permissions).toMatchObject({
      isAdminNow: false,
      isLeader: true,
      effectiveRole: "lider",
      simulatedRole: "lider",
    });
    expect(seen.permissions?.can("benchmark")).toBe(false);

    required(seen.actions).stopRolePreview();

    await expect.element(screen.getByTestId("notes")).toHaveTextContent("without notes");
    expect(seen.permissions?.isAdminNow).toBe(true);
  });

  it("only an administrator can look at the app as another", async () => {
    const { status, seen } = await open();
    await expect.element(status).toHaveTextContent("signed-in");

    required(seen.actions).startRolePreview("hunter");

    await vi.waitFor(() => {
      expect(seen.permissions?.effectiveRole).toBe("asesor");
    });
    expect(seen.permissions?.simulatedRole).toBeNull();
  });
});

function CallsUseSession(): ReactNode {
  return useSession().status;
}
function CallsUseSessionActions(): ReactNode {
  return typeof useSessionActions();
}
function CallsUsePermissions(): ReactNode {
  return typeof usePermissions();
}
function CallsUseCan(): ReactNode {
  return String(useCan("notas"));
}

describe("the hooks", () => {
  it.each([
    ["useSession", CallsUseSession],
    ["useSessionActions", CallsUseSessionActions],
    ["usePermissions", CallsUsePermissions],
    ["useCan", CallsUseCan],
  ])("%s fails without a provider", async (_name, Calls) => {
    const screen = await render(
      <ShowsError>
        <Calls />
      </ShowsError>,
    );

    await expect.element(screen.getByText(/needs a SessionProvider above it/)).toBeVisible();
  });
});
