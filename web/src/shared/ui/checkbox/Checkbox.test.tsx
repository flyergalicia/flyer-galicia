import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { Checkbox } from "./Checkbox.tsx";

describe("Checkbox", () => {
  it("changes by pressing its text", async () => {
    const onChange = vi.fn<() => void>();
    const screen = await render(<Checkbox onChange={onChange}>Incluir MODO</Checkbox>);
    await screen.getByText("Incluir MODO").click();
    await expect.element(screen.getByRole("checkbox", { name: "Incluir MODO" })).toBeChecked();
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("keeps a class from outside and can be off limits", async () => {
    const screen = await render(
      <Checkbox disabled className="mine">
        Incluir MODO
      </Checkbox>,
    );
    await expect.element(screen.getByRole("checkbox")).toBeDisabled();
    expect(screen.getByText("Incluir MODO").element().className).toContain("mine");
  });
});
