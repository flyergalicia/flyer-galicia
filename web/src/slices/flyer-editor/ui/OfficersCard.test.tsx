import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { withOfficerField, withPastedPhone } from "../model/form-state.ts";
import { openWithForm } from "../testing/form-on-screen.tsx";
import { OfficersCard } from "./OfficersCard.tsx";

const ALL = { asesores_guardados: true, pegar_oficial: true };

const LABELS = { nombre: "Nombre", celular: "Celular", email: "Email" } as const;

function field(name: `${keyof typeof LABELS}${number}`) {
  const [, kind = "nombre", number = ""] = /^(nombre|celular|email)(\d)$/.exec(name) ?? [];
  const label =
    kind === "celular" ? LABELS.celular : kind === "email" ? LABELS.email : LABELS.nombre;
  return page.getByTestId(`officer-block-${number}`).getByLabelText(label);
}

describe("the card of the officers", () => {
  it("what is written goes to the form, with its mail suggested", async () => {
    const { form } = await openWithForm(<OfficersCard />);
    await field("nombre1").fill("Ana Perez");
    await expect.element(field("email1")).toHaveValue("ana.perez@bancogalicia.com.ar");
    await field("celular1").fill("11 4444 5555");
    expect(form().getState().officers[0]).toMatchObject({
      nombre: "Ana Perez",
      celular: "11 4444 5555",
    });
  });

  it("marks a phone and a mail that are not right, without stopping anyone", async () => {
    const { screen } = await openWithForm(<OfficersCard />);
    await field("celular1").fill("11");
    await expect.element(screen.getByText(/Faltan números/)).toBeInTheDocument();
    await field("celular1").fill("11 4444 5555");
    await expect.element(screen.getByText(/Faltan números/)).not.toBeInTheDocument();
    await field("email1").fill("ana@gmail.com");
    await expect.element(screen.getByText(/Ojo: no es un mail/)).toBeInTheDocument();
    await field("email1").fill("ana@");
    await expect.element(screen.getByText(/mail/i).first()).toBeInTheDocument();
  });

  it("looks again on leaving what came written by other means", async () => {
    const { form, screen } = await openWithForm(<OfficersCard />);
    form().update((state) => withPastedPhone(state, 0, "11"));
    await expect.element(screen.getByText(/Faltan números/)).not.toBeInTheDocument();
    await field("celular1").click();
    await field("nombre1").click();
    await expect.element(screen.getByText(/Faltan números/)).toBeInTheDocument();
  });

  it("opens one more block up to four, asking for the name at once", async () => {
    const { screen } = await openWithForm(<OfficersCard />);
    const add = screen.getByTestId("add-officer");
    await add.click();
    await expect.element(field("nombre2")).toHaveFocus();
    await add.click();
    await add.click();
    await expect.element(field("nombre4")).toHaveFocus();
    await expect.element(add).not.toBeInTheDocument();
  });

  it("the first one is emptied and stays; the others go; each says so if it had data", async () => {
    const { form, screen } = await openWithForm(<OfficersCard />);
    await screen.getByTestId("remove-officer-1").click();
    await expect.element(page.getByRole("status")).toHaveTextContent("");

    await field("nombre1").fill("Ana Perez");
    await screen.getByTestId("remove-officer-1").click();
    await expect.element(page.getByRole("status")).toHaveTextContent("Datos del asesor 1 borrados");
    await expect.element(field("nombre1")).toHaveValue("");

    await screen.getByTestId("add-officer").click();
    await screen.getByTestId("remove-officer-2").click();
    await expect.element(screen.getByTestId("officer-block-2")).not.toBeInTheDocument();
    expect(form().getState().officers[1]?.on).toBe(false);

    await screen.getByTestId("add-officer").click();
    await field("nombre2").fill("Luis Gomez");
    await screen.getByTestId("remove-officer-2").click();
    await expect.element(page.getByRole("status")).toHaveTextContent("Asesor 2 quitado");
    await screen.getByTestId("add-officer").click();
    // It leaves nothing for the next one.
    await expect.element(field("nombre2")).toHaveValue("");
  });

  it("the switch hides them without erasing, and on coming back they are there", async () => {
    const { form, screen } = await openWithForm(<OfficersCard />);
    form().update((state) => withOfficerField(state, 0, "nombre", "Ana Perez"));
    const control = screen.getByRole("switch", { name: "Mostrar en el flyer" });
    await expect
      .element(control)
      .toHaveAttribute("title", "Mostrar u ocultar los oficiales en el flyer");
    await control.click();
    await expect
      .element(screen.getByTestId("officers-off"))
      .toMatchTextContent(/sale sin oficiales/);
    await expect.element(field("nombre1")).not.toBeInTheDocument();
    expect(form().getState().officers[0]?.nombre).toBe("Ana Perez");
    await control.click();
    await expect.element(field("nombre1")).toHaveValue("Ana Perez");
  });

  it("without its faculties there is no Pegar and no list", async () => {
    const { screen } = await openWithForm(<OfficersCard />, {
      faculties: { asesores_guardados: false, pegar_oficial: false },
    });
    await expect.element(screen.getByTestId("officer-block-1")).toMatchTextContent(/Asesor 1/);
    expect(screen.getByTestId("paste-button-1").query()).toBeNull();
    expect(screen.getByTestId("saved-advisors-1").query()).toBeNull();
  });

  it("Pegar opens and closes its box", async () => {
    const { screen } = await openWithForm(<OfficersCard />, { faculties: ALL });
    await screen.getByTestId("paste-button-1").click();
    await expect.element(screen.getByTestId("paste-box-1")).toBeInTheDocument();
    await screen.getByTestId("add-officer").click();
    await screen.getByTestId("paste-button-2").click();
    await expect.element(screen.getByTestId("paste-box-2")).toBeInTheDocument();
    await expect.element(screen.getByTestId("paste-box-1")).toBeInTheDocument();
    await screen.getByTestId("paste-button-1").click();
    await expect.element(screen.getByTestId("paste-box-1")).not.toBeInTheDocument();
  });

  it("the title opens the saved advisors of that place, and pressing it again closes them", async () => {
    const { screen } = await openWithForm(<OfficersCard />, { faculties: ALL });
    await screen.getByTestId("add-officer").click();
    await screen.getByTestId("saved-advisors-2").click();
    await expect.element(page.getByTestId("saved-advisors")).toMatchTextContent(/Asesor 2 ·/);
    await screen.getByTestId("saved-advisors-2").click();
    await expect.element(page.getByTestId("saved-advisors")).not.toBeInTheDocument();
  });
});
