import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { GaliciaLogo } from "./GaliciaLogo.tsx";

describe("GaliciaLogo", () => {
  it("is announced by its name and takes the class it is given", async () => {
    const screen = await render(<GaliciaLogo className="grande" />);

    await expect.element(screen.getByRole("img", { name: "Galicia" })).toHaveClass("grande");
  });
});
