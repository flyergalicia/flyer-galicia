import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { deferred, jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import { AppGate } from "./AppGate.tsx";
import { type AppAnswers, createAppHarness } from "@/shared/lib/testing/app-harness.tsx";

const CONFIG = {
  "_opciones.json": { opts: [{ n: 9, nombre: "Combustible" }] },
  "_facultades.json": { roles: { asesor: { promos_buscar: true } } },
  "_titulos.json": { orden: ["promos", "flyer"] },
};

async function open(answers: AppAnswers = {}, signedIn = true) {
  const harness = createAppHarness({ files: CONFIG, ...answers });
  if (signedIn) harness.storeSession();
  const screen = await render(harness.wrap(<AppGate />));
  return { harness, screen };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

describe("the door of the app", () => {
  it("whoever has no session sees the form, and nothing is asked", async () => {
    const { screen, harness } = await open({}, false);

    await expect
      .element(screen.getByRole("heading", { name: "Flyer Galicia", level: 1 }))
      .toBeVisible();
    await expect.element(screen.getByRole("banner")).not.toBeInTheDocument();
    expect(harness.network.requests).toEqual([]);
  });

  it("whoever has one goes in, and opens where the order says", async () => {
    const { screen } = await open();

    await expect.element(screen.getByRole("banner")).toBeVisible();
    await expect
      .element(
        screen.getByRole("tablist", { name: "Pantallas" }).getByRole("tab", { selected: true }),
      )
      .toHaveTextContent("Promociones");
  });

  it("does not show the app until it is known what it can show", async () => {
    const titles = deferred<Response>();
    const harness = createAppHarness({ files: CONFIG });
    harness.storeSession();
    vi.spyOn(harness.backend.bucket, "readJson").mockImplementation(async (file) => {
      if (file === "_titulos.json") await titles.promise;
      return { ok: true, value: {} };
    });
    const screen = await render(harness.wrap(<AppGate />));

    await expect.element(screen.getByRole("heading", { name: "Ingresando…" })).toBeVisible();
    await expect.element(screen.getByRole("banner")).not.toBeInTheDocument();

    titles.resolve(jsonResponse({}));
    await expect.element(screen.getByRole("banner")).toBeVisible();
  });

  it("if what it waits for does not answer, it goes in with what it has", async () => {
    const harness = createAppHarness({ files: CONFIG });
    harness.storeSession();
    vi.spyOn(harness.backend.bucket, "readJson").mockReturnValue(new Promise(() => undefined));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const screen = await render(harness.wrap(<AppGate />));
    await expect.element(screen.getByRole("heading", { name: "Ingresando…" })).toBeVisible();

    await vi.advanceTimersByTimeAsync(10_000);

    await expect.element(screen.getByRole("banner")).toBeVisible();
    await expect
      .element(
        screen.getByRole("tablist", { name: "Pantallas" }).getByRole("tab", { selected: true }),
      )
      .toHaveTextContent("Flyer Galicia");
  });

  it("what fails to arrive leaves the defaults, not a closed door", async () => {
    const { screen } = await open({
      droppedFiles: ["_opciones.json", "_titulos.json", "_facultades.json"],
    });

    await expect.element(screen.getByRole("banner")).toBeVisible();
    await expect
      .element(
        screen.getByRole("tablist", { name: "Pantallas" }).getByRole("tab", { selected: true }),
      )
      .toHaveTextContent("Flyer Galicia");
  });

  it("a test account that changes to another starts over", async () => {
    const { screen, harness } = await open({
      profile: { role: "asesor", full_name: "Ana Inventada", status: "active", es_prueba: true },
      admin: () =>
        jsonResponse({
          ok: true,
          cuentas: [{ id: "u2", full_name: "Otra Persona", role: "hunter" }],
          token_hash: "th-u2",
        }),
    });
    await screen.getByRole("button", { name: /^Menú de / }).click();

    await screen.getByRole("button", { name: /Otra Persona/ }).click();

    await vi.waitFor(() => {
      expect(harness.network.to("/auth/v1/verify", "POST")).toHaveLength(1);
    });
    await expect.element(screen.getByRole("banner")).toBeVisible();
  });
});
