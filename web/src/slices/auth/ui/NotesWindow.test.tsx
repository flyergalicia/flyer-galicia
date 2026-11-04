import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { createAppHarness } from "@/shared/lib/testing/app-harness.tsx";
import { useSession } from "@/shared/session/index.ts";
import { INVENTED_USER } from "@/shared/supabase/testing/recording-fetch.ts";
import { type Note, notesKey, readNotes } from "../model/notes.ts";
import { NotesWindow } from "./NotesWindow.tsx";

function WhenInside({ onClose }: { readonly onClose: () => void }) {
  const session = useSession();
  return session.status === "signed-in" ? <NotesWindow onClose={onClose} /> : null;
}

const NOTE: Note = { id: "n1", title: "Primera", body: "Texto uno", updated: 1 };
const OTHER: Note = { id: "n2", title: "Segunda", body: "Texto dos", updated: 1 };

async function open(notes: readonly Note[] = []) {
  localStorage.setItem(notesKey(INVENTED_USER.id), JSON.stringify(notes));
  const harness = createAppHarness();
  harness.storeSession();
  const onClose = vi.fn<() => void>();
  const screen = await render(harness.wrap(<WhenInside onClose={onClose} />));
  await expect.element(screen.getByRole("dialog", { name: /Bloc de notas/ })).toBeVisible();
  return { screen, onClose };
}

function saved(): readonly Note[] {
  return readNotes(localStorage, INVENTED_USER.id);
}

function titles(screen: Awaited<ReturnType<typeof open>>["screen"]): string[] {
  return screen
    .getByRole("button", { name: /^(Nota|Primera|Segunda|Sin título)/ })
    .elements()
    .map(({ textContent }) => textContent);
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the notes", () => {
  it("there is always one to write on", async () => {
    const { screen } = await open();

    await expect.element(screen.getByLabelText("Título de la nota")).toHaveValue("Nota 1");
  });

  it("writing keeps it, in this browser, and says so", async () => {
    const { screen } = await open([NOTE]);
    vi.useFakeTimers({ shouldAdvanceTime: true });

    await screen.getByLabelText("Texto de la nota").fill("Cambiado");

    expect(saved()[0]?.body).toBe("Cambiado");
    await expect.element(screen.getByText("Guardado ✓")).toBeVisible();

    await vi.advanceTimersByTimeAsync(1500);
    await expect.element(screen.getByText("Guardado ✓")).not.toBeInTheDocument();
  });

  it("changing the title shows it on the list; one without it says so", async () => {
    const { screen } = await open([NOTE]);

    await screen.getByLabelText("Título de la nota").fill("Otro título");
    expect(saved()[0]?.title).toBe("Otro título");

    await screen.getByLabelText("Título de la nota").fill("");
    await expect.element(screen.getByRole("button", { name: "Sin título" })).toBeVisible();
  });

  it("each one is chosen from the list", async () => {
    const { screen } = await open([NOTE, OTHER]);

    await screen.getByRole("button", { name: "Segunda" }).click();

    await expect.element(screen.getByLabelText("Texto de la nota")).toHaveValue("Texto dos");
  });

  it("a new one goes first, with the cursor on its name", async () => {
    const { screen } = await open([NOTE]);

    await screen.getByRole("button", { name: "+ Nueva nota" }).click();

    await expect.element(screen.getByLabelText("Título de la nota")).toHaveValue("Nota 2");
    await expect.element(screen.getByLabelText("Título de la nota")).toHaveFocus();
    expect(saved().map(({ title }) => title)).toEqual(["Nota 2", "Primera"]);
  });

  it("they move up and down", async () => {
    const { screen } = await open([NOTE, OTHER]);

    await screen.getByRole("button", { name: "↓" }).click();
    expect(titles(screen)).toEqual(["Segunda", "Primera"]);
    await screen.getByRole("button", { name: "↑" }).click();
    expect(titles(screen)).toEqual(["Primera", "Segunda"]);
  });

  it("deleting asks first, with a window of the app", async () => {
    const { screen } = await open([NOTE, OTHER]);

    await screen.getByRole("button", { name: /Eliminar/ }).click();
    const asking = screen.getByRole("alertdialog");
    await expect.element(asking).toMatchTextContent(/¿Eliminar la nota "Primera"\?/);
    await expect.element(asking).toMatchTextContent(/Esta acción no se puede deshacer\./);

    await asking.getByRole("button", { name: "Cancelar" }).click();
    expect(saved()).toHaveLength(2);

    await screen.getByRole("button", { name: /Eliminar/ }).click();
    await screen.getByRole("alertdialog").getByRole("button", { name: "Eliminar" }).click();

    expect(saved().map(({ title }) => title)).toEqual(["Segunda"]);
    await expect.element(screen.getByRole("status")).toHaveTextContent("Nota eliminada");
  });

  it("Escape in the question leaves the window open", async () => {
    const { screen, onClose } = await open([NOTE]);
    await screen.getByRole("button", { name: /Eliminar/ }).click();

    await userEvent.keyboard("{Escape}");

    await expect.element(screen.getByRole("alertdialog")).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("one with no name is asked about by that", async () => {
    const { screen } = await open([{ ...NOTE, title: "" }]);

    await screen.getByRole("button", { name: /Eliminar/ }).click();

    await expect.element(screen.getByRole("alertdialog")).toMatchTextContent(/"Sin título"/);
  });

  it("each person has their own, and without a session they go under a common name", async () => {
    const harness = createAppHarness();
    const screen = await render(harness.wrap(<NotesWindow onClose={vi.fn<() => void>()} />));

    await screen.getByLabelText("Texto de la nota").fill("Sin cuenta");

    expect(readNotes(localStorage, "anon")[0]?.body).toBe("Sin cuenta");
  });

  it("copying says so", async () => {
    const write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    const { screen } = await open([NOTE]);

    await screen.getByRole("button", { name: /Copiar/ }).click();

    expect(write).toHaveBeenCalledWith("Texto uno");
    await expect.element(screen.getByRole("status")).toHaveTextContent("Nota copiada");
  });

  it("if copying is refused, it does not break", async () => {
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
    const { screen } = await open([NOTE]);

    await screen.getByRole("button", { name: /Copiar/ }).click();

    await expect.element(screen.getByRole("dialog", { name: /Bloc de notas/ })).toBeVisible();
  });
});
