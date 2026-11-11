import { describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { DecisionDialog } from "./DecisionDialog.ts";

function open({ wide = false } = {}) {
  const onNo = vi.fn<() => void>();
  const onYes = vi.fn<() => void>();
  void render(
    <DecisionDialog title="Actualizar" wide={wide}>
      <DecisionDialog.Text>Generaste el flyer:</DecisionDialog.Text>
      <DecisionDialog.Text separated>Otra cosa</DecisionDialog.Text>
      <DecisionDialog.Alert>Cuidado</DecisionDialog.Alert>
      <DecisionDialog.List>
        <DecisionDialog.Item>Cashback</DecisionDialog.Item>
        <DecisionDialog.Item danger>Se quita</DecisionDialog.Item>
      </DecisionDialog.List>
      <DecisionDialog.Field label="CUIT" id="cuit">
        <input id="cuit" type="text" />
        <DecisionDialog.Hint>Opcional</DecisionDialog.Hint>
        <DecisionDialog.Hint warn>Ojo</DecisionDialog.Hint>
      </DecisionDialog.Field>
      <DecisionDialog.Foot>
        <DecisionDialog.No onClick={onNo}>No</DecisionDialog.No>
        <DecisionDialog.Yes onClick={onYes}>Sí</DecisionDialog.Yes>
      </DecisionDialog.Foot>
    </DecisionDialog>,
  );
  return { onNo, onYes };
}

const dialog = () => page.getByRole("dialog", { name: "Actualizar" });

describe("the window that asks", () => {
  it("says it is a window, with its title", async () => {
    open();

    await expect.element(dialog()).toBeVisible();
    await expect.element(dialog()).toHaveAttribute("aria-modal", "true");
    await expect.element(page.getByLabelText("CUIT")).toBeVisible();
  });

  it("each button does what it says", async () => {
    const { onNo, onYes } = open();

    await page.getByRole("button", { name: "No" }).click();
    await page.getByRole("button", { name: "Sí" }).click();

    expect(onNo).toHaveBeenCalledOnce();
    expect(onYes).toHaveBeenCalledOnce();
  });

  it("only its buttons close it: not a click outside, not Escape", async () => {
    const { onNo } = open();
    await expect.element(dialog()).toBeVisible();

    await userEvent.click(dialog().element().parentElement ?? document.body, {
      position: { x: 2, y: 2 },
    });
    await userEvent.keyboard("{Escape}");

    await expect.element(dialog()).toBeVisible();
    expect(onNo).not.toHaveBeenCalled();
  });

  it("marks what is a loss", async () => {
    open();

    await expect.element(page.getByText("Se quita")).toHaveAttribute("data-danger", "true");
    await expect.element(page.getByText("Cashback")).toHaveAttribute("data-danger", "false");
  });

  it("a button can be off", async () => {
    const onClick = vi.fn<() => void>();
    void render(
      <DecisionDialog title="Con botón apagado">
        <DecisionDialog.No onClick={onClick} disabled>
          No
        </DecisionDialog.No>
        <DecisionDialog.Yes onClick={onClick} disabled>
          Sí
        </DecisionDialog.Yes>
      </DecisionDialog>,
    );

    await expect.element(page.getByRole("button", { name: "No" })).toBeDisabled();
    await expect.element(page.getByRole("button", { name: "Sí" })).toBeDisabled();
  });

  it("the one with a form is wider", async () => {
    await page.viewport(1000, 700);
    open({ wide: true });
    await expect.element(dialog()).toBeVisible();

    const { width } = dialog().element().getBoundingClientRect();
    expect(width).toBeGreaterThan(430);
  });
});
