import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { Switch } from "./Switch.tsx";

describe("Switch", () => {
  it("asks for the opposite of what it shows", async () => {
    const onChange = vi.fn<(checked: boolean) => void>();
    const screen = await render(<Switch checked onChange={onChange} label="Mostrar" />);
    const control = screen.getByRole("switch", { name: "Mostrar" });
    await expect.element(control).toBeChecked();
    await control.click();
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("turns on when it is off", async () => {
    const onChange = vi.fn<(checked: boolean) => void>();
    const screen = await render(<Switch checked={false} onChange={onChange} label="Mostrar" />);
    await expect.element(screen.getByRole("switch")).not.toBeChecked();
    await screen.getByRole("switch").click();
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("does not react when it is off limits", async () => {
    const onChange = vi.fn<(checked: boolean) => void>();
    const screen = await render(<Switch checked onChange={onChange} label="Mostrar" disabled />);
    await screen.getByRole("switch").click({ force: true });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("in a row, the whole row can be pressed and names it", async () => {
    const onChange = vi.fn<(checked: boolean) => void>();
    const screen = await render(
      <Switch checked={false} onChange={onChange}>
        Oficiales por sede
      </Switch>,
    );
    await screen.getByRole("switch", { name: "Oficiales por sede" }).click();
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
