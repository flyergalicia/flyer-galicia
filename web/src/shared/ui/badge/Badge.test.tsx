import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { Badge } from "./Badge.tsx";

describe("Badge", () => {
  it("shows its text, in capitals only when asked", async () => {
    const screen = await render(
      <>
        <Badge tone="purple" uppercase>
          Asesor
        </Badge>
        <Badge tone="green">Activo</Badge>
      </>,
    );
    expect(getComputedStyle(screen.getByText("Asesor").element()).textTransform).toBe("uppercase");
    expect(getComputedStyle(screen.getByText("Activo").element()).textTransform).toBe("none");
  });

  it("the larger one is the one to press", async () => {
    const screen = await render(
      <>
        <Badge tone="valid" size="chip">
          Vigente: 751
        </Badge>
        <Badge tone="valid">Vigente</Badge>
      </>,
    );
    const chip = getComputedStyle(screen.getByText("Vigente: 751").element());
    const badge = getComputedStyle(screen.getByText("Vigente", { exact: true }).element());
    expect(chip.cursor).toBe("pointer");
    expect(chip.paddingLeft).toBe("12px");
    expect(badge.paddingLeft).toBe("9px");
  });

  it("with something to do, it is a button that says whether it is pressed", async () => {
    const press = vi.fn<() => void>();
    const screen = await render(
      <>
        <Badge
          tone="valid"
          size="chip"
          title="Filtrar"
          pressed
          data-testid="counter"
          onClick={press}
        >
          Vigente: 3
        </Badge>
        <Badge tone="none" size="chip" onClick={press}>
          Otra: 1
        </Badge>
      </>,
    );
    const pressed = screen.getByRole("button", { name: "Vigente: 3" });
    await expect.element(pressed).toHaveAttribute("aria-pressed", "true");
    await expect.element(pressed).toHaveAttribute("title", "Filtrar");
    await expect.element(screen.getByTestId("counter")).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Otra: 1" }))
      .toHaveAttribute("aria-pressed", "false");

    await pressed.click();
    expect(press).toHaveBeenCalledOnce();
  });

  it("a state of a promotion stays on one line", async () => {
    const screen = await render(<Badge tone="expired">Vencida</Badge>);
    expect(getComputedStyle(screen.getByText("Vencida").element()).whiteSpace).toBe("nowrap");
  });
});
