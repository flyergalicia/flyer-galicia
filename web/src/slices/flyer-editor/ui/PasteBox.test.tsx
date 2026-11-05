import { describe, expect, it } from "vitest";
import { withOfficerField } from "../model/form-state.ts";
import { openWithForm } from "../testing/form-on-screen.tsx";
import { PasteBox } from "./PasteBox.tsx";

function officerOf(form: ReturnType<Awaited<ReturnType<typeof openWithForm>>["form"]>) {
  const [first] = form.getState().officers;
  if (!first) throw new Error("There is no first officer");
  return first;
}

async function open(position = 0) {
  const { screen, form } = await openWithForm(<PasteBox position={position} />);
  return {
    form,
    screen,
    box: screen.getByRole("textbox", { name: "Datos del oficial para pegar" }),
    result: screen.getByTestId("paste-result"),
  };
}

describe("the box for pasting", () => {
  it("asks for the text as soon as it opens", async () => {
    const { box } = await open();
    await expect.element(box).toHaveFocus();
  });

  it("fills what it found and says what, and Deshacer brings back what was there", async () => {
    const { box, form, result, screen } = await open();
    form().update((state) => withOfficerField(state, 0, "nombre", "Antes Viejo"));
    await box.fill("Julieta De Santis\n11 3617-9603");

    await expect.element(result).toMatchTextContent(/✓ Nombre/);
    await expect.element(result).toMatchTextContent(/✓ Celular/);
    await expect.element(result).toMatchTextContent(/— Mail/);
    expect(officerOf(form())).toMatchObject({
      nombre: "Julieta De Santis",
      celular: "11 3617-9603",
    });

    await box.fill("Otra Persona\nana@gmail.com\nana.otra@bancogalicia.com.ar");
    await expect.element(result).toMatchTextContent(/Ignoré: 1 mail\(s\) ajenos a Galicia/);

    await screen.getByRole("button", { name: "Deshacer" }).click();
    await expect.element(result).toHaveTextContent("Deshecho — volviste a los datos de antes.");
    expect(officerOf(form()).nombre).toBe("Antes Viejo");
    await expect.element(box).toHaveValue("");
  });

  it("a lone phone touches only the phone", async () => {
    const { box, form, result } = await open();
    form().update((state) => withOfficerField(state, 0, "nombre", "Ana Perez"));
    await box.fill("11 4444 5555");
    await expect.element(result).toMatchTextContent(/✓ Celular/);
    expect(officerOf(form())).toMatchObject({ nombre: "Ana Perez", celular: "11 4444-5555" });
  });

  it("says when it recognized nothing, and with no text it says nothing", async () => {
    const { box, form, result } = await open();
    await box.fill("???");
    await expect
      .element(result)
      .toMatchTextContent(/No reconocí ningún dato\. Revisá el texto pegado\./);
    expect(officerOf(form()).nombre).toBe("");
    await box.fill("   ");
    await expect.element(result).toHaveTextContent("");
  });

  it("tells what it took out, and a box out of the list does nothing", async () => {
    const { box, form, result } = await open();
    await box.fill("Ana Perez +54 9 11 4444-5555");
    await expect.element(result).toMatchTextContent(/Celular: pegaste "\+54 9 11 4444-5555"/);
    expect(officerOf(form()).celular).toBe("11 4444-5555");
  });

  it("with an officer that is not there, nothing happens", async () => {
    const { box, result } = await open(99);
    await box.fill("Ana Perez");
    await new Promise((resolve) => {
      setTimeout(resolve, 250);
    });
    await expect.element(result).toHaveTextContent("");
  });
});
