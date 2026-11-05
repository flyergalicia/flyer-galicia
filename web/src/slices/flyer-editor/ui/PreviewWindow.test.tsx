import { describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { PreviewWindow } from "./PreviewWindow.tsx";

function address() {
  const canvas = document.createElement("canvas");
  canvas.width = 200;
  canvas.height = 800;
  return canvas.toDataURL("image/png");
}

function callbacks() {
  return {
    onClose: vi.fn<() => void>(),
    onPdf: vi.fn<() => void>(),
    onPng: vi.fn<() => void>(),
    onShare: vi.fn<() => void>(),
  };
}

const previewWindow = () => page.getByRole("dialog", { name: "Vista previa" });

async function open(canShare = false) {
  const handlers = callbacks();
  await render(<PreviewWindow picture={address()} canShare={canShare} {...handlers} />);
  await expect.element(page.getByTestId("preview-window-percent")).toHaveTextContent("100%");
  return handlers;
}

describe("the window of Vista previa", () => {
  it("shows the picture it is given, and its buttons do what they say", async () => {
    const { onClose, onPdf, onPng } = await open();
    expect(page.getByTestId("preview-window-picture").element().getAttribute("src")).toMatch(
      /^data:image/,
    );
    await previewWindow().getByRole("button", { name: "PDF", exact: true }).click();
    expect(onPdf).toHaveBeenCalledOnce();
    await previewWindow().getByRole("button", { name: "PNG", exact: true }).click();
    expect(onPng).toHaveBeenCalledOnce();
    await page.getByRole("button", { name: "Cerrar" }).first().click();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("Compartir is there only when the browser can share a PDF", async () => {
    const { onShare } = await open(true);
    await previewWindow().getByRole("button", { name: "Compartir" }).click();
    expect(onShare).toHaveBeenCalledOnce();
  });

  it("without it there is no such button", async () => {
    await open(false);
    expect(previewWindow().getByRole("button", { name: "Compartir" }).query()).toBeNull();
  });

  it("its buttons of zoom go by steps, and back to the whole flyer", async () => {
    await open();
    const percent = page.getByTestId("preview-window-percent");
    await page.getByRole("button", { name: "Acercar" }).click();
    await expect.element(percent).toHaveTextContent("125%");
    await page.getByRole("button", { name: "Alejar" }).click();
    await expect.element(percent).toHaveTextContent("100%");
    await page.getByRole("button", { name: "Acercar" }).click();
    await expect
      .element(page.getByTestId("preview-window-body"))
      .toHaveAttribute("data-zoomed", "true");
    await page.getByRole("button", { name: "Ver entero" }).click();
    await expect.element(percent).toHaveTextContent("100%");
  });

  it("Escape closes it, and a press on the dark closes it too", async () => {
    const { onClose } = await open();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
    await page.getByRole("dialog").click({ position: { x: -50, y: 10 }, force: true });
    await vi.waitFor(() => {
      expect(onClose.mock.calls.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("a drag that starts on the flyer and ends on the dark does not close it", async () => {
    const { onClose } = await open();
    const picture = page.getByTestId("preview-window-picture").element();
    const overlay = page.getByRole("dialog").element().parentElement;
    if (!overlay) throw new Error("It has no background");
    picture.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    overlay.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    overlay.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onClose).not.toHaveBeenCalled();
    overlay.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    overlay.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
