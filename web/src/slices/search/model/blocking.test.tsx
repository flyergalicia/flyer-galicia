import { afterEach, describe, expect, it } from "vitest";
import { searchBlock, WINDOW_OPEN_NOTICE, windowInTheWay } from "./blocking.ts";

function place(html: string): HTMLElement {
  const box = document.createElement("div");
  box.innerHTML = html;
  document.body.append(box);
  return box;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("what keeps the search from opening", () => {
  it("is nothing on a quiet screen", () => {
    place('<div role="tablist"></div><div role="menu"></div>');
    expect(searchBlock(false)).toBe("");
  });

  it("is a ZIP being generated, before anything else", () => {
    place('<div role="alertdialog">¿Seguro?</div>');
    expect(searchBlock(true)).toBe("Esperá a que termine de generar el ZIP.");
  });

  it.each([
    ['<div role="alertdialog">¿Seguro?</div>'],
    ['<dialog open aria-modal="true">Vista previa</dialog>'],
    ['<div role="dialog">Una ventana</div>'],
    ['<div aria-modal="true">Otra</div>'],
  ])("is a window open: %s", (html) => {
    place(html);
    expect(searchBlock(false)).toBe(WINDOW_OPEN_NOTICE);
  });

  it("is not a window that is a screen, but a question inside it is", () => {
    const panel = place(
      '<dialog open aria-modal="true" data-screen-window="">Panel</dialog>',
    ).querySelector("dialog");
    expect(windowInTheWay()).toBe(false);
    panel?.insertAdjacentHTML("beforeend", '<div role="alertdialog">¿Quitar?</div>');
    expect(windowInTheWay()).toBe(true);
  });

  it("is not a window that is there but hidden", () => {
    place('<div role="dialog" style="display: none">Escondida</div>');
    expect(windowInTheWay()).toBe(false);
  });
});
