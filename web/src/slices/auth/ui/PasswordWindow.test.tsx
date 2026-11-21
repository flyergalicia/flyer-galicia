import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { type AppAnswers, createAppHarness } from "@/shared/lib/testing/app-harness.tsx";
import { useSession } from "@/shared/session/index.ts";
import { deferred, jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import { PasswordWindow } from "./PasswordWindow.tsx";

const CURRENT = "ClaveActual123";
const NEW = "ClaveNueva456";

function WhenInside({ onClose }: { readonly onClose: () => void }) {
  const session = useSession();
  return session.status === "signed-in" ? <PasswordWindow onClose={onClose} /> : null;
}

async function open(answers: AppAnswers = {}) {
  const harness = createAppHarness(answers);
  harness.storeSession();
  const onClose = vi.fn<() => void>();
  const screen = await render(harness.wrap(<WhenInside onClose={onClose} />));
  await expect.element(screen.getByRole("dialog", { name: "Cambiar mi contraseña" })).toBeVisible();
  // The window puts the cursor on the first field a moment after opening: typing before that
  // lands in the wrong field (it failed once that way).
  await expect.element(screen.getByLabelText("Contraseña actual")).toHaveFocus();
  return { harness, screen, onClose };
}

type Screen = Awaited<ReturnType<typeof open>>["screen"];

async function submit(screen: Screen, current: string, password: string, repeat: string) {
  await screen.getByLabelText("Contraseña actual").fill(current);
  await screen.getByLabelText("Nueva contraseña", { exact: true }).fill(password);
  await screen.getByLabelText("Repetir nueva contraseña").fill(repeat);
  await screen.getByTestId("password-submit").click();
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

describe("changing one's password", () => {
  it("the cursor starts on the current one", async () => {
    const { screen } = await open();

    await expect.element(screen.getByLabelText("Contraseña actual")).toHaveFocus();
  });

  it("checks the fields and asks nothing of the server", async () => {
    const { screen, harness } = await open();

    await submit(screen, "", NEW, NEW);
    await expect
      .element(screen.getByTestId("password-error"))
      .toMatchTextContent(/contraseña actual/);
    await submit(screen, CURRENT, NEW, "Otra1234567");
    await expect.element(screen.getByTestId("password-error")).toMatchTextContent(/no coinciden/);

    expect(harness.network.to("/auth/v1/user")).toEqual([]);
  });

  it("changes it, sends the notice and the window closes by itself", async () => {
    const { screen, harness, onClose } = await open();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    await submit(screen, CURRENT, NEW, NEW);

    await expect
      .element(screen.getByTestId("password-ok"))
      .toMatchTextContent(/se cambió correctamente/);
    await expect.element(screen.getByRole("status")).toHaveTextContent("Contraseña actualizada");
    expect(harness.adminCalls()).toEqual([{ action: "notify_self_password" }]);
    await expect.element(screen.getByLabelText("Contraseña actual")).toHaveValue("");
    expect(onClose).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1600);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("with a wrong current password nothing changes", async () => {
    const { screen, harness } = await open();
    harness.network.answerWith(() => jsonResponse({ msg: "Invalid login credentials" }, 400));

    await submit(screen, "Equivocada1", NEW, NEW);

    await expect
      .element(screen.getByTestId("password-error"))
      .toMatchTextContent(/actual es incorrecta/);
    await expect.element(screen.getByTestId("password-submit")).toBeEnabled();
    expect(harness.network.to("/auth/v1/user")).toEqual([]);
  });

  it("when the change fails, it says what the server said", async () => {
    const { screen, harness } = await open({
      passwordChange: () => jsonResponse({ msg: "Clave demasiado débil" }, 422),
    });

    await submit(screen, CURRENT, NEW, NEW);

    await expect
      .element(screen.getByTestId("password-error"))
      .toHaveTextContent("Clave demasiado débil");
    expect(harness.adminCalls()).toEqual([]);
  });

  it("says what it is doing", async () => {
    const answer = deferred<Response>();
    const { screen } = await open({ passwordChange: () => answer.promise });

    await submit(screen, CURRENT, NEW, NEW);

    await expect.element(screen.getByTestId("password-submit")).toHaveTextContent("Guardando...");
    await expect.element(screen.getByTestId("password-submit")).toBeDisabled();
    answer.resolve(jsonResponse({ id: "u", email: "a@b.c" }));
    await expect
      .element(screen.getByTestId("password-submit"))
      .toHaveTextContent("Cambiar contraseña");
  });

  it("Enter on the last field sends it", async () => {
    const { screen, harness } = await open();
    await expect.element(screen.getByLabelText("Contraseña actual")).toHaveFocus();
    await screen.getByLabelText("Contraseña actual").fill(CURRENT);
    await screen.getByLabelText("Nueva contraseña", { exact: true }).fill(NEW);
    await screen.getByLabelText("Repetir nueva contraseña").fill(NEW);

    await screen.getByLabelText("Repetir nueva contraseña").click();
    await userEvent.keyboard("a");
    await userEvent.keyboard("{Backspace}");
    await userEvent.keyboard("{Enter}");

    await vi.waitFor(() => {
      expect(harness.network.to("/auth/v1/user", "PUT")).toHaveLength(1);
    });
  });

  it("Cancelar and the cross close it", async () => {
    const { screen, onClose } = await open();

    await screen.getByRole("button", { name: "Cancelar" }).click();
    await screen.getByRole("button", { name: "Cerrar" }).click();

    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
