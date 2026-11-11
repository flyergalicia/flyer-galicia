import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { OptionBadge } from "./OptionBadge.tsx";

describe("OptionBadge", () => {
  it("says the number of the flyer in its color, and its name on hovering", async () => {
    const screen = await render(<OptionBadge option={9} label="Combustible" color="#2e7d32" />);
    const badge = screen.getByTitle("Combustible");
    await expect.element(badge).toHaveTextContent("OP.9");
    expect(getComputedStyle(badge.element()).backgroundColor).toBe("rgb(46, 125, 50)");
  });

  it("takes the space its line gives it", async () => {
    const screen = await render(
      <OptionBadge option={1} label="Opción 1" color="#000" className="apart" />,
    );
    expect(screen.getByTitle("Opción 1").element().className).toMatch(/ apart$/);
  });
});
