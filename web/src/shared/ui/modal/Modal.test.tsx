import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { Modal } from "./Modal.ts";

function Example({ onClose }: { readonly onClose: () => void }) {
  return (
    <Modal onClose={onClose} size="wide">
      <Modal.Header icon="database">Base de datos</Modal.Header>
      <Modal.Body>
        <input aria-label="Dentro" />
      </Modal.Body>
      <Modal.Footer>
        <button type="button">Guardar</button>
      </Modal.Footer>
    </Modal>
  );
}

function focusOn(element: Element): void {
  if (element instanceof HTMLElement) element.focus();
}

function Page() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
      >
        Abrir
      </button>
      {open && (
        <Example
          onClose={() => {
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

describe("Modal", () => {
  it("is a window named by its title", async () => {
    const screen = await render(<Example onClose={vi.fn<() => void>()} />);
    await expect.element(screen.getByRole("dialog", { name: "Base de datos" })).toBeVisible();
  });

  it("one with work in progress does not close with a press on what is behind", async () => {
    const onClose = vi.fn<() => void>();
    const screen = await render(
      <Modal onClose={onClose} closeOnBackdrop={false}>
        <Modal.Header>Con trabajo</Modal.Header>
      </Modal>,
    );
    const overlay = screen.getByRole("dialog").element().parentElement ?? document.body;

    await userEvent.click(overlay, { position: { x: 2, y: 2 } });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes with its X, with Escape and with a press on what is behind", async () => {
    const onClose = vi.fn<() => void>();
    const screen = await render(<Example onClose={onClose} />);
    await screen.getByRole("button", { name: "Cerrar" }).click();
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
    const backdrop = screen.getByRole("dialog").element().parentElement;
    if (!backdrop) throw new Error("the window has no backdrop");
    await userEvent.click(backdrop, { position: { x: 2, y: 2 } });
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("does not close with a press inside, or when a drag ends on what is behind", async () => {
    const onClose = vi.fn<() => void>();
    const screen = await render(<Example onClose={onClose} />);
    await screen.getByText("Guardar").click();
    const dialog = screen.getByRole("dialog").element();
    const backdrop = dialog.parentElement;
    if (!backdrop) throw new Error("the window has no backdrop");
    dialog.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    backdrop.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    backdrop.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Escape reaches nothing behind the window", async () => {
    const behind = vi.fn<() => void>();
    window.addEventListener("keydown", behind);
    const screen = await render(<Example onClose={vi.fn<() => void>()} />);
    await expect.element(screen.getByRole("dialog")).toBeVisible();
    await userEvent.keyboard("{Escape}");
    window.removeEventListener("keydown", behind);
    expect(behind).not.toHaveBeenCalled();
  });

  it("takes the focus, keeps Tab inside and gives the focus back when it closes", async () => {
    const screen = await render(<Page />);
    const opener = screen.getByRole("button", { name: "Abrir" });
    await opener.click();
    await expect.element(screen.getByRole("dialog")).toHaveFocus();
    const close = screen.getByRole("button", { name: "Cerrar" });
    const last = screen.getByRole("button", { name: "Guardar" });
    focusOn(last.element());
    await userEvent.tab();
    await expect.element(close).toHaveFocus();
    await userEvent.tab({ shift: true });
    await expect.element(last).toHaveFocus();
    await userEvent.tab({ shift: true });
    await expect.element(screen.getByLabelText("Dentro")).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await expect.element(opener).toHaveFocus();
  });

  it("has nothing to reach with Tab when there is nothing to press", async () => {
    const screen = await render(
      <Modal onClose={vi.fn<() => void>()}>
        <span>Sólo texto</span>
      </Modal>,
    );
    await userEvent.tab();
    await expect.element(screen.getByRole("dialog")).toHaveFocus();
  });

  it("uses the last onClose it was given", async () => {
    const first = vi.fn<() => void>();
    const second = vi.fn<() => void>();
    const screen = await render(<Example onClose={first} />);
    await screen.rerender(<Example onClose={second} />);
    await userEvent.keyboard("{Escape}");
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it("has the look of the windows over the flyer", async () => {
    const screen = await render(
      <Modal look="dialog" size="wide" onClose={vi.fn<() => void>()}>
        <Modal.Title>Armar franja</Modal.Title>
      </Modal>,
    );
    const panel = screen.getByRole("dialog", { name: "Armar franja" }).element();
    expect(panel.parentElement?.className).toMatch(/dialog/);
  });

  it("has the look of the windows of Gestiones", async () => {
    const screen = await render(
      <Modal look="sheet" onClose={vi.fn<() => void>()}>
        <Modal.Title>Una ventana</Modal.Title>
      </Modal>,
    );
    await expect.element(screen.getByRole("dialog", { name: "Una ventana" })).toBeVisible();
    const overlay = document.querySelector("dialog")?.parentElement;
    expect(overlay ? getComputedStyle(overlay).zIndex : "").toBe("10000");
  });

  it("has the look of the windows of one's own account", async () => {
    const screen = await render(
      <Modal look="account" size="medium" onClose={vi.fn<() => void>()}>
        <Modal.Header>Mi cuenta</Modal.Header>
      </Modal>,
    );
    const panel = screen.getByRole("dialog", { name: "Mi cuenta" }).element();
    expect(panel.parentElement?.className).toMatch(/account/);
    expect(panel.className).toMatch(/medium/);
  });

  it("with one window on top of another, only the one on top hears Escape", async () => {
    const under = vi.fn<() => void>();
    const over = vi.fn<() => void>();
    const screen = await render(
      <Modal onClose={under}>
        <Modal.Header>Debajo</Modal.Header>
      </Modal>,
    );
    await screen.rerender(
      <Modal onClose={under}>
        <Modal.Header>Debajo</Modal.Header>
        <ConfirmDialog
          title="Encima"
          confirmLabel="Sí"
          onConfirm={vi.fn<() => void>()}
          onCancel={over}
        >
          Seguro
        </ConfirmDialog>
      </Modal>,
    );
    await expect.element(screen.getByRole("alertdialog")).toBeVisible();

    await userEvent.keyboard("{Escape}");

    expect(over).toHaveBeenCalledOnce();
    expect(under).not.toHaveBeenCalled();
  });

  it("refuses a part outside a Modal, with a clear message", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(render(<Modal.Body>Suelto</Modal.Body>)).rejects.toThrow(
      "Modal.Body must be inside a Modal",
    );
    await expect(render(<Modal.Footer>Suelto</Modal.Footer>)).rejects.toThrow(
      "Modal.Footer must be inside a Modal",
    );
    quiet.mockRestore();
  });

  it("takes a header of its own: its title names the window, and it takes a class", async () => {
    const screen = await render(
      <Modal onClose={() => undefined} className="propia">
        <Modal.Title className="titulo">Cambiar esto</Modal.Title>
      </Modal>,
    );
    const window = screen.getByRole("dialog", { name: "Cambiar esto" });
    await expect.element(window).toBeVisible();
    expect(window.element().classList.contains("propia")).toBe(true);
    await expect.element(screen.getByText("Cambiar esto")).toHaveClass("titulo");
  });
});
