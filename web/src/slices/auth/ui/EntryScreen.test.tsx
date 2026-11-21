import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { type AppAnswers, createAppHarness } from "@/shared/lib/testing/app-harness.tsx";
import type { AuthListener } from "@/shared/supabase/index.ts";
import { deferred, jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import { EntryScreen } from "./EntryScreen.tsx";

const FORM_TITLE = { name: "Flyer Galicia", level: 1 } as const;
const MAIL = "ana@bancogalicia.com.ar";
const PASSWORD = "secreto123";

async function open(answers: AppAnswers = {}, signedIn = false) {
  const harness = createAppHarness(answers);
  if (signedIn) harness.storeSession();
  const screen = await render(harness.wrap(<EntryScreen />));
  return { harness, screen };
}

type Screen = Awaited<ReturnType<typeof open>>["screen"];

/** The forms that are not showing stay in the page, with the same labels. */
function field(screen: Screen, label: string) {
  const all = screen.getByLabelText(label, { exact: true }).elements();
  const shown = all.find((element) => element.getClientRects().length > 0);
  if (!(shown instanceof HTMLInputElement)) throw new Error(`No "${label}" on screen`);
  return shown;
}

async function fill(screen: Screen, label: string, value: string): Promise<void> {
  const input = field(screen, label);
  input.focus();
  await userEvent.clear(input);
  if (value) await userEvent.keyboard(value);
}

function press(screen: Screen, name: string | RegExp) {
  return screen.getByRole("button", { name }).click();
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("the form", () => {
  it("is what shows without a session", async () => {
    const { screen } = await open();

    await expect.element(screen.getByRole("heading", FORM_TITLE)).toBeVisible();
    await expect.element(screen.getByText("Ingresá con tu cuenta para continuar")).toBeVisible();
    await expect.element(screen.getByText("Tus flyers, listos en un minuto.")).toBeVisible();
    await expect.element(screen.getByRole("img", { name: "Galicia" })).toBeVisible();
  });

  it("asks for the two fields before going anywhere", async () => {
    const { screen, harness } = await open();

    await press(screen, "Ingresar");

    await expect.element(screen.getByTestId("login-error")).toMatchTextContent(/Completá el mail/);
    expect(harness.network.to("/auth/v1/token")).toEqual([]);
  });

  it("shows a refusal in Spanish and frees the button", async () => {
    const { screen, harness } = await open();
    harness.network.answerWith(() => jsonResponse({ msg: "Invalid login credentials" }, 400));
    await fill(screen, "Email", MAIL);
    await fill(screen, "Contraseña", PASSWORD);

    await press(screen, "Ingresar");

    await expect
      .element(screen.getByTestId("login-error"))
      .toHaveTextContent("Mail o contraseña incorrectos.");
    await expect.element(screen.getByRole("button", { name: "Ingresar" })).toBeEnabled();
  });

  it("says it is working while it asks", async () => {
    const { screen, harness } = await open();
    const answer = deferred<Response>();
    harness.network.answerWith(() => answer.promise);
    await fill(screen, "Email", MAIL);
    await fill(screen, "Contraseña", PASSWORD);

    await press(screen, "Ingresar");

    await expect.element(screen.getByRole("button", { name: "Ingresando..." })).toBeDisabled();
    answer.resolve(jsonResponse({ msg: "x" }, 400));
    await expect.element(screen.getByRole("button", { name: "Ingresar" })).toBeEnabled();
  });

  it("Enter on the password goes in, and on the mail it does not", async () => {
    const { screen, harness } = await open();
    await fill(screen, "Email", MAIL);
    await userEvent.keyboard("{Enter}");
    expect(harness.network.to("/auth/v1/token")).toEqual([]);

    await fill(screen, "Contraseña", PASSWORD);
    await userEvent.keyboard("{Enter}");

    await vi.waitFor(() => {
      expect(harness.network.to("/auth/v1/token", "POST")).toHaveLength(1);
    });
  });

  it("the right password says it is entering", async () => {
    const { screen } = await open({ profile: () => new Promise(() => undefined) });
    await fill(screen, "Email", MAIL);
    await fill(screen, "Contraseña", PASSWORD);

    await press(screen, "Ingresar");

    await expect.element(screen.getByRole("heading", { name: "Ingresando…" })).toBeVisible();
  });
});

describe("the views of the form", () => {
  it("what was written stays and the messages go away", async () => {
    const { screen } = await open();
    await fill(screen, "Email", MAIL);
    await press(screen, "Ingresar");
    await expect.element(screen.getByTestId("login-error")).toMatchTextContent(/Completá/);

    await press(screen, /Olvidaste/);
    await expect
      .element(screen.getByRole("heading", { name: "Recuperar contraseña" }))
      .toBeVisible();
    await press(screen, /Volver al inicio/);

    expect(field(screen, "Email").value).toBe(MAIL);
    await expect.element(screen.getByTestId("login-error")).toHaveTextContent("");
  });

  it("the mail of a new password opens the view for asking for it", async () => {
    const harness = createAppHarness();
    const listeners: AuthListener[] = [];
    vi.spyOn(harness.backend.auth, "onAuthStateChange").mockImplementation((listener) => {
      listeners.push(listener);
      return () => undefined;
    });
    const screen = await render(harness.wrap(<EntryScreen />));
    await expect.element(screen.getByRole("heading", FORM_TITLE)).toBeVisible();

    for (const listener of listeners) listener("PASSWORD_RECOVERY", null);

    await expect
      .element(screen.getByRole("heading", { name: "Recuperar contraseña" }))
      .toBeVisible();
    await press(screen, /Volver al inicio/);
    await expect.element(screen.getByRole("heading", FORM_TITLE)).toBeVisible();
  });
});

async function onRegister(answers: AppAnswers = {}) {
  const opened = await open(answers);
  await press(opened.screen, "Crear cuenta");
  await expect.element(opened.screen.getByRole("heading", { name: "Crear cuenta" })).toBeVisible();
  return opened;
}

async function submitRegister(screen: Screen, name: string, email: string, password: string) {
  await fill(screen, "Nombre completo", name);
  await fill(screen, "Email", email);
  await fill(screen, "Contraseña", password);
  await screen.getByTestId("register-submit").click();
}

describe("asking for an account", () => {
  it("checks everything before sending", async () => {
    const { screen, harness } = await onRegister();

    await submitRegister(screen, "", MAIL, PASSWORD);
    await expect
      .element(screen.getByTestId("register-error"))
      .toMatchTextContent(/todos los campos/);
    await submitRegister(screen, "Ana", "ana@gmail.com", PASSWORD);
    await expect.element(screen.getByTestId("register-error")).toMatchTextContent(/@bancogalicia/);
    await submitRegister(screen, "Ana", MAIL, "corta");
    await expect.element(screen.getByTestId("register-error")).toMatchTextContent(/8 caracteres/);

    expect(harness.adminCalls()).toEqual([]);
  });

  it("sends it and does not say who exists", async () => {
    const { screen, harness } = await onRegister();

    await submitRegister(screen, " Ana ", MAIL, PASSWORD);

    await expect
      .element(screen.getByTestId("register-ok"))
      .toMatchTextContent(/Si el mail es válido/);
    expect(harness.adminCalls()).toEqual([
      { action: "register", email: MAIL, full_name: "Ana", password: PASSWORD },
    ]);
    expect(field(screen, "Email").value).toBe("");
  });

  it("shows what the server refuses", async () => {
    const { screen } = await onRegister({
      admin: () => jsonResponse({ error: "No se pudo" }, 400),
    });

    await submitRegister(screen, "Ana", MAIL, PASSWORD);

    await expect.element(screen.getByTestId("register-error")).toHaveTextContent("No se pudo");
  });

  it("the button works again after a failure of the network", async () => {
    const { screen, harness } = await onRegister();
    vi.spyOn(harness.backend, "callEdge").mockRejectedValue(new TypeError("Failed to fetch"));

    await submitRegister(screen, "Ana", MAIL, PASSWORD);

    await expect
      .element(screen.getByTestId("register-error"))
      .toMatchTextContent(/No se pudo conectar/);
    await expect.element(screen.getByTestId("register-submit")).toBeEnabled();
  });

  it("says it is working while it sends", async () => {
    const answer = deferred<Response>();
    const { screen } = await onRegister({ admin: () => answer.promise });

    await submitRegister(screen, "Ana", MAIL, PASSWORD);

    await expect
      .element(screen.getByTestId("register-submit"))
      .toHaveTextContent("Creando cuenta...");
    await expect.element(screen.getByTestId("register-submit")).toBeDisabled();
    answer.resolve(jsonResponse({ ok: true }));
    await expect.element(screen.getByTestId("register-submit")).toBeEnabled();
  });

  it("goes back to the form", async () => {
    const { screen } = await onRegister();

    await press(screen, /Ya tengo cuenta/);

    await expect.element(screen.getByRole("heading", FORM_TITLE)).toBeVisible();
  });
});

async function onForgot(answers: AppAnswers = {}) {
  const opened = await open(answers);
  await press(opened.screen, /Olvidaste/);
  return opened;
}

async function submitForgot(screen: Screen, email: string, password: string, repeat: string) {
  await fill(screen, "Email", email);
  await fill(screen, "Nueva contraseña", password);
  await fill(screen, "Repetir nueva contraseña", repeat);
  await screen.getByTestId("forgot-submit").click();
}

describe("asking for a new password", () => {
  it("checks everything before sending", async () => {
    const { screen, harness } = await onForgot();

    await submitForgot(screen, "", PASSWORD, PASSWORD);
    await expect.element(screen.getByTestId("forgot-error")).toMatchTextContent(/tu email/);

    expect(harness.adminCalls()).toEqual([]);
  });

  it("sends it, and keeps the mail for the next try", async () => {
    const { screen, harness } = await onForgot();

    await submitForgot(screen, MAIL, PASSWORD, PASSWORD);

    await expect
      .element(screen.getByTestId("forgot-ok"))
      .toMatchTextContent(/pendiente de aprobación/);
    expect(harness.adminCalls()).toEqual([
      { action: "request_reset", email: MAIL, password: PASSWORD },
    ]);
    expect(field(screen, "Email").value).toBe(MAIL);
    expect(field(screen, "Nueva contraseña").value).toBe("");
  });

  it("shows what the server refuses", async () => {
    const { screen } = await onForgot({
      admin: () => jsonResponse({ error: "Demasiados pedidos" }, 429),
    });

    await submitForgot(screen, MAIL, PASSWORD, PASSWORD);

    await expect
      .element(screen.getByTestId("forgot-error"))
      .toHaveTextContent("Demasiados pedidos");
  });

  it("says so if the network fails", async () => {
    const { screen, harness } = await onForgot();
    vi.spyOn(harness.backend, "callEdge").mockRejectedValue(new TypeError("Failed to fetch"));

    await submitForgot(screen, MAIL, PASSWORD, PASSWORD);

    await expect
      .element(screen.getByTestId("forgot-error"))
      .toMatchTextContent(/No se pudo conectar/);
  });

  it("says it is working while it sends", async () => {
    const answer = deferred<Response>();
    const { screen } = await onForgot({ admin: () => answer.promise });

    await submitForgot(screen, MAIL, PASSWORD, PASSWORD);

    await expect.element(screen.getByTestId("forgot-submit")).toHaveTextContent("Enviando...");
    answer.resolve(jsonResponse({ ok: true }));
    await expect.element(screen.getByTestId("forgot-submit")).toHaveTextContent("Solicitar cambio");
  });
});

describe("with a saved session", () => {
  it("says it is entering, and the form does not show", async () => {
    const { screen } = await open({ profile: () => new Promise(() => undefined) }, true);

    await expect.element(screen.getByRole("heading", { name: "Ingresando…" })).toBeVisible();
    await expect.element(screen.getByText("Estamos abriendo tu armador.")).toBeVisible();
    await expect.element(screen.getByRole("heading", FORM_TITLE)).not.toBeInTheDocument();
  });

  it("an account that is not active is told why, on the form", async () => {
    const { screen, harness } = await open(
      { profile: { role: "asesor", status: "inactive" } },
      true,
    );

    await expect.element(screen.getByTestId("login-error")).toMatchTextContent(/Cuenta inactiva/);
    await vi.waitFor(() => {
      expect(harness.network.to("/auth/v1/logout", "POST")).toHaveLength(1);
    });
  });

  it("the reason goes away on changing the view", async () => {
    const { screen } = await open({ profile: { role: "asesor", status: "pending" } }, true);
    await expect.element(screen.getByTestId("login-error")).toMatchTextContent(/pendiente/);

    await press(screen, /Olvidaste/);
    await press(screen, /Volver al inicio/);

    await expect.element(screen.getByTestId("login-error")).toHaveTextContent("");
  });

  it("a passing failure offers to try again, and it does not close the session", async () => {
    const { screen, harness } = await open(
      { profile: () => jsonResponse({ message: "wait" }, 429) },
      true,
    );

    await expect.element(screen.getByRole("alert")).toMatchTextContent(/No se pudo conectar/);
    await expect.element(screen.getByRole("alert")).toMatchTextContent(/Tu sesión sigue abierta/);
    expect(harness.network.to("/auth/v1/logout")).toEqual([]);

    harness.network.answerWith(() => jsonResponse({ role: "asesor", status: "active" }));
    await press(screen, "Reintentar");

    await expect.element(screen.getByRole("alert")).not.toBeInTheDocument();
  });

  it("going in with another account leaves without the session, even without a network", async () => {
    const { screen, harness } = await open(
      { profile: () => jsonResponse({ message: "wait" }, 429) },
      true,
    );

    await press(screen, "Ingresar con otra cuenta");

    await expect.element(screen.getByRole("heading", FORM_TITLE)).toBeVisible();
    expect(harness.hasSession()).toBe(false);
  });

  it("when it takes too long it says so", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { screen } = await open({ profile: () => new Promise(() => undefined) }, true);

    await vi.advanceTimersByTimeAsync(10_000);

    await expect
      .element(screen.getByRole("alert"))
      .toMatchTextContent(/Está tardando más de lo normal/);
    vi.useRealTimers();
  });
});
