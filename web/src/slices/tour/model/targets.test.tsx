// What each step lights, on a page made for the test.
import { afterEach, describe, expect, it } from "vitest";
import {
  commercialTabsOnPage,
  commercialTarget,
  screenLoading,
  selectorsOf,
  TARGETS,
  targetOf,
  visibleTarget,
} from "./targets.ts";

function place(html: string): HTMLElement {
  const box = document.createElement("div");
  box.innerHTML = html;
  document.body.append(box);
  return box;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("what a step lights", () => {
  it("is found by what it says of itself, never by a class (invariant 17)", () => {
    const selectors = [
      ...Object.values(TARGETS),
      ...selectorsOf(commercialTarget("empresas")),
      ...selectorsOf("download"),
    ];
    const byClass = selectors.filter(
      (selector) =>
        /\.[A-Za-z_-]/.test(selector.replace(/"[^"]*"/g, "")) || selector.includes("[class"),
    );

    expect(byClass).toEqual([]);
    expect(TARGETS.download).toBe('[data-testid="download-pdf"]');
    expect(TARGETS.preview).toBe('[data-testid="preview-button"]');
    expect(TARGETS.restore).toBe('[data-testid="restore-button"]');
    expect(TARGETS.others).toBe('[data-testid="other-actions"]');
  });

  it("in Gestiones is its solapa, or the tab of the header while its code is coming", () => {
    const header = place('<button data-tab-id="gestiones">Gestiones</button>');
    expect(commercialTabsOnPage()).toBe(false);
    expect(targetOf(commercialTarget("agenda"))).toBe(header.firstElementChild);

    const inside = place(
      '<div data-testid="commercial-tabs"><button data-tab="agenda">Agenda</button></div>',
    );
    expect(commercialTabsOnPage()).toBe(true);
    expect(targetOf(commercialTarget("agenda"))).toBe(inside.querySelector("[data-tab]"));
    expect(targetOf(commercialTarget("empresas"))).toBe(header.firstElementChild);
  });

  it("is lit only when it is seen: with a size, and not hidden", () => {
    place(`
      <button data-testid="download-pdf">Descargar PDF</button>
      <button data-testid="restore-button" style="visibility: hidden">Restaurar</button>
      <button data-testid="preview-button" hidden>Vista previa</button>
    `);

    expect(visibleTarget("download")).not.toBeNull();
    expect(visibleTarget("restore")).toBeNull();
    expect(visibleTarget("preview")).toBeNull();
    expect(visibleTarget("others")).toBeNull();
  });
});

describe("a screen", () => {
  it("is still coming down while its place is there and empty", () => {
    expect(screenLoading()).toBe(false);
    const main = place(
      '<main><section data-screen="hunter-screen" hidden><p>Otra</p></section><section data-screen="promotions"></section></main>',
    );
    expect(screenLoading()).toBe(true);
    main.querySelector('[data-screen="promotions"]')?.append(document.createElement("div"));
    expect(screenLoading()).toBe(false);
  });
});
