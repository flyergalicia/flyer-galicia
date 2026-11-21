import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { Input, Select, Textarea } from "./controls.tsx";
import { Field } from "./Field.ts";

describe("Field", () => {
  it("finds its control by its label", async () => {
    const screen = await render(
      <Field>
        <Field.Label>Nombre</Field.Label>
        <Field.Input placeholder="Nombre Asesor 1" />
      </Field>,
    );
    await expect
      .element(screen.getByLabelText("Nombre"))
      .toHaveAttribute("placeholder", "Nombre Asesor 1");
  });

  it("does not show the message while there is nothing to say", async () => {
    const screen = await render(
      <Field>
        <Field.Label>Email</Field.Label>
        <Field.Input />
        <Field.Message>Falta la arroba del mail.</Field.Message>
      </Field>,
    );
    await expect.element(screen.getByText("Falta la arroba del mail.")).not.toBeInTheDocument();
    await expect.element(screen.getByLabelText("Email")).not.toHaveAttribute("aria-invalid");
    await expect.element(screen.getByLabelText("Email")).not.toHaveAttribute("aria-describedby");
  });

  it("marks a wrong value and ties the message to it, and it can still be edited", async () => {
    const screen = await render(
      <Field status="invalid">
        <Field.Label>Email</Field.Label>
        <Field.Input defaultValue="ana.perez" />
        <Field.Message>Falta la arroba del mail.</Field.Message>
      </Field>,
    );
    const input = screen.getByLabelText("Email");
    await expect.element(input).toHaveAttribute("aria-invalid", "true");
    await expect.element(input).toHaveAccessibleDescription("Falta la arroba del mail.");
    await input.fill("ana.perez@bancogalicia.com.ar");
    await expect.element(input).toHaveValue("ana.perez@bancogalicia.com.ar");
  });

  it("warns without marking the value as wrong", async () => {
    const screen = await render(
      <Field status="warning">
        <Field.Label>Celular</Field.Label>
        <Field.Input defaultValue="11" />
        <Field.Message>Parece corto.</Field.Message>
      </Field>,
    );
    await expect.element(screen.getByLabelText("Celular")).not.toHaveAttribute("aria-invalid");
    await expect
      .element(screen.getByLabelText("Celular"))
      .toHaveAccessibleDescription("Parece corto.");
  });

  it("gives each field its own control", async () => {
    const screen = await render(
      <>
        <Field>
          <Field.Label>Uno</Field.Label>
          <Field.Input defaultValue="1" />
        </Field>
        <Field className="otro">
          <Field.Label>Dos</Field.Label>
          <Field.Input defaultValue="2" />
        </Field>
      </>,
    );
    await expect.element(screen.getByLabelText("Uno")).toHaveValue("1");
    await expect.element(screen.getByLabelText("Dos")).toHaveValue("2");
  });

  it("also works with a list and a long text", async () => {
    const onChange = vi.fn<() => void>();
    const screen = await render(
      <>
        <Field>
          <Field.Label>Provincia</Field.Label>
          <Field.Select defaultValue="b" onChange={onChange}>
            <option value="a">Capital Federal</option>
            <option value="b">Buenos Aires</option>
          </Field.Select>
        </Field>
        <Field status="invalid">
          <Field.Label>Legal</Field.Label>
          <Field.Textarea defaultValue="texto" />
        </Field>
      </>,
    );
    await screen.getByLabelText("Provincia").selectOptions("a");
    expect(onChange).toHaveBeenCalledOnce();
    await expect.element(screen.getByLabelText("Legal")).toHaveValue("texto");
    await expect.element(screen.getByLabelText("Legal")).toHaveAttribute("aria-invalid", "true");
  });

  it("refuses a part outside a Field, with a clear message", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(render(<Field.Label>Sola</Field.Label>)).rejects.toThrow(
      "Field.Label must be inside a Field",
    );
    quiet.mockRestore();
  });

  it("lets the controls be used alone, with a size and a shadow", async () => {
    const screen = await render(
      <>
        <Input id="alone" aria-label="Sola" controlSize="lg" elevated className="mine" />
        <Textarea id="note" aria-label="Nota" className="mine" />
        <Select id="list" aria-label="Lista" appearance="native" className="mine">
          <option>Todos</option>
        </Select>
      </>,
    );
    await expect.element(screen.getByLabelText("Sola")).toHaveClass("mine");
    await expect.element(screen.getByLabelText("Sola")).toHaveAttribute("id", "alone");
    await expect.element(screen.getByLabelText("Sola")).toHaveAttribute("type", "text");
    await expect.element(screen.getByLabelText("Nota")).toHaveAttribute("id", "note");
    await expect.element(screen.getByLabelText("Lista")).toHaveAttribute("id", "list");
  });
});
