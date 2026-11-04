import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { Menu } from "./Menu.ts";

const noop = () => undefined;

function Example({
  onItem = noop,
  defaultOpen,
}: {
  readonly onItem?: () => void;
  readonly defaultOpen?: boolean;
}) {
  return (
    <>
      <button type="button">Afuera</button>
      <Menu {...(defaultOpen === undefined ? {} : { defaultOpen })}>
        <Menu.Trigger label="Tu cuenta">AP</Menu.Trigger>
        <Menu.List label="Opciones">
          <Menu.Head name="Asesor Prueba">Asesor</Menu.Head>
          <Menu.Separator />
          <Menu.Item icon="lock" onSelect={onItem}>
            Cambiar mi clave
          </Menu.Item>
          <Menu.Label>Tema</Menu.Label>
          <Menu.Item onSelect={onItem} keepOpen>
            Modo oscuro
          </Menu.Item>
          <Menu.Item icon="logout" danger onSelect={onItem}>
            Salir
          </Menu.Item>
        </Menu.List>
      </Menu>
    </>
  );
}

describe("Menu", () => {
  it("opens and closes with its button, and says which state it is in", async () => {
    const screen = await render(<Example />);
    const trigger = screen.getByRole("button", { name: "Tu cuenta" });
    await expect.element(trigger).toHaveAttribute("aria-expanded", "false");
    await expect.element(screen.getByRole("menu")).not.toBeInTheDocument();
    await trigger.click();
    await expect.element(trigger).toHaveAttribute("aria-expanded", "true");
    await expect.element(screen.getByRole("menu", { name: "Opciones" })).toBeVisible();
    await trigger.click();
    await expect.element(screen.getByRole("menu")).not.toBeInTheDocument();
  });

  it("closes after choosing, unless the item says to stay", async () => {
    const onItem = vi.fn<() => void>();
    const screen = await render(<Example onItem={onItem} defaultOpen />);
    await screen.getByRole("menuitem", { name: "Modo oscuro" }).click();
    expect(onItem).toHaveBeenCalledTimes(1);
    await expect.element(screen.getByRole("menu")).toBeVisible();
    await screen.getByRole("menuitem", { name: "Salir" }).click();
    expect(onItem).toHaveBeenCalledTimes(2);
    await expect.element(screen.getByRole("menu")).not.toBeInTheDocument();
  });

  it("closes with a press outside and with Escape, but not with a press inside", async () => {
    const screen = await render(<Example defaultOpen />);
    await screen.getByText("Asesor Prueba").click();
    await expect.element(screen.getByRole("menu")).toBeVisible();
    await screen.getByRole("button", { name: "Afuera" }).click();
    await expect.element(screen.getByRole("menu")).not.toBeInTheDocument();
    await screen.getByRole("button", { name: "Tu cuenta" }).click();
    await userEvent.keyboard("x");
    await expect.element(screen.getByRole("menu")).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect.element(screen.getByRole("menu")).not.toBeInTheDocument();
  });

  it("walks through the items with the arrows, going around", async () => {
    const screen = await render(<Example defaultOpen />);
    const first = screen.getByRole("menuitem", { name: "Cambiar mi clave" });
    const element = first.element();
    if (element instanceof HTMLElement) element.focus();
    await userEvent.keyboard("{ArrowDown}");
    await expect.element(screen.getByRole("menuitem", { name: "Modo oscuro" })).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}{ArrowUp}");
    await expect.element(screen.getByRole("menuitem", { name: "Salir" })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    await expect.element(first).toHaveFocus();
    await userEvent.keyboard("a");
    await expect.element(first).toHaveFocus();
  });

  it("refuses a part outside a Menu, with a clear message", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(render(<Menu.Separator />)).rejects.toThrow(
      "Menu.Separator must be inside a Menu",
    );
    quiet.mockRestore();
  });
});
