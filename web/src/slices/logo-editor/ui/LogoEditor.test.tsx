import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import { forgetPickerFilters } from "../model/brand-picker.ts";
import {
  brand,
  CATALOG,
  client,
  DAYS_TEXT,
  drag,
  handles,
  key,
  LOGO_A,
  LOGO_B,
  LOGO_C,
  openEditor,
  paintedLogo,
  theEditor,
  touch,
  waitForFlyer,
} from "../testing/editor-cloud.ts";

const NOOP = (): void => undefined;
const FREE_BOX = { x: 600, y: 500, w: 100, h: 60 };
const MIDDLE_A = [LOGO_A.x + 40, LOGO_A.y + 30] as const;
const MIDDLE_B = [LOGO_B.x + 40, LOGO_B.y + 20] as const;
const MIDDLE_C = [LOGO_C.x + 40, LOGO_C.y + 20] as const;

function dialog() {
  return page.getByRole("dialog");
}

async function enter() {
  await waitForFlyer();
  await page.getByRole("button", { name: "Cambiar logos" }).click();
  await expect.element(page.getByRole("button", { name: "Listo" })).toBeVisible();
}

async function waitForCards() {
  await expect.element(page.getByTestId("brand-card").first()).toBeVisible();
}

async function pickBrand(title: string) {
  await page.getByTestId("brand-card").filter({ hasText: title }).first().click();
  await expect.element(dialog()).not.toBeInTheDocument();
}

async function put(at: readonly [number, number], title: string) {
  touch(at[0], at[1]);
  await waitForCards();
  await pickBrand(title);
}

function placed(index = 0) {
  const entry = theEditor().active()[index];
  if (!entry) throw new Error(`There is no change number ${index}`);
  return entry;
}

function adjust() {
  return page.getByRole("toolbar", { name: "Ajustar el elemento elegido" });
}

function settled() {
  return vi.waitFor(() => {
    expect(theEditor().isSettled()).toBe(true);
  });
}

beforeEach(async () => {
  handles.editor = null;
  localStorage.clear();
  forgetPickerFilters();
  await page.viewport(1366, 800);
});

afterEach(() => {
  handles.editor = null;
});

