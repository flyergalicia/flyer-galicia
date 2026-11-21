import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ConfirmDialog } from "./ConfirmDialog.tsx";

const base = { title: "¿Desactivar?", confirmLabel: "Desactivar" };

describe("ConfirmDialog", () => {
  it("asks, and answers with what was pressed", async () => {
    const onConfirm = vi.fn<() => void>();
    const onCancel = vi.fn<() => void>();
    const screen = await render(
      <ConfirmDialog {...base} onConfirm={onConfirm} onCancel={onCancel}>
        Se va a dejar de ver.
      </ConfirmDialog>,
    );
    await expect.element(screen.getByRole("alertdialog", { name: "¿Desactivar?" })).toBeVisible();
    await expect.element(screen.getByText("Se va a dejar de ver.")).toBeVisible();
    await screen.getByRole("button", { name: "Desactivar" }).click();
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
    await screen.getByRole("button", { name: "Cancelar" }).click();
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("Escape is the same as cancelling, never as confirming", async () => {
    const onConfirm = vi.fn<() => void>();
    const onCancel = vi.fn<() => void>();
    await render(
      <ConfirmDialog {...base} onConfirm={onConfirm} onCancel={onCancel}>
        Texto
      </ConfirmDialog>,
    );
    await userEvent.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("goes red for what cannot be undone, and the way out can have another name", async () => {
    const screen = await render(
      <ConfirmDialog
        {...base}
        danger
        cancelLabel="Volver"
        onConfirm={vi.fn<() => void>()}
        onCancel={vi.fn<() => void>()}
      >
        Texto
      </ConfirmDialog>,
    );
    const confirm = screen.getByRole("button", { name: "Desactivar" }).element();
    expect(getComputedStyle(confirm).backgroundImage).toBe("none");
    await expect.element(screen.getByRole("button", { name: "Volver" })).toBeVisible();
  });
});
