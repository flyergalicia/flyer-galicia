import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { ZoomControls } from "./ZoomControls.tsx";

const nothing = () => undefined;

describe("the zoom buttons", () => {
  it("say how much it is zoomed and what each one does", async () => {
    const onOut = vi.fn<() => void>();
    const onIn = vi.fn<() => void>();
    const onReset = vi.fn<() => void>();
    const screen = await render(
      <ZoomControls percent={125} onOut={onOut} onIn={onIn} onReset={onReset} />,
    );

    await expect.element(screen.getByTestId("zoom-percent")).toHaveTextContent("125%");
    await screen.getByRole("button", { name: "Alejar" }).click();
    await screen.getByRole("button", { name: "Acercar" }).click();
    await screen.getByRole("button", { name: "Restablecer zoom" }).click();

    expect(onOut).toHaveBeenCalledOnce();
    expect(onIn).toHaveBeenCalledOnce();
    expect(onReset).toHaveBeenCalledOnce();
  });

  it("go where the screen puts them", async () => {
    const screen = await render(
      <ZoomControls
        percent={100}
        onOut={nothing}
        onIn={nothing}
        onReset={nothing}
        className="here"
        testId="the-zoom"
      />,
    );

    expect(screen.container.querySelector(".here")).not.toBeNull();
    await expect.element(screen.getByTestId("the-zoom")).toBeVisible();
  });
});