describe("Cambiar logos", () => {
  it("enters and leaves, and says what to do while editing", async () => {
    await openEditor();
    await enter();
    await expect.element(page.getByText(/Tocá un logo o un texto/)).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Deshacer" })).toBeDisabled();
    await expect.element(page.getByRole("button", { name: "Marcas guardadas" })).toBeVisible();
    await page.getByRole("button", { name: "Listo" }).click();
    await expect.element(page.getByRole("button", { name: "Cambiar logos" })).toBeVisible();
    await expect.element(page.getByText(/Tocá un logo o un texto/)).not.toBeInTheDocument();
    expect(theEditor().getState().on).toBe(false);
  });

  it("does not enter on a flyer that did not load", async () => {
    await openEditor({ droppedFiles: ["_active9.json"] });
    await vi.waitFor(() => {
      expect(page.getByRole("button", { name: "Cambiar logos" }).element()).toBeTruthy();
    });
    await page.getByRole("button", { name: "Cambiar logos" }).click();
    await expect
      .element(page.getByRole("status"), { timeout: 15_000 })
      .toMatchTextContent(/No se pudo cargar el flyer|todavía se está cargando/);
    await vi.waitFor(() => {
      expect(handles.editor?.getState().on).toBe(false);
    });
  });

  it("the window says what it found, and a brand takes its place in one step", async () => {
    await openEditor();
    await enter();
    touch(...MIDDLE_A);
    await waitForCards();
    await expect.element(dialog()).toHaveAccessibleName("Cambiar esto");
    await expect.element(page.getByTestId("picker-thumbnail")).toBeVisible();
    await expect.element(page.getByText(/6 marcas|5 marcas|marcas vigentes/)).toBeVisible();
    await pickBrand("Adidas");
    expect(placed()).toMatchObject({ t: "Adidas", img: "Adidas.png" });
    expect(theEditor().getState().selected).toBe(0);
    await expect.element(adjust()).toBeVisible();
    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("Listo: Adidas en este flyer.");
    await settled();
    expect(theEditor().getState().history.steps).toHaveLength(2);
    await expect
      .element(page.getByRole("button", { name: "Volver el cambio al original" }))
      .toBeVisible();
    await page.getByRole("button", { name: "Volver el cambio al original" }).click();
    expect(theEditor().active()).toEqual([]);
  });

  it("says when there is no logo there, or it is too big to be one", async () => {
    await openEditor({
      blocks: [
        { x: 0, y: 300, w: 800, h: 40, color: "#111111" },
        { ...LOGO_A, y: 40 },
      ],
    });
    await enter();
    touch(700, 700);
    await expect.element(page.getByRole("status")).toMatchTextContent(/Ahí no hay ningún logo/);
    touch(400, 320);
    await expect.element(page.getByRole("status")).toMatchTextContent(/no encontré un logo suelto/);
  });

  it("a box on a free place adds; the window offers less, and goes back to the flyer", async () => {
    await openEditor();
    await enter();
    drag([FREE_BOX.x, FREE_BOX.y], [FREE_BOX.x + FREE_BOX.w, FREE_BOX.y + FREE_BOX.h]);
    await waitForCards();
    await expect.element(dialog()).toHaveAccessibleName("Agregar acá");
    await expect
      .element(page.getByRole("button", { name: "Dejar el lugar vacío" }))
      .not.toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: "Mover o agrandar lo que hay" }))
      .not.toBeInTheDocument();
    await page.getByRole("button", { name: "Cancelar" }).click();
    expect(theEditor().active()).toEqual([]);
    drag([FREE_BOX.x, FREE_BOX.y], [FREE_BOX.x + 2, FREE_BOX.y + 2]);
    expect(theEditor().getState().picker).toBeNull();
  });

  it("warns when the box cuts a drawing", async () => {
    await openEditor();
    await enter();
    drag([LOGO_A.x - 40, LOGO_A.y - 10], [LOGO_A.x + 20, LOGO_A.y + 40]);
    await expect.element(page.getByText(/corta parte de otro dibujo/)).toBeVisible();
    await dialog().getByRole("button", { name: "Cerrar" }).click();
  });

  it("filters the brands of the window", async () => {
    await openEditor();
    await enter();
    touch(...MIDDLE_A);
    await waitForCards();
    const search = page.getByRole("searchbox", { name: "Buscar marca" });
    await search.fill("farmacia");
    await expect.element(page.getByTestId("brand-list")).toHaveAttribute("data-search", "farmacia");
    await expect.element(page.getByTestId("brand-title")).toHaveTextContent("Farmacia Del Pueblo");
    await search.fill("nada de nada");
    await expect.element(page.getByText(/No hay promos vigentes/)).toBeVisible();
    await search.fill("");
    await page.getByRole("combobox", { name: "Rubro" }).selectOptions("Mascotas");
    await expect.element(page.getByTestId("brand-title")).toHaveTextContent("Puppis");
    await page.getByRole("combobox", { name: "Rubro" }).selectOptions("");
    await page.getByRole("checkbox", { name: "Sin las de compra online" }).click();
    await expect
      .element(page.getByTestId("brand-title").filter({ hasText: "Farmacia" }))
      .not.toBeInTheDocument();
    await page.getByRole("checkbox", { name: "Sin las de compra online" }).click();
    await page.getByRole("checkbox", { name: "Sólo súper con % de descuento" }).click();
    await expect.element(page.getByTestId("brand-title")).toHaveTextContent("Coto");
    await expect.element(page.getByTestId("percent-dot")).toBeVisible();
    await expect.element(page.getByText("2 promos")).toBeVisible();
    await page.getByRole("checkbox", { name: "Sólo súper con % de descuento" }).click();
    await page.getByRole("checkbox", { name: "Juntar sucursales de la misma marca" }).click();
    await page.getByRole("checkbox", { name: "Incluir MODO" }).click();
    await dialog().getByRole("button", { name: "Cerrar" }).click();
  });

  it("filters by locality and, if it cannot be asked, says so and shows the province", async () => {
    let answers = 0;
    await openEditor({
      edge: () => {
        answers += 1;
        return answers === 1
          ? jsonResponse({ data: { ids: ["Adidas-"] } })
          : new Response("{}", { status: 500 });
      },
    });
    await enter();
    touch(...MIDDLE_A);
    await waitForCards();
    await page.getByTestId("brand-province").selectOptions("MENDOZA");
    await page.getByTestId("brand-locality").selectOptions("LUJAN");
    await expect.element(page.getByTestId("brand-title").first()).toHaveTextContent("Adidas");
    await expect.element(page.getByText(/en Lujan/)).toBeVisible();
    await page.getByTestId("brand-locality").selectOptions("");
    await page.getByTestId("brand-locality").selectOptions("GODOY CRUZ");
    await expect
      .element(page.getByRole("status"), { timeout: 15_000 })
      .toMatchTextContent(/No se pudo filtrar por localidad/);
    await page.getByTestId("brand-province").selectOptions("");
    await dialog().getByRole("button", { name: "Cerrar" }).click();
  });

  it("a supermarket brings its days, and takes away those it does not have", async () => {
    await openEditor({
      catalog: [
        brand("Coto", { subtitulo: "Supermercados", beneficio: "25% de ahorro.", dias: "Martes" }),
        brand("Disco", { subtitulo: "Supermercados", beneficio: "6 cuotas", dias: "Lunes" }),
      ],
    });
    await enter();
    touch(...MIDDLE_A);
    await waitForCards();
    await pickBrand("Coto");
    await expect
      .element(page.getByRole("status"))
      .toMatchTextContent(/con sus días de descuento \(Martes\)/);
    expect(
      theEditor()
        .active()
        .map(({ tipo, texto }) => [tipo, texto]),
    ).toEqual([
      [undefined, undefined],
      ["txt", "Martes"],
    ]);
    expect(placed(1).ty).toBeGreaterThanOrEqual(DAYS_TEXT.y - 2);
    touch(...MIDDLE_B);
    await waitForCards();
    await pickBrand("Disco");
    await expect.element(page.getByRole("status")).toMatchTextContent(/Listo: Disco/);
    touch(...MIDDLE_C);
    await waitForCards();
    await page.getByRole("checkbox", { name: /Si es un súper/ }).click();
    await pickBrand("Coto");
    expect(
      theEditor()
        .active()
        .filter(({ tipo }) => tipo === "txt"),
    ).toHaveLength(1);
  });

  it("a logo that cannot be brought is said, and the window stays open", async () => {
    await openEditor({ fetchLogo: () => Promise.reject(new Error("No")) });
    await enter();
    touch(...MIDDLE_A);
    await waitForCards();
    await page.getByTestId("brand-card").filter({ hasText: "Adidas" }).first().click();
    await expect
      .element(page.getByRole("status"))
      .toMatchTextContent(/No se pudo bajar el logo de Adidas/);
    await expect.element(dialog()).toBeVisible();
    await page.getByRole("button", { name: "Cancelar" }).click();
  });

  it("a logo that arrives late, with the window closed, does not fall on the flyer", async () => {
    let arrive: (blob: Blob) => void = NOOP;
    await openEditor({
      fetchLogo: () =>
        new Promise((resolve) => {
          arrive = resolve;
        }),
    });
    await enter();
    touch(...MIDDLE_A);
    await waitForCards();
    await page.getByTestId("brand-card").filter({ hasText: "Adidas" }).first().click();
    await page.getByRole("button", { name: "Cancelar" }).click();
    arrive(await paintedLogo(60, 60));
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    expect(theEditor().active()).toEqual([]);
  });

  it("writes a text, with the color it had, and edits it", async () => {
    await openEditor();
    await enter();
    touch(DAYS_TEXT.x + 20, DAYS_TEXT.y + 6);
    await expect.element(page.getByRole("button", { name: "Escribir un texto" })).toBeVisible();
    await page.getByRole("button", { name: "Escribir un texto" }).click();
    await page.getByRole("button", { name: "Poner el texto" }).click();
    await expect.element(page.getByRole("status")).toHaveTextContent("Escribí el texto primero.");
    const field = page.getByRole("textbox", { name: /^Texto/ });
    await field.fill("Lunes\ny martes");
    await expect.element(page.getByTestId("text-color-name")).toHaveTextContent("Como estaba");
    await page.getByRole("radio", { name: "Azul" }).click({ force: true });
    await expect.element(page.getByTestId("text-color-name")).toHaveTextContent("Azul");
    await page.getByRole("checkbox", { name: "Negrita" }).click();
    await page.getByRole("slider", { name: "Tamaño del texto" }).fill("40");
    await page.getByRole("button", { name: "← Elegir una marca" }).click();
    await waitForCards();
    await page.getByRole("button", { name: "Escribir un texto" }).click();
    await field.fill("Lunes");
    await page.getByRole("button", { name: "Poner el texto" }).click();
    await expect.element(dialog()).not.toBeInTheDocument();
    expect(placed()).toMatchObject({
      tipo: "txt",
      texto: "Lunes",
      color: "#0B2C5F",
      peso: 700,
      fs: 40,
    });
    await adjust().getByRole("button", { name: "Editar texto" }).click();
    await expect
      .element(page.getByRole("button", { name: "← Elegir una marca" }))
      .not.toBeInTheDocument();
    await field.fill("Martes");
    await page.getByRole("button", { name: "Poner el texto" }).click();
    expect(theEditor().active()).toHaveLength(1);
    expect(placed().texto).toBe("Martes");
    await adjust().getByRole("button", { name: "Más grande" }).click();
    expect(placed().fs).toBeCloseTo(44, 5);
  });

  it("moves what is printed, leaves a place empty and brings it back", async () => {
    await openEditor();
    await enter();
    touch(...MIDDLE_B);
    await page.getByRole("button", { name: "Mover o agrandar lo que hay" }).click();
    expect(placed()).toMatchObject({ t: "Logo del flyer", tw: placed().ow });
    expect(placed().img).toMatch(/^orig:/);
    await page.getByRole("button", { name: "Listo con este" }).click();
    touch(...MIDDLE_C);
    await page.getByRole("button", { name: "Dejar el lugar vacío" }).click();
    expect(placed(1)).toMatchObject({ img: "", t: "" });
    await expect.element(page.getByRole("status")).toMatchTextContent(/queda vacío/);
    // A place left empty only offers adding
    touch(...MIDDLE_C);
    await expect.element(dialog()).toHaveAccessibleName("Agregar acá");
    await expect.element(page.getByText("Ahora está vacío.", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Volver al original" }).click();
    expect(theEditor().active()).toHaveLength(1);
  });

  it("drags a logo, with a guide, and Alt takes the magnet away", async () => {
    await openEditor();
    await enter();
    await put(MIDDLE_A, "Adidas");
    await put(MIDDLE_B, "Puppis");
    const start = placed(1);
    const near = [(start.tx ?? 0) + 5, (start.ty ?? 0) + 3] as const;
    const from = client(near[0], near[1]);
    const canvas = document.querySelector('[data-testid="flyer-canvas"]');
    canvas?.dispatchEvent(new PointerEvent("pointerdown", { ...from, button: 0, bubbles: true }));
    expect(theEditor().getState().dragging).toBe(true);
    document.dispatchEvent(
      new PointerEvent("pointermove", {
        clientX: from.clientX,
        clientY: client(near[0], (placed(0).ty ?? 0) + 8).clientY,
        bubbles: true,
      }),
    );
    expect(theEditor().getState().guides.length).toBeGreaterThan(0);
    const line = theEditor()
      .getState()
      .guides.find(({ axis }) => axis === "horizontal");
    const { ty = 0, th = 0 } = placed(1);
    expect(
      [ty, ty + th / 2, ty + th].some((edge) => Math.abs(edge - (line?.at ?? -1)) < 0.001),
    ).toBe(true);
    await expect.element(page.getByTestId("logo-guide").first()).toBeInTheDocument();
    document.dispatchEvent(new PointerEvent("pointerup", { ...from, bubbles: true }));
    expect(theEditor().getState().guides).toEqual([]);
    await settled();

    const again = placed(1);
    drag(
      [(again.tx ?? 0) + 10, (again.ty ?? 0) + 10],
      [(again.tx ?? 0) + 40, (placed(0).ty ?? 0) + 11],
      { altKey: true },
    );
    expect(Math.abs((placed(1).ty ?? 0) - (placed(0).ty ?? 0))).toBeGreaterThan(0.5);
  });

  it("a finger only touches, and a cancelled gesture leaves nothing hanging", async () => {
    await openEditor();
    await enter();
    await put(MIDDLE_A, "Adidas");
    key("Escape");
    const { tx = 0, ty = 0 } = placed();
    const start = client(tx + 5, ty + 5);
    const canvas = document.querySelector('[data-testid="flyer-canvas"]');
    canvas?.dispatchEvent(
      new PointerEvent("pointerdown", { ...start, button: 0, pointerType: "touch", bubbles: true }),
    );
    document.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true }));
    expect(theEditor().getState().dragging).toBe(false);
    drag([tx + 5, ty + 5], [tx + 50, ty + 50], { pointerType: "touch" });
    expect(placed().tx).toBe(tx);
    canvas?.dispatchEvent(new PointerEvent("pointerdown", { ...start, button: 2, bubbles: true }));
    document.dispatchEvent(new PointerEvent("pointerup", { ...start, bubbles: true }));
    expect(theEditor().getState().selected).toBe(-1);
  });

  it("the keys: arrows with guides that fade, + and −, Escape and Delete", async () => {
    await openEditor();
    await enter();
    await put(MIDDLE_A, "Adidas");
    await put(MIDDLE_B, "Puppis");
    key("ArrowUp");
    key("ArrowRight", { shiftKey: true });
    expect(placed(1).tx).toBeGreaterThan(0);
    expect(theEditor().getState().guides.length).toBeGreaterThanOrEqual(0);
    key("+");
    expect(placed(1).tw).toBeCloseTo((placed(1).bw ?? 0) * 1.1, 0);
    key("-", { shiftKey: true });
    await settled();
    key("Delete");
    expect(placed(1)).toMatchObject({ img: "" });
    await expect.element(page.getByRole("status")).toMatchTextContent(/Borrado\. Con Ctrl\+Z/);
    key("z", { ctrlKey: true });
    expect(placed(1).img).toBe("Puppis.png");
    await expect.element(page.getByRole("status")).toMatchTextContent(/^Deshecho: /);
    key("y", { ctrlKey: true });
    expect(placed(1).img).toBe("");
    await expect.element(page.getByRole("status")).toMatchTextContent(/^Rehecho: /);
    key("z", { ctrlKey: true, shiftKey: true });
    key("Escape");
    expect(theEditor().getState().selected).toBe(-1);
  });

  it("no key reaches the logos while writing or with a window open", async () => {
    await openEditor();
    await enter();
    await put(MIDDLE_A, "Adidas");
    const before = placed().tx;
    const field = document.createElement("input");
    document.body.append(field);
    key("ArrowRight", {}, field);
    key("Delete", {}, field);
    key("z", { ctrlKey: true }, field);
    key("v", {}, field);
    field.remove();
    expect(placed().tx).toBe(before);
    expect(theEditor().getState().clean).toBe(false);
    await adjust().getByRole("button", { name: "Cambiar", exact: true }).click();
    await expect.element(dialog()).toBeVisible();
    key("ArrowRight");
    key("v");
    expect(placed().tx).toBe(before);
    expect(theEditor().getState().clean).toBe(false);
    await dialog().getByRole("button", { name: "Cerrar" }).click();
  });

  it("copies with Ctrl+C and Ctrl+V; the copy falls apart, and text marked is copied as usual", async () => {
    await openEditor();
    await enter();
    await put(MIDDLE_A, "Adidas");
    const copying = key("c", { ctrlKey: true });
    expect(copying.defaultPrevented).toBe(true);
    await expect.element(page.getByRole("status")).toMatchTextContent(/Copiado/);
    key("v", { ctrlKey: true });
    expect(placed(1)).toMatchObject({ dup: true, w: 0, h: 0 });
    expect((placed(1).tx ?? 0) - (placed(0).tx ?? 0)).toBe(16);
    key("v", { ctrlKey: true });
    expect((placed(2).tx ?? 0) - (placed(0).tx ?? 0)).toBe(32);
    expect(theEditor().getState().selected).toBe(2);

    const text = document.createElement("p");
    text.textContent = "Algo para marcar";
    document.body.append(text);
    getSelection()?.selectAllChildren(text);
    expect(key("c", { ctrlKey: true }).defaultPrevented).toBe(false);
    getSelection()?.removeAllRanges();
    text.remove();

    await adjust().getByRole("button", { name: "Duplicar" }).click();
    expect(theEditor().active()).toHaveLength(4);
    await adjust().getByRole("button", { name: "Borrar" }).click();
    expect(theEditor().active()).toHaveLength(3);
  });

  it("the bar of adjusting: size, center, original and letting go", async () => {
    await openEditor();
    await enter();
    await put(MIDDLE_A, "Adidas");
    const { bw = 0, ox, ow } = placed();
    await adjust().getByRole("button", { name: "Más chico" }).click();
    expect(placed().tw).toBeCloseTo(bw * 0.9, 0);
    await adjust().getByRole("slider", { name: "Tamaño del logo" }).fill("150");
    expect(placed().tw).toBeCloseTo(bw * 1.5, 0);
    await expect.element(adjust()).toMatchTextContent(/150%/);
    key("ArrowRight", { shiftKey: true });
    await adjust().getByRole("button", { name: "Centrar" }).click();
    expect((placed().tx ?? 0) + (placed().tw ?? 0) / 2).toBeCloseTo(ox + ow / 2, 5);
    await adjust().getByRole("button", { name: "Listo con este" }).click();
    await expect.element(adjust()).not.toBeInTheDocument();
    touch(...MIDDLE_A);
    await adjust().getByRole("button", { name: "Original" }).click();
    expect(theEditor().active()).toEqual([]);
    await expect.element(page.getByRole("status")).toMatchTextContent(/Volvió al original/);
  });

  it("Shift chooses several: they move, align, spread and get the same size", async () => {
    await openEditor();
    await enter();
    await put(MIDDLE_A, "Adidas");
    await put(MIDDLE_B, "Puppis");
    await put(MIDDLE_C, "Farmacia Del Pueblo");
    key("Escape");
    const center = (index: number) => {
      const { tx = 0, ty = 0, tw = 0, th = 0 } = placed(index);
      return [tx + tw / 2, ty + th / 2] as const;
    };
    touch(...center(0));
    touch(...center(1), { shiftKey: true });
    expect(theEditor().chosen()).toEqual([0, 1]);
    await expect.element(adjust()).toMatchTextContent(/2 elegidos/);
    await expect
      .element(adjust().getByRole("button", { name: "Cambiar", exact: true }))
      .not.toBeInTheDocument();
    await expect
      .element(adjust().getByRole("button", { name: "Repartir" }))
      .not.toBeInTheDocument();
    touch(...center(2), { shiftKey: true });
    await adjust().getByRole("button", { name: "Arriba" }).click();
    expect(placed(0).ty).toBeCloseTo(placed(2).ty ?? 0, 5);
    await adjust().getByRole("button", { name: "Al medio" }).click();
    await adjust().getByRole("button", { name: "Abajo" }).click();
    await adjust().getByRole("button", { name: "Repartir" }).click();
    await adjust().getByRole("button", { name: "Mismo tamaño" }).click();
    expect(placed(0).th).toBeCloseTo(placed(2).th ?? 0, 0);
    const before = placed(0).tx ?? 0;
    const [x, y] = center(2);
    drag([x, y], [x + 30, y + 30], {});
    expect(placed(0).tx ?? 0).not.toBeCloseTo(before, 0);
    expect(theEditor().chosen()).toEqual([0, 1, 2]);
    touch(...center(2), { shiftKey: true });
    expect(theEditor().chosen()).toEqual([0, 1]);
    touch(...center(0));
    expect(theEditor().chosen()).toEqual([0, 1]);
    await adjust().getByRole("button", { name: "Listo con este" }).click();
    drag([50, 60], [700, 400], { shiftKey: true });
    expect(theEditor().chosen()).toHaveLength(3);
    key("Escape");
    drag([50, 600], [100, 700], { shiftKey: true });
    await expect.element(page.getByRole("status")).toMatchTextContent(/no hay logos cambiados/);
  });

  it("Shift on logos of the flyer: replaces them in reading order, or deletes them", async () => {
    await openEditor();
    await enter();
    touch(...MIDDLE_C, { shiftKey: true });
    touch(...MIDDLE_A, { shiftKey: true });
    touch(...MIDDLE_B, { shiftKey: true });
    touch(...MIDDLE_B, { shiftKey: true });
    touch(...MIDDLE_B, { shiftKey: true });
    expect(theEditor().getState().places).toHaveLength(3);
    expect(theEditor().active()).toEqual([]);
    const group = page.getByRole("toolbar", { name: "Varios elegidos" });
    await expect.element(group).toMatchTextContent(/3 elegidos/);
    await group.getByRole("button", { name: "Reemplazar" }).click();
    await waitForCards();
    await expect.element(dialog()).toHaveAccessibleName("Reemplazar 3 lugares");
    const cards = page.getByTestId("brand-card");
    await cards.filter({ hasText: "Adidas" }).click();
    await expect.element(page.getByRole("button", { name: "Poner 1 de 3" })).toBeVisible();
    await cards.filter({ hasText: "Puppis" }).click();
    await cards.filter({ hasText: "Farmacia" }).click();
    await cards.filter({ hasText: "Coto" }).click();
    await expect.element(page.getByRole("status")).toMatchTextContent(/Ya elegiste 3/);
    await cards.filter({ hasText: "Farmacia" }).click();
    await cards.filter({ hasText: "Puppis" }).click();
    await cards.filter({ hasText: "Puppis" }).click();
    await page.getByRole("button", { name: "Poner 2 de 3" }).click();
    await expect.element(dialog()).not.toBeInTheDocument();
    await expect
      .element(page.getByRole("status"))
      .toMatchTextContent(/2 marcas puestas \(1 lugares/);
    const places = theEditor()
      .active()
      .map(({ img, ox }) => [img, ox]);
    expect(places[0]?.[0]).toBe("Adidas.png");
    expect(Number(places[0]?.[1])).toBeLessThan(Number(places[1]?.[1]));
    expect(theEditor().getState().places).toEqual([]);
    touch(...MIDDLE_C, { shiftKey: true });
    await group.getByRole("button", { name: "Borrar" }).click();
    expect(theEditor().active().at(-1)).toMatchObject({ img: "" });
    await expect.element(page.getByRole("status")).toMatchTextContent(/^Borrado\./);
  });

  it("Shift on logos of the flyer, dragging: they become movable and go together", async () => {
    await openEditor();
    await enter();
    touch(...MIDDLE_A, { shiftKey: true });
    drag(MIDDLE_A, [MIDDLE_A[0] + 30, MIDDLE_A[1] + 30]);
    expect(placed()).toMatchObject({ t: "Logo del flyer" });
    expect(placed().tx).not.toBe(placed().ox);
    expect(theEditor().getState().places).toEqual([]);
    touch(...MIDDLE_C, { shiftKey: true });
    touch(...MIDDLE_C, { shiftKey: true });
    touch(...MIDDLE_B, { shiftKey: true });
    key("Escape");
    expect(theEditor().getState().places).toEqual([]);
    touch(700, 700, { shiftKey: true });
    await expect
      .element(page.getByRole("status"))
      .toMatchTextContent(/no encontré un logo para sumar/);
    touch(...MIDDLE_B, { shiftKey: true });
    const group = page.getByRole("toolbar", { name: "Varios elegidos" });
    await group.getByRole("button", { name: "Soltar lo elegido" }).click();
    expect(theEditor().getState().places).toEqual([]);
    const bar = group;
    await expect.element(bar).not.toBeInTheDocument();
    touch(...MIDDLE_B, { shiftKey: true });
    key("Delete");
    expect(theEditor().active().at(-1)).toMatchObject({ img: "" });
  });

  it("with a change chosen and a logo of the flyer, the group bar offers Original", async () => {
    await openEditor();
    await enter();
    await put(MIDDLE_A, "Adidas");
    touch(...MIDDLE_B, { shiftKey: true });
    const group = page.getByRole("toolbar", { name: "Varios elegidos" });
    await expect.element(group).toMatchTextContent(/2 elegidos/);
    await group.getByRole("button", { name: "Original" }).click();
    expect(theEditor().active()).toEqual([]);
    expect(theEditor().getState().places).toEqual([]);
  });

  it("double click opens the change, and the thumbnail shows the logo of now", async () => {
    await openEditor();
    await enter();
    await put(MIDDLE_A, "Adidas");
    key("Escape");
    const at = client(MIDDLE_A[0], MIDDLE_A[1]);
    document
      .querySelector('[data-testid="flyer-canvas"]')
      ?.dispatchEvent(new MouseEvent("dblclick", { ...at, bubbles: true }));
    await expect.element(dialog()).toBeVisible();
    await expect.element(page.getByText("Ahora dice Adidas.", { exact: false })).toBeVisible();
    const thumbnail = page.getByTestId("picker-thumbnail");
    await expect.element(thumbnail).toBeVisible();
    await page.getByRole("button", { name: "Volver al original" }).click();
    expect(theEditor().active()).toEqual([]);
    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("Ese logo volvió al original.");
  });

  it("the thumbnail of a logo that is not in memory is not that of the flyer", async () => {
    let arrive: (blob: Blob) => void = NOOP;
    let asked = 0;
    await openEditor({
      fetchLogo: () => {
        asked += 1;
        return asked === 1
          ? paintedLogo(60, 60)
          : new Promise((resolve) => {
              arrive = resolve;
            });
      },
    });
    await enter();
    await put(MIDDLE_A, "Adidas");
    const editor = theEditor();
    const entry = placed();
    editor.openBox(entry.ox, entry.oy, entry.ow, entry.oh);
    await expect.element(dialog()).toBeVisible();
    await page.getByRole("button", { name: "Cancelar" }).click();
    await waitForCards().catch(() => undefined);
    arrive(await paintedLogo(60, 60));
  });

  it("uploads a logo from the PC, and a wrong file keeps the window open", async () => {
    await openEditor();
    await enter();
    touch(...MIDDLE_B);
    await waitForCards();
    const input = page.getByTestId("logo-file");
    await userEvent.upload(input, new File(["hola"], "nota.txt", { type: "text/plain" }));
    await expect.element(page.getByRole("status")).toMatchTextContent(/no es una imagen PNG o JPG/);
    await expect.element(dialog()).toBeVisible();
    const logo = await paintedLogo(80, 40);
    await userEvent.upload(input, new File([logo], "gofarma.png", { type: "image/png" }));
    await expect.element(dialog()).not.toBeInTheDocument();
    expect(placed()).toMatchObject({ t: "gofarma" });
    expect(placed().img).toMatch(/^pc:/);
    await expect
      .element(page.getByRole("status"))
      .toMatchTextContent(/tu logo quedó en este flyer/);
    await page.getByRole("button", { name: "Listo con este" }).click();
    touch(...MIDDLE_C);
    await waitForCards();
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 100;
    const blob = await new Promise<Blob>((resolve, reject) => {
      const context = canvas.getContext("2d");
      if (context) {
        context.font = "bold 80px Arial";
        context.fillStyle = "#ffffff";
        context.fillText("Toledo", 2, 80);
      }
      canvas.toBlob((made) => {
        if (made) resolve(made);
        else reject(new Error("No file"));
      });
    });
    await userEvent.upload(
      page.getByTestId("logo-file"),
      new File([blob], "blanco.png", { type: "image/png" }),
    );
    await expect.element(page.getByRole("status")).toMatchTextContent(/Ese logo es blanco/);
  });

  it("Vista previa hides the marks and does not react; V and Escape go back", async () => {
    await openEditor();
    await enter();
    await put(MIDDLE_A, "Adidas");
    key("v");
    expect(theEditor().getState().clean).toBe(true);
    await expect.element(page.getByTestId("logo-editor-layer")).not.toBeVisible();
    await expect.element(page.getByRole("button", { name: "Seguir editando" })).toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Armar franja" }))
      .not.toBeInTheDocument();
    touch(...MIDDLE_C);
    expect(theEditor().getState().picker).toBeNull();
    key("r");
    key("V");
    expect(theEditor().getState().clean).toBe(false);
    key("v");
    key("Escape");
    expect(theEditor().getState().clean).toBe(false);
    await page.getByRole("button", { name: "Vista previa" }).click();
    await page.getByRole("button", { name: "Listo" }).click();
    expect(theEditor().getState().clean).toBe(false);
  });

  it("the letters mark a zone and say what to do; the same letter goes back", async () => {
    await openEditor();
    await enter();
    key("r");
    expect(theEditor().getState().mode).toBe("trim");
    await expect.element(page.getByRole("button", { name: "Cancelar recorte" })).toBeVisible();
    await expect.element(page.getByText(/sobre la parte que querés/)).toBeVisible();
    key("r");
    expect(theEditor().getState().mode).toBe("none");
    key("f");
    expect(theEditor().getState().mode).toBe("strip");
    await expect.element(page.getByText(/toda la franja/)).toBeVisible();
    key("v");
    expect(theEditor().getState().clean).toBe(false);
    touch(...MIDDLE_A);
    expect(theEditor().getState().picker).toBeNull();
    key("Escape");
    expect(theEditor().getState().mode).toBe("strip");
    key("f");
    expect(theEditor().getState().mode).toBe("none");
    key("r");
    key("Escape");
    expect(theEditor().getState().mode).toBe("none");
    key("f");
    key("i");
    expect(theEditor().getState().mode).toBe("strip");
    expect(theEditor().getState().sectionPicker).toBe(false);
    await page.getByRole("button", { name: "Cancelar franja" }).click();
    expect(theEditor().getState().mode).toBe("none");
    key("i");
    expect(theEditor().getState().sectionPicker).toBe(true);
    await dialog().getByRole("button", { name: "Cerrar" }).click();
    await page.getByRole("button", { name: "Recortar" }).click();
    await page.getByRole("button", { name: "Insertar" }).click();
    expect(theEditor().getState().mode).toBe("none");
    expect(theEditor().getState().sectionPicker).toBe(true);
  });

  it("marks in red what has expired, once, and not what is valid", async () => {
    await openEditor({
      catalog: [
        ...CATALOG,
        brand("Vieja", { fecha_hasta: "2020-01-01" }),
        brand("Vieja", { beneficio: "otra", imagen: "Nueva.png", fecha_hasta: "2099-01-01" }),
      ],
    });
    await enter();
    await put(MIDDLE_A, "Adidas");
    await vi.waitFor(() => {
      expect(page.getByTestId("logo-marker").first().element()).toBeTruthy();
    });
    await expect.element(page.getByTestId("logo-marker").first()).not.toHaveAttribute("data-note");
    await expect
      .element(page.getByTestId("logo-marker").first())
      .toHaveAttribute("data-title", "Adidas");
  });

  it("the catalog that never updated asks for itself, once, on entering", async () => {
    const asked: unknown[] = [];
    await openEditor({
      catalog: [],
      tables: {
        promos_galicia_meta: () => jsonResponse({ last_sync_at: null, total: 0, ubicaciones: [] }),
      },
      edge: ({ body }) => {
        asked.push(body);
        return jsonResponse({ data: { total: 0 } });
      },
    });
    await enter();
    await vi.waitFor(() => {
      expect(asked.length).toBeGreaterThan(0);
    });
    await expect.poll(() => asked.length).toBe(1);
    touch(...MIDDLE_A);
    await expect
      .element(page.getByText("No se pudo leer el catálogo de promociones."))
      .toBeVisible();
    await dialog().getByRole("button", { name: "Cerrar" }).click();
    await expect
      .element(page.getByRole("button", { name: "Escribir un texto" }))
      .not.toBeInTheDocument();
  });

  it("forgets everything when asked, and starts Deshacer over", async () => {
    await openEditor();
    await enter();
    await put(MIDDLE_A, "Adidas");
    theEditor().forget();
    expect(theEditor().active()).toEqual([]);
    expect(theEditor().canUndo()).toBe(false);
    expect(theEditor().canRedo()).toBe(false);
    key("c", { ctrlKey: true });
    expect(theEditor().hasCopy()).toBe(false);
  });

  it("goes to choose at full screen and comes back with the brand, or to the window", async () => {
    const backs: ((chosen: (typeof CATALOG)[number] | null) => void)[] = [];
    await openEditor({
      picker: {
        pickOneBrand: ({ onBack }) => {
          backs.push(onBack);
        },
      },
    });
    await enter();
    touch(...MIDDLE_A);
    await waitForCards();
    await page.getByRole("button", { name: "Elegir en pantalla completa" }).click();
    await expect.element(dialog()).not.toBeInTheDocument();
    backs[0]?.(null);
    await expect.element(dialog()).toBeVisible();
    await page.getByRole("button", { name: "Elegir en pantalla completa" }).click();
    const [adidas] = CATALOG;
    if (adidas) backs[1]?.(adidas);
    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("Listo: Adidas en este flyer.");
    expect(placed()).toMatchObject({ t: "Adidas" });
    touch(...MIDDLE_B);
    await waitForCards();
    await page.getByRole("button", { name: "Elegir en pantalla completa" }).click();
    const coto = CATALOG.find(({ titulo }) => titulo === "Coto");
    if (coto) backs[2]?.(coto);
    await expect.element(page.getByRole("status")).toMatchTextContent(/Coto con sus días/);
  });
});
