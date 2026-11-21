import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { PhonePill } from "./PhonePill.tsx";

function pressed(name: string) {
  return page.getByRole("button", { name, exact: true });
}

function preview(top: number) {
  const box = document.createElement("div");
  box.dataset["testid"] = "flyer-preview";
  box.style.cssText = `position:fixed;top:${String(top)}px;height:10px`;
  document.body.append(box);
  return box;
}

afterEach(() => {
  document.querySelector('[data-testid="flyer-preview"]')?.remove();
  vi.restoreAllMocks();
});

describe("the pill of the phone", () => {
  it("goes down to the flyer and back up", async () => {
    const box = preview(600);
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    await render(<PhonePill onDownload={() => undefined} />);
    await expect.element(pressed("Editar")).toHaveAttribute("aria-pressed", "true");

    await pressed("Vista previa").click();
    await expect.element(pressed("Vista previa")).toHaveAttribute("aria-pressed", "true");
    expect(scrollTo).toHaveBeenLastCalledWith({
      top: 600 + window.scrollY - 70,
      behavior: "smooth",
    });

    await pressed("Editar").click();
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: "smooth" });
    box.remove();
  });

  it("follows what the page shows", async () => {
    const box = preview(window.innerHeight);
    await render(<PhonePill onDownload={() => undefined} />);
    box.style.top = "0px";
    window.dispatchEvent(new Event("scroll"));
    await expect.element(pressed("Vista previa")).toHaveAttribute("aria-pressed", "true");
    box.style.top = `${String(window.innerHeight)}px`;
    window.dispatchEvent(new Event("scroll"));
    await expect.element(pressed("Editar")).toHaveAttribute("aria-pressed", "true");
  });

  it("with no flyer yet it stays, and goes to the top", async () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    await render(<PhonePill onDownload={() => undefined} />);
    window.dispatchEvent(new Event("scroll"));
    await expect.element(pressed("Editar")).toHaveAttribute("aria-pressed", "true");
    await pressed("Vista previa").click();
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: "smooth" });
  });

  it("downloads, and stops listening when it goes away", async () => {
    const onDownload = vi.fn<() => void>();
    const stop = vi.spyOn(window, "removeEventListener");
    const screen = await render(<PhonePill onDownload={onDownload} />);
    await page.getByRole("button", { name: "Descargar PDF" }).click();
    expect(onDownload).toHaveBeenCalledTimes(1);
    await screen.unmount();
    expect(stop).toHaveBeenCalledWith("scroll", expect.any(Function));
  });
});
