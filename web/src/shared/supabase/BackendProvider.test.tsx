import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { BackendProvider, createBackend, useBackend } from "./index.ts";
import { createInventedBackend, INVENTED_ANON_KEY } from "./testing/invented-backend.ts";
import { ShowsError } from "./testing/ShowsError.tsx";
import { inventedSession, jsonResponse } from "./testing/recording-fetch.ts";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

function ShowsAnonKey() {
  const { bucket } = useBackend();
  return <p>{bucket.publicUrl("flyer_t1.jpg")}</p>;
}

describe("useBackend", () => {
  it("gives the Backend of its provider", async () => {
    const { backend, url } = createInventedBackend(() => jsonResponse({}));

    const screen = await render(
      <BackendProvider backend={backend}>
        <ShowsAnonKey />
      </BackendProvider>,
    );

    await expect
      .element(screen.getByText(`${url}/storage/v1/object/public/flyers/flyer_t1.jpg`))
      .toBeVisible();
  });

  it("fails without a provider", async () => {
    const screen = await render(
      <ShowsError>
        <ShowsAnonKey />
      </ShowsError>,
    );

    await expect.element(screen.getByText(/useBackend needs a BackendProvider/)).toBeVisible();
  });
});

describe("createBackend", () => {
  it("keeps the session where it has always been, so that nobody is signed out", async () => {
    const { backend, storageKey } = createInventedBackend(() => jsonResponse(inventedSession()));
    expect(storageKey).toMatch(/^sb-invented\d+-auth-token$/);

    await backend.auth.signInWithPassword({ email: "a@b.c", password: "x" });

    expect(localStorage.getItem(storageKey)).toContain("access_token");
    expect(Object.keys(localStorage).filter((key) => key.includes("auth-token"))).toEqual([
      storageKey,
    ]);
  });

  it("finds the session left by the old app", async () => {
    const { backend, storageKey } = createInventedBackend(() => jsonResponse({}));
    localStorage.setItem(storageKey, JSON.stringify(inventedSession()));

    const session = await backend.auth.getSession();

    expect(session.ok && session.value?.user.email).toBe("ana.inventada@bancogalicia.com.ar");
  });

  it("without a fetch of its own, it uses the one of the browser", async () => {
    const browserFetch = vi.fn<typeof fetch>(() => Promise.resolve(jsonResponse({ valor: 1 })));
    vi.stubGlobal("fetch", browserFetch);
    const backend = createBackend({
      url: "https://invented-browser.supabase.co",
      anonKey: INVENTED_ANON_KEY,
    });

    await expect(backend.bucket.readJson("_cashback.json")).resolves.toEqual({
      ok: true,
      value: { valor: 1 },
    });
    expect(browserFetch).toHaveBeenCalledTimes(1);
  });

  it("goes through the table client too, with the public key", async () => {
    const { backend, network } = createInventedBackend(() => jsonResponse([{ valor: "on" }]));

    const answer = await backend.db.from("app_flags").select("valor").eq("clave", "gestiones");

    expect(answer.data?.[0]?.valor).toBe("on");
    const [request] = network.to("/rest/v1/app_flags", "GET");
    expect(request?.headers.get("apikey")).toBe(INVENTED_ANON_KEY);
    expect(request?.query.get("clave")).toBe("eq.gestiones");
  });

  it("gives its page reader, which pages through the table client", async () => {
    const { backend, network } = createInventedBackend(({ query }) =>
      jsonResponse(
        query.get("offset") === "0" ? [{ valor: "a" }, { valor: "b" }] : [{ valor: "c" }],
      ),
    );

    const result = await backend.fetchAllRows(
      (from, to) => backend.db.from("app_flags").select("valor").order("clave").range(from, to),
      2,
    );

    expect(result.ok && result.value.map(({ valor }) => valor)).toEqual(["a", "b", "c"]);
    expect(network.requests).toHaveLength(2);
  });
});
