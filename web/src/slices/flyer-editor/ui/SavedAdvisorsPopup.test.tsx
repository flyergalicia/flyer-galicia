import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { jsonResponse, type Answer } from "@/shared/supabase/testing/recording-fetch.ts";
import { closeFloating } from "@/shared/ui/index.ts";
import { withOfficerField } from "../model/form-state.ts";
import { openWithForm } from "../testing/form-on-screen.tsx";
import { SavedAdvisorsPopup } from "./SavedAdvisorsPopup.tsx";

const ROWS = [
  { id: "a1", name: "Julieta", nombre: "Julieta Paz", celular: "11 1", email: "j@b.com" },
  { id: "a2", name: "", nombre: "Mario Sosa", celular: "", email: "" },
  { id: "a3", name: "", nombre: "", celular: "11 3", email: "" },
];

const PLACE = { top: 150, left: 120 };

async function open(advisors: typeof ROWS | Answer = ROWS, position = 1) {
  const onClose = vi.fn<() => void>();
  const opened = await openWithForm(
    <>
      <button type="button">Afuera</button>
      <SavedAdvisorsPopup position={position} place={PLACE} onClose={onClose} />
    </>,
    { advisors },
  );
  return { ...opened, onClose, popup: page.getByTestId("saved-advisors") };
}

