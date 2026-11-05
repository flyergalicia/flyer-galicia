import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { useIsPhone } from "./use-is-phone.ts";

function Shows() {
  return <output>{useIsPhone() ? "Teléfono" : "Computadora"}</output>;
}

afterEach(async () => {
  await page.viewport(1280, 800);
});

describe("the width of a phone", () => {
  it("follows the screen, and stops when it goes away", async () => {
    await page.viewport(1280, 800);
    const screen = await render(<Shows />);
    await expect.element(screen.getByRole("status")).toHaveTextContent("Computadora");
    await page.viewport(800, 800);
    await expect.element(screen.getByRole("status")).toHaveTextContent("Teléfono");
    await screen.unmount();
  });
});
