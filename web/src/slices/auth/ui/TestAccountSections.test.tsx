import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { type AppAnswers, createAppHarness } from "@/shared/lib/testing/app-harness.tsx";
import { useSession } from "@/shared/session/index.ts";
import { deferred, jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import { useAccountSwitch } from "../api/account-switch.ts";
import { AccountSwitcher } from "./AccountSwitcher.tsx";
import { TestProfilePicker } from "./TestProfilePicker.tsx";

const TEST_PROFILE = { role: "asesor", full_name: "Ana", status: "active", es_prueba: true };
const OTHERS = [
  { id: "u2", full_name: "Nicolas Ferrari", email: "n@b.c", role: "hunter" },
  { id: "u3", email: "solo.mail@b.c", role: "lider" },
  { id: "u4", role: "inventado" },
  { full_name: "Sin id" },
  "no es una fila",
];

function Switcher() {
  const session = useSession();
  const accountSwitch = useAccountSwitch();
  if (session.status !== "signed-in") return null;
  return (
    <>
      <span data-testid="inside">adentro</span>
      <AccountSwitcher {...accountSwitch} />
    </>
  );
}

async function open(answers: AppAnswers) {
  const harness = createAppHarness({ profile: TEST_PROFILE, ...answers });
  harness.storeSession();
  const screen = await render(harness.wrap(<Switcher />));
  return { harness, screen };
}

function actionOf({ body }: { readonly body: unknown }): unknown {
  return typeof body === "object" && body !== null ? Reflect.get(body, "action") : null;
}

function accountsAnswer(request: { readonly body: unknown }): Response {
  if (actionOf(request) === "cuentas_prueba") return jsonResponse({ ok: true, cuentas: OTHERS });
  return jsonResponse({ ok: true, token_hash: "th-u2" });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

describe("changing to another test account", () => {
  it("lists the others with their profile, and what is not an account does not count", async () => {
    const { screen } = await open({ admin: accountsAnswer });

    const group = screen.getByRole("group", { name: "Cambiar de cuenta" });
    await expect.element(group).toBeVisible();
    const rows = group.getByTestId("switchable-account").elements();
    expect(rows.map(({ textContent }) => textContent)).toEqual([
      "NFNicolas FerrariHunter",
      "SOsolo.mail@b.cLíder",
      "CUCuentainventado",
    ]);
  });

  it("does not exist without accounts, nor if the server does not answer", async () => {
    const empty = await open({ admin: () => jsonResponse({ ok: true, cuentas: [] }) });
    await vi.waitFor(() => {
      expect(empty.harness.adminCalls()).toHaveLength(1);
    });
    await expect.element(empty.screen.getByRole("group")).not.toBeInTheDocument();

    const refused = await open({ admin: () => jsonResponse({ error: "x" }, 500) });
    await vi.waitFor(() => {
      expect(refused.harness.adminCalls()).toHaveLength(1);
    });
    await expect.element(refused.screen.getByRole("group")).not.toBeInTheDocument();

    const shapeless = await open({ admin: () => jsonResponse("texto") });
    await vi.waitFor(() => {
      expect(shapeless.harness.adminCalls()).toHaveLength(1);
    });
    await expect.element(shapeless.screen.getByRole("group")).not.toBeInTheDocument();
  });

  it("a common account does not even ask", async () => {
    const { harness, screen } = await open({
      profile: { role: "asesor", status: "active", es_prueba: false },
      admin: accountsAnswer,
    });

    await expect.element(screen.getByTestId("inside")).toBeVisible();
    await expect.element(screen.getByRole("group")).not.toBeInTheDocument();
    expect(harness.adminCalls()).toEqual([]);
  });

  it("touching one redeems the one-use permission the server sends", async () => {
    const { harness, screen } = await open({ admin: accountsAnswer });

    await screen.getByRole("button", { name: /Nicolas Ferrari/ }).click();

    await vi.waitFor(() => {
      expect(harness.network.to("/auth/v1/verify", "POST")).toHaveLength(1);
    });
    expect(harness.adminCalls()).toContainEqual({ action: "entrar_como", uid: "u2" });
    expect(harness.network.to("/auth/v1/verify")[0]?.body).toMatchObject({
      token_hash: "th-u2",
      type: "magiclink",
    });
  });

  it("touching another one meanwhile asks for nothing else", async () => {
    const answer = deferred<Response>();
    const { harness, screen } = await open({
      admin: (request) =>
        actionOf(request) === "cuentas_prueba"
          ? jsonResponse({ ok: true, cuentas: OTHERS })
          : answer.promise,
    });

    await screen.getByRole("button", { name: /Nicolas Ferrari/ }).click();
    await screen.getByRole("button", { name: /solo.mail/ }).click();

    const asked = harness.adminCalls().filter((body) => actionOf({ body }) === "entrar_como");
    expect(asked).toEqual([{ action: "entrar_como", uid: "u2" }]);
  });

  it("if the server refuses, it says so, and can be tried again", async () => {
    let refuses = true;
    const { screen } = await open({
      admin: (request) => {
        if (actionOf(request) === "cuentas_prueba") {
          return jsonResponse({ ok: true, cuentas: OTHERS });
        }
        return refuses ? jsonResponse({ error: "no" }, 403) : jsonResponse({ ok: true });
      },
    });

    await screen.getByRole("button", { name: /Nicolas Ferrari/ }).click();
    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent("No se pudo cambiar de cuenta.");

    refuses = false;
    await screen.getByRole("button", { name: /Nicolas Ferrari/ }).click();
    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent("No se pudo cambiar de cuenta.");
  });

  it("if redeeming it fails, it says why", async () => {
    const { harness, screen } = await open({ admin: accountsAnswer });
    vi.spyOn(harness.backend.auth, "verifyOneTimeToken").mockResolvedValue({
      ok: false,
      error: { kind: "rejected", status: 403, code: null, message: "Vencido" },
    });

    await screen.getByRole("button", { name: /Nicolas Ferrari/ }).click();

    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent("No se pudo cambiar de cuenta: Vencido");
  });
});

async function openPicker(answers: AppAnswers = {}) {
  const harness = createAppHarness(answers);
  const screen = await render(harness.wrap(<TestProfilePicker currentRole="asesor" />));
  return { harness, screen };
}

describe("trying another profile", () => {
  it("offers the five, with the current one marked", async () => {
    const { screen } = await openPicker();

    const buttons = screen.getByRole("group", { name: /Probar como/ }).getByRole("button");
    expect(buttons.elements().map(({ textContent }) => textContent)).toEqual([
      "Hunter",
      "VIP",
      "Asesor",
      "Pro",
      "Líder",
    ]);
  });

  it("the current one asks for nothing", async () => {
    const { harness, screen } = await openPicker();

    await screen.getByRole("button", { name: "Asesor" }).click();

    expect(harness.network.requests).toEqual([]);
  });

  it("if the server refuses, it says so", async () => {
    const { screen } = await openPicker({ rpc: () => jsonResponse({ message: "no" }, 403) });

    await screen.getByRole("button", { name: "Hunter" }).click();

    await expect.element(screen.getByRole("status")).toHaveTextContent("No se pudo cambiar: no");
  });

  it("the change goes through the server, says so and starts the page again", async () => {
    const harness = createAppHarness();
    const reload = vi.fn<Location["reload"]>();
    const screen = await render(
      harness.wrap(<TestProfilePicker currentRole="asesor" page={{ reload }} />),
    );
    vi.useFakeTimers({ shouldAdvanceTime: true });

    await screen.getByRole("button", { name: "Líder" }).click();

    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent("Listo: ahora sos Líder. Recargando…");
    expect(harness.network.to("/rest/v1/rpc/prueba_cambiar_rol")[0]?.body).toEqual({
      p_role: "lider",
    });
    expect(reload).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(700);
    expect(reload).toHaveBeenCalledOnce();
  });
});