function sentRows(harness: Awaited<ReturnType<typeof open>>["harness"]) {
  return harness.network
    .to("/rest/v1/rpc/asesores_replace")
    .map(({ body }) => Reflect.get(Object(body), "p_rows") as unknown);
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the window of the saved advisors", () => {
  it("lists them, with the name they were saved under or their own", async () => {
    const { popup } = await open();
    await expect.element(popup).toMatchTextContent(/Asesor 2 · guardados/);
    await expect.element(popup.getByRole("button", { name: "Julieta" })).toBeInTheDocument();
    await expect.element(popup.getByRole("button", { name: "Mario Sosa" })).toBeInTheDocument();
    await expect.element(popup.getByRole("button", { name: "Sin nombre" })).toBeInTheDocument();
  });

  it("a name written by someone else is shown as text", async () => {
    const hostile = '<img src=x onerror="window.__hostile=1">Malo';
    const { popup } = await open([{ id: "h", name: hostile, nombre: "", celular: "", email: "" }]);
    await expect.element(popup.getByRole("button", { name: hostile })).toBeInTheDocument();
    expect(document.querySelector('img[src="x"]')).toBeNull();
  });

  it("with none, it says so", async () => {
    const { popup } = await open([]);
    await expect.element(popup).toMatchTextContent(/No tenés asesores guardados todavía\./);
  });

  it("what is chosen fills that place and no other", async () => {
    const { form, onClose, popup } = await open();
    await popup.getByRole("button", { name: "Julieta" }).click();
    expect(onClose).toHaveBeenCalled();
    const { officers } = form().getState();
    expect(officers[1]).toMatchObject({
      nombre: "Julieta Paz",
      celular: "11 1",
      email: "j@b.com",
      shown: true,
    });
    expect(officers[0]?.nombre).toBe("");
    await expect.element(page.getByRole("status")).toHaveTextContent('Asesor "Julieta" cargado');
  });

  it("leaves the mark of the mail as it was, as in the old app: a new name suggests over it", async () => {
    const { popup, form } = await open(ROWS, 0);
    await popup.getByRole("button", { name: "Julieta" }).click();
    expect(form().getState().officers[0]?.email).toBe("j@b.com");
    expect(form().getState().officers[0]?.mailByHand).toBe(false);
    form().update((state) => withOfficerField(state, 0, "nombre", "Ana Perez"));
    expect(form().getState().officers[0]?.email).toBe("ana.perez@bancogalicia.com.ar");
  });

  it("one without a saved name is called by its own", async () => {
    const { popup } = await open();
    await popup.getByRole("button", { name: "Mario Sosa" }).click();
    await expect.element(page.getByRole("status")).toHaveTextContent('Asesor "Mario Sosa" cargado');
  });

  it("does not save an empty advisor", async () => {
    const { popup } = await open();
    await popup.getByRole("button", { name: "+ Guardar el actual" }).click();
    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("Completá el asesor antes de guardar");
    expect(page.getByRole("dialog").query()).toBeNull();
  });

  it("saves the current one under the name that is written, first in the list", async () => {
    const { form, harness, onClose, popup } = await open(ROWS, 0);
    form().update((state) => withOfficerField(state, 0, "nombre", "Ana Perez"));
    await popup.getByRole("button", { name: "+ Guardar el actual" }).click();
    const field = page.getByRole("dialog").getByRole("textbox");
    await expect.element(field).toHaveValue("Ana Perez");
    await expect.element(field).toHaveFocus();
    await field.fill("La de siempre");
    await page.getByRole("button", { name: "Guardar" }).click();

    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent('Asesor "La de siempre" guardado');
    expect(onClose).toHaveBeenCalled();
    expect(sentRows(harness).at(-1)).toMatchObject([
      { name: "La de siempre", nombre: "Ana Perez" },
      { id: "a1" },
      { id: "a2" },
      { id: "a3" },
    ]);
  });

  it("Enter saves too; empty it takes the name of the officer; with no name it asks for one", async () => {
    const { form, harness, popup } = await open(ROWS, 0);
    form().update((state) => withOfficerField(state, 0, "celular", "11 4444 5555"));
    await popup.getByRole("button", { name: "+ Guardar el actual" }).click();
    await page.getByRole("dialog").getByRole("textbox").click();
    await userEvent.keyboard("{Enter}");
    await expect.element(page.getByRole("status")).toHaveTextContent("Poné un nombre");
    expect(sentRows(harness)).toEqual([]);

    form().update((state) => withOfficerField(state, 0, "nombre", "Ana Perez"));
    await popup.getByRole("button", { name: "+ Guardar el actual" }).click();
    await page.getByRole("dialog").getByRole("textbox").fill("");
    await userEvent.keyboard("{Enter}");
    await expect.element(page.getByRole("status")).toHaveTextContent('Asesor "Ana Perez" guardado');
  });

  it("the window of the name can be left without saving", async () => {
    const { form, harness, popup } = await open(ROWS, 0);
    form().update((state) => withOfficerField(state, 0, "nombre", "Ana Perez"));
    await popup.getByRole("button", { name: "+ Guardar el actual" }).click();
    await page.getByRole("button", { name: "Cancelar" }).click();
    expect(page.getByRole("dialog").query()).toBeNull();
    expect(sentRows(harness)).toEqual([]);
  });

  it("deleting asks first, and goes against the list of the cloud", async () => {
    const { harness, popup } = await open();
    await popup.getByRole("button", { name: "Eliminar Julieta" }).click();
    await expect
      .element(page.getByRole("alertdialog"))
      .toMatchTextContent(/¿Eliminar el asesor guardado "Julieta"\?/);
    await page.getByRole("button", { name: "Cancelar" }).click();
    expect(sentRows(harness)).toEqual([]);

    await popup.getByRole("button", { name: "Eliminar Julieta" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Eliminar" }).click();
    await expect.element(page.getByRole("status")).toHaveTextContent("Asesor eliminado");
    expect(sentRows(harness).at(-1)).toMatchObject([{ id: "a2" }, { id: "a3" }]);
  });

  it("a click outside closes it, once the one that opened it has gone by", async () => {
    const { onClose, popup } = await open();
    await expect.element(popup).toBeInTheDocument();
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
    await popup.getByText("Asesor 2 · guardados").click();
    expect(onClose).not.toHaveBeenCalled();
    await page.getByRole("button", { name: "Afuera" }).click();
    expect(onClose).toHaveBeenCalled();
  });

  it("closes when the search of screens opens", async () => {
    const { onClose, popup } = await open();
    await expect.element(popup).toBeInTheDocument();

    closeFloating();

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("while the list is on its way it says so", async () => {
    const answers: ((answer: Response) => void)[] = [];
    const { popup } = await open(
      () =>
        new Promise<Response>((resolve) => {
          answers.push(resolve);
        }),
    );
    await expect.element(popup).toMatchTextContent(/Cargando tus asesores…/);
    for (const answer of answers) answer(jsonResponse([]));
    await expect.element(popup).toMatchTextContent(/No tenés asesores guardados todavía\./);
  });
});
