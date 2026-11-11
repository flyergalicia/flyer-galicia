import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { Button } from "./Button.tsx";

describe("Button", () => {
  it("does what it says when pressed", async () => {
    const onClick = vi.fn<() => void>();
    const screen = await render(<Button onClick={onClick}>Descargar PDF</Button>);
    await screen.getByRole("button", { name: "Descargar PDF" }).click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("is a plain button, so that it does not send the form it is in", async () => {
    const screen = await render(<Button>Cancelar</Button>);
    await expect.element(screen.getByRole("button")).toHaveAttribute("type", "button");
  });

  it("can send a form when asked", async () => {
    const screen = await render(<Button type="submit">Ingresar</Button>);
    await expect.element(screen.getByRole("button")).toHaveAttribute("type", "submit");
  });

  it("cannot be pressed twice while it is working, and says so", async () => {
    const onClick = vi.fn<() => void>();
    const screen = await render(
      <Button busy onClick={onClick}>
        Generando…
      </Button>,
    );
    const button = screen.getByRole("button");
    await expect.element(button).toBeDisabled();
    await expect.element(button).toHaveAttribute("aria-busy", "true");
    await button.click({ force: true });
    expect(onClick).not.toHaveBeenCalled();
  });

  it("does not claim to be busy when it is only disabled", async () => {
    const screen = await render(<Button disabled>Guardar</Button>);
    await expect.element(screen.getByRole("button")).toBeDisabled();
    await expect.element(screen.getByRole("button")).not.toHaveAttribute("aria-busy");
  });

  it("takes the whole width when asked, and keeps a class from outside", async () => {
    const screen = await render(
      <div style={{ width: 300 }}>
        <Button fullWidth className="mine" icon="download">
          Ingresar
        </Button>
      </div>,
    );
    const button = screen.getByRole("button");
    await expect.element(button).toHaveClass("mine");
    expect(button.element().getBoundingClientRect().width).toBe(300);
    expect(button.element().querySelector("svg")).not.toBeNull();
  });

  it("has every variant and size in a style of its own", async () => {
    const variants = [
      "primary",
      "secondary",
      "ghost",
      "blue",
      "green",
      "soft-danger",
      "soft-ok",
      "soft-neutral",
      "soft-muted",
      "link",
    ] as const;
    const screen = await render(
      <>
        {variants.map((variant) => (
          <Button key={variant} variant={variant}>
            {variant}
          </Button>
        ))}
        <Button size="icon">🗑</Button>
      </>,
    );
    for (const variant of variants) {
      const className = screen.getByRole("button", { name: variant }).element().className;
      expect(className).toContain(variant);
    }
    expect(screen.getByRole("button", { name: "🗑" }).element().className).toContain("icon-size");
  });
});
