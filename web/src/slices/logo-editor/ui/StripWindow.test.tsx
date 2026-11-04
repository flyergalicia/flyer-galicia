import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { NO_PROMOTION_FILTERS } from "@/shared/lib/promotions/promotion-filters.ts";
import type { ManyBrandsRequest } from "@/shared/lib/promotions/promotion-picking.ts";
import { workspaceOnScreen } from "@/shared/lib/flyer-workspace/testing/painted-flyer.ts";
import { jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import { forgetPickerFilters } from "../model/brand-picker.ts";
import type { LogoEditorProbe } from "../model/editor-probe.ts";
import {
  brand,
  CATALOG,
  client,
  drag,
  type EditorCloud,
  handles,
  key,
  openEditor,
  paintedFlyer,
  paintedLogo,
  theEditor,
  touch,
  waitForFlyer,
} from "../testing/editor-cloud.ts";

const ROW_BLOCKS = [
  { x: 120, y: 300, w: 80, h: 40, color: "#123456" },
  { x: 260, y: 300, w: 80, h: 40, color: "#a01010" },
  { x: 400, y: 300, w: 80, h: 40, color: "#108030" },
  { x: 120, y: 400, w: 80, h: 40, color: "#123456" },
  { x: 260, y: 400, w: 80, h: 40, color: "#a01010" },
];
const ALLOWED = {
  "_facultades.json": { roles: { asesor: { opcion_9: true, promos_buscar: true } } },
};
const STRIP_FROM = [100, 280] as const;
const STRIP_TO = [600, 460] as const;

function deferred<Value>() {
  const parts: { resolve?: (value: Value) => void } = {};
  const promise = new Promise<Value>((done) => {
    parts.resolve = done;
  });
  return {
    promise,
    resolve: (value: Value) => {
      parts.resolve?.(value);
    },
  };
}

function stripWindow() {
  return page.getByRole("dialog", { name: "Armar franja" });
}

function button(name: string | RegExp) {
  return page.getByRole("button", { name, exact: typeof name === "string" });
}

async function enter() {
  await waitForFlyer();
  await button("Cambiar logos").click();
  await expect.element(button("Listo")).toBeVisible();
}

async function open(cloud: EditorCloud = {}) {
  const opened = await openEditor({ blocks: ROW_BLOCKS, ...cloud });
  await enter();
  await button("Armar franja").click();
  drag(STRIP_FROM, STRIP_TO);
  await expect.element(stripWindow()).toBeVisible();
  await expect.element(page.getByTestId("brand-card").first()).toBeVisible();
  return opened;
}

function strip() {
  const session = theEditor().getState().strip;
  if (!session) throw new Error("The window is not open");
  return session;
}

function card(title: string) {
  return page.getByTestId("brand-card").filter({ hasText: title }).first();
}

async function tick(...titles: readonly string[]) {
  const [title, ...others] = titles;
  if (title === undefined) return;
  await card(title).click();
  await tick(...others);
}

async function clickCards(from: number, to: number) {
  if (from >= to) return;
  await page.getByTestId("brand-card").nth(from).click();
  await clickCards(from + 1, to);
}

function chosenLogos() {
  return strip()
    .getState()
    .selection.map(({ img }) => img);
}

function row(index: number) {
  return page.getByTestId("strip-row").nth(index);
}

function settled() {
  return vi.waitFor(() => {
    expect(strip().isSettled()).toBe(true);
  });
}

function logosDrawn(count: number) {
  return vi.waitFor(() => {
    expect(strip().drawing().boxes.filter(Boolean)).toHaveLength(count);
  });
}

function isProbe(value: unknown): value is LogoEditorProbe {
  return value instanceof Object && "strip" in value;
}

function probe(): LogoEditorProbe {
  const read: unknown = window["__flyerProbe"]?.["logoEditor"]?.();
  if (isProbe(read)) return read;
  throw new Error("There is no probe");
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

describe("marking a strip", () => {
  it("opens the window saying what it found", async () => {
    await open();
    await expect
      .element(page.getByTestId("strip-intro"))
      .toMatchTextContent(/5 logos en 2 filas \(3 por fila\)/);
    await expect
      .element(page.getByTestId("strip-selection"))
      .toMatchTextContent(/Tildá marcas a la izquierda/);
    await expect.element(page.getByTestId("strip-put")).toHaveTextContent("Poner logos");
    expect(theEditor().getState().mode).toBe("none");
    expect(probe().detectStrip(100, 280, 500, 180)).toEqual({ logos: 5, rows: [3, 2], perRow: 3 });
  });

  it("a click on nothing says what to do, and a small box too", async () => {
    await openEditor({ blocks: ROW_BLOCKS });
    await enter();
    await button("Armar franja").click();
    touch(700, 700);
    await expect
      .element(page.getByRole("status"))
      .toMatchTextContent(/alrededor de TODA la franja/);
    expect(theEditor().getState().mode).toBe("strip");
    drag([100, 280], [130, 300]);
    await expect.element(page.getByRole("status")).toMatchTextContent(/Ese recuadro es muy chico/);
    expect(theEditor().getState().mode).toBe("none");
  });

  it("a box cutting another drawing warns about it, and one with no flyer does nothing", async () => {
    await openEditor({ blocks: ROW_BLOCKS });
    await enter();
    await button("Armar franja").click();
    drag([140, 280], [600, 460]);
    await expect.element(page.getByText(/Ojo: el recuadro corta/)).toBeVisible();
  });

  it("Cancelar franja and Listo leave nothing behind", async () => {
    await openEditor({ blocks: ROW_BLOCKS });
    await enter();
    await button("Armar franja").click();
    await button("Cancelar franja").click();
    expect(theEditor().getState().mode).toBe("none");
    await button("Armar franja").click();
    await button("Listo").click();
    expect(theEditor().getState().mode).toBe("none");
  });
});

describe("choosing the brands", () => {
  it("ticks in order, a tick again takes out, and the ones ticked stay on top", async () => {
    await open();
    await tick("Puppis", "Adidas");
    expect(chosenLogos()).toEqual(["Puppis.png", "Adidas.png"]);
    await expect.element(page.getByTestId("strip-put")).toHaveTextContent("Poner 2 logos");
    await expect
      .element(page.getByTestId("brand-card").first())
      .toHaveAttribute("data-strip-number", "1");
    await expect
      .element(page.getByTestId("brand-card").first())
      .toHaveAttribute("aria-pressed", "true");
    await expect.element(page.getByTestId("strip-row")).toHaveLength(2);
    await card("Puppis").click();
    expect(chosenLogos()).toEqual(["Adidas.png"]);
    await expect.element(page.getByTestId("strip-put")).toHaveTextContent("Poner 1 logo");
  });

  it("a brand the filter leaves out stays in sight while it is ticked", async () => {
    await open();
    await tick("Puppis");
    await page.getByRole("searchbox", { name: "Buscar marca" }).fill("adidas");
    await expect.element(page.getByTestId("brand-list")).toHaveAttribute("data-search", "adidas");
    await expect.element(card("Puppis")).toBeVisible();
    await expect.element(card("Adidas")).toBeVisible();
    await expect.element(page.getByTestId("brand-info")).toHaveTextContent("1 marca vigente.");
  });

  it("says what there is and where, and when there is nothing", async () => {
    await open();
    await expect.element(page.getByTestId("brand-info")).toMatchTextContent(/marcas vigentes\.$/);
    await page.getByRole("searchbox", { name: "Buscar marca" }).fill("nada de esto");
    await expect.element(page.getByText("No hay promos vigentes con esos filtros.")).toBeVisible();
    await expect.element(page.getByTestId("brand-info")).toHaveTextContent("0 marcas vigentes.");
  });

  it("over 60 brands it says that it shows 60", async () => {
    const many = Array.from({ length: 70 }, (_brand, index) => brand(`Marca ${String(index)}`));
    await open({ catalog: many });
    await expect
      .element(page.getByTestId("brand-info"))
      .toMatchTextContent(/Mostrando 60 de 70 marcas vigentes: .*las tuyas/);
    await expect.element(page.getByTestId("brand-card")).toHaveLength(60);
  });

  it("no more than 30, and it says so", async () => {
    const many = Array.from({ length: 40 }, (_brand, index) => brand(`Marca ${String(index)}`));
    await open({ catalog: many });
    await clickCards(0, 31);
    expect(chosenLogos()).toHaveLength(30);
    await expect.element(page.getByRole("status")).toHaveTextContent("Hasta 30 logos por franja.");
  });

  it("a logo that does not come down goes away from the selection, and it says so", async () => {
    await open({ fetchLogo: () => Promise.reject(new Error("No")) });
    await tick("Adidas");
    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("No se pudo bajar el logo de Adidas.");
    expect(chosenLogos()).toEqual([]);
  });

  it("an empty catalog says it could not be read", async () => {
    await openEditor({ blocks: ROW_BLOCKS, catalog: [] });
    await enter();
    await button("Armar franja").click();
    drag(STRIP_FROM, STRIP_TO);
    await expect
      .element(page.getByText("No se pudo leer el catálogo de promociones."))
      .toBeVisible();
  });

  it("while asking for a locality it says so, and the list stays with what is ticked", async () => {
    const answers = deferred<Response>();
    await open({ edge: () => answers.promise });
    await tick("Adidas");
    await page.getByTestId("brand-province").selectOptions("MENDOZA");
    await page.getByTestId("brand-locality").selectOptions("LUJAN");
    await expect
      .element(page.getByTestId("brand-info"))
      .toHaveTextContent("Buscando las promos de Lujan…");
    await expect.element(card("Adidas")).toBeVisible();
    await button(/Sugerir marcas/).click();
    await expect.element(page.getByRole("status")).toMatchTextContent(/en un momento sugiero/);
    answers.resolve(jsonResponse({ data: { ids: [] } }));
    await expect.element(page.getByTestId("brand-list")).not.toHaveAttribute("data-searching");
  });

  it("asking for a locality with nothing ticked says it in the list", async () => {
    await open({ edge: () => new Promise<Response>(() => undefined) });
    await page.getByTestId("brand-province").selectOptions("MENDOZA");
    await page.getByTestId("brand-locality").selectOptions("LUJAN");
    await expect
      .element(page.getByTestId("brand-list"))
      .toMatchTextContent(/Buscando las promos de Lujan/);
  });
});

describe("the selection on the right", () => {
  it("the arrows and the × order it, and the row keeps the mark", async () => {
    await open();
    await tick("Adidas", "Puppis", "Farmacia");
    await logosDrawn(3);
    await row(2).getByRole("button", { name: "Subir" }).click();
    expect(chosenLogos()).toEqual(["Adidas.png", "Farmacia Del Pueblo.png", "Puppis.png"]);
    expect(strip().getState().marked).toBe(1);
    await row(0).getByRole("button", { name: "Bajar" }).click();
    expect(chosenLogos()).toEqual(["Farmacia Del Pueblo.png", "Adidas.png", "Puppis.png"]);
    await row(0).getByRole("button", { name: "Quitar" }).click();
    expect(chosenLogos()).toEqual(["Adidas.png", "Puppis.png"]);
    await expect.element(row(0).getByRole("button", { name: "Subir" })).toBeDisabled();
    await expect.element(row(1).getByRole("button", { name: "Bajar" })).toBeDisabled();
  });

  it("touching a row marks its logo; with Shift, several", async () => {
    await open();
    await tick("Adidas", "Puppis");
    await row(1).getByText("Puppis").click();
    expect(strip().getState().marked).toBe(1);
    await expect.element(row(1)).toHaveAttribute("data-chosen");
    await expect.element(page.getByTestId("strip-adjust")).toMatchTextContent(/2\. Puppis/);
    await row(1).getByText("Puppis").click();
    expect(strip().getState().marked).toBe(-1);
    await row(0).getByText("Adidas").click();
    row(1)
      .getByText("Puppis")
      .element()
      .dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true }));
    await expect.element(page.getByTestId("strip-adjust")).toMatchTextContent(/2 elegidos/);
    await expect.element(row(0)).toHaveAttribute("data-chosen");
    await expect.element(row(1)).toHaveAttribute("data-chosen");
  });

  it("a click just after a drag does not mark, and a click on a button does not either", async () => {
    await open();
    await tick("Adidas", "Puppis");
    const element = row(1).getByText("Puppis").element();
    const { top, height } = row(0).element().getBoundingClientRect();
    element.dispatchEvent(
      new PointerEvent("pointerdown", {
        clientY: top + 60,
        pointerType: "mouse",
        pointerId: 3,
        bubbles: true,
      }),
    );
    const list = page.getByTestId("strip-selection").element();
    const end = top + height / 4;
    list.dispatchEvent(
      new PointerEvent("pointermove", {
        clientY: end,
        pointerId: 3,
        pointerType: "mouse",
        bubbles: true,
      }),
    );
    list.dispatchEvent(
      new PointerEvent("pointerup", {
        clientY: end,
        pointerId: 3,
        pointerType: "mouse",
        bubbles: true,
      }),
    );
    expect(chosenLogos()).toEqual(["Puppis.png", "Adidas.png"]);
    expect(strip().getState().marked).toBe(0);
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(strip().getState().marked).toBe(0);
    list.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(strip().getState().marked).toBe(0);
  });

  it("a supermarket with a % discount carries its dot", async () => {
    await open();
    await tick("Coto", "Adidas");
    await expect.element(row(0).getByTestId("percent-dot")).toBeVisible();
    await expect.element(row(1).getByTestId("percent-dot")).not.toBeInTheDocument();
  });
});

describe("adjusting on the preview", () => {
  it("the size of the marked one, of all, and back to its place", async () => {
    await open();
    await tick("Adidas", "Puppis");
    await logosDrawn(2);
    await row(0).getByText("Adidas").click();
    await button("Más grande").click();
    expect(strip().getState().selection[0]?.k).toBe(1.1);
    await button("Más chico").click();
    expect(strip().getState().selection[0]?.k).toBe(1);
    await page.getByRole("slider", { name: "Tamaño de este logo" }).fill("150");
    expect(strip().getState().selection[0]?.k).toBe(1.5);
    await expect.element(page.getByTestId("strip-adjust")).toMatchTextContent(/150%/);
    await page.getByRole("slider", { name: "Tamaño de todos los logos" }).fill("90");
    expect(strip().getState().sizeOfAll).toBe(0.9);
    await button("Volver a su lugar").click();
    expect(strip().getState().selection[0]).toMatchObject({ k: 1, dx: 0, dy: 0 });
  });

  it("Por fila changes the columns", async () => {
    await open();
    await page.getByRole("combobox", { name: "Por fila" }).selectOptions("4");
    expect(strip().getState().perRow).toBe(4);
  });

  it("Deshacer and Rehacer go through the steps, with the buttons", async () => {
    await open();
    await tick("Adidas", "Puppis");
    await expect.element(stripWindow().getByRole("button", { name: /Deshacer/ })).toBeDisabled();
    await settled();
    await expect.element(stripWindow().getByRole("button", { name: /Deshacer/ })).toBeEnabled();
    await stripWindow()
      .getByRole("button", { name: /Deshacer/ })
      .click();
    expect(chosenLogos()).toEqual([]);
    await stripWindow()
      .getByRole("button", { name: /Rehacer/ })
      .click();
    expect(chosenLogos()).toEqual(["Adidas.png", "Puppis.png"]);
  });

  it("Ampliar makes the preview bigger, and Achicar goes back", async () => {
    await page.viewport(1366, 500);
    await open();
    const canvas = page.getByTestId("strip-preview").element();
    const before = canvas.getBoundingClientRect().height;
    await button("Ampliar vista previa").click();
    expect(canvas.getBoundingClientRect().height).toBeGreaterThan(before);
    await button("Achicar vista previa").click();
    expect(canvas.getBoundingClientRect().height).toBe(before);
  });
});

describe("the days of a supermarket", () => {
  it("the tick decides, and it is remembered", async () => {
    await open();
    const tickDays = page.getByRole("checkbox", { name: /poner sus días de descuento/ });
    await expect.element(tickDays).toBeChecked();
    await tick("Coto");
    await logosDrawn(1);
    await tickDays.click();
    await expect.element(tickDays).not.toBeChecked();
    await page.getByTestId("strip-put").click();
    await expect.element(stripWindow()).not.toBeInTheDocument();
    expect(
      theEditor()
        .active()
        .filter(({ tipo }) => tipo === "txt"),
    ).toEqual([]);
  });

  it("with the tick they go on the flyer, with the strip", async () => {
    await open();
    await tick("Coto", "Adidas");
    await page.getByTestId("strip-put").click();
    await expect.element(stripWindow()).not.toBeInTheDocument();
    const texts = theEditor()
      .active()
      .filter(({ tipo }) => tipo === "txt");
    expect(texts.map(({ texto }) => texto)).toEqual(["Martes"]);
  });
});

describe("putting the strip", () => {
  it("with nothing ticked it asks for a brand", async () => {
    await open();
    await page.getByTestId("strip-put").click();
    await expect.element(page.getByRole("status")).toHaveTextContent("Tildá al menos una marca.");
    await expect.element(stripWindow()).toBeVisible();
  });

  it("leaves it on the flyer as one step, with its way back", async () => {
    await open();
    await tick("Adidas", "Puppis");
    await page.getByTestId("strip-put").click();
    await expect.element(stripWindow()).not.toBeInTheDocument();
    await expect
      .element(page.getByRole("status"))
      .toMatchTextContent(/Listo: 2 logos en la franja/);
    const [cover, ...logos] = theEditor().active();
    expect(cover).toMatchObject({ franjaBase: true, t: "Franja" });
    expect(logos.map(({ img }) => img)).toEqual(["Adidas.png", "Puppis.png"]);
    await expect.element(page.getByTestId("edit-strip")).toBeInTheDocument();
    expect(theEditor().getState().selected).toBe(-1);
  });

  it("if the logos never arrive it says so, and it can be tried again", async () => {
    const rejected = new Set<string>();
    await open({
      fetchLogo: (file) =>
        rejected.has(file) ? Promise.reject(new Error("No")) : paintedLogo(100, 60),
    });
    theEditor();
    const missing = "Sin Logo.png";
    rejected.add(missing);
    strip().change((now) => ({ ...now, selection: [{ img: missing, t: "Sin Logo" }] }));
    await page.getByTestId("strip-put").click();
    await expect
      .element(page.getByRole("status"))
      .toMatchTextContent(/No se pudieron bajar algunos logos/);
    await expect.element(page.getByTestId("strip-put")).toBeEnabled();
    await expect.element(page.getByTestId("strip-put")).toHaveTextContent("Poner 1 logo");
  });

  it("while they come down it says Poniendo…, and pressing again does nothing", async () => {
    const logos = deferred<null>();
    await open({
      fetchLogo: async () => {
        await logos.promise;
        return paintedLogo(100, 60);
      },
    });
    await tick("Adidas");
    const put = page.getByTestId("strip-put").element();
    if (put instanceof HTMLElement) {
      put.click();
      put.click();
    }
    await expect.element(page.getByTestId("strip-put")).toHaveTextContent("Poniendo…");
    logos.resolve(null);
    await expect.element(stripWindow()).not.toBeInTheDocument();
    expect(
      theEditor()
        .active()
        .filter(({ franjaBase }) => franjaBase),
    ).toHaveLength(1);
  });

  it("if the flyer changed while they came down, nothing falls on the new one", async () => {
    const logos = deferred<null>();
    await open({
      files: {
        "_opciones.json": {
          opts: [
            { n: 9, nombre: "Combustible", solapa: "flyer" },
            { n: 3, nombre: "Otro", solapa: "flyer" },
          ],
        },
        "_facultades.json": {
          roles: { asesor: { opcion_9: true, opcion_3: true, promos_buscar: true } },
        },
        "_active3.json": { name: "", imageUrl: paintedFlyer([]), cfg: {} },
        "_legal3.json": { text: "Legal" },
      },
      fetchLogo: async () => {
        await logos.promise;
        return paintedLogo(100, 60);
      },
    });
    await tick("Adidas");
    await page.getByTestId("strip-put").click();
    const art = theEditor().currentArt();
    await workspaceOnScreen().selectOption(3, false);
    await vi.waitFor(() => {
      expect(theEditor().currentArt()).not.toBe(art);
    });
    logos.resolve(null);
    await expect.element(stripWindow()).not.toBeInTheDocument();
    await expect
      .element(page.getByRole("status"))
      .toMatchTextContent(/Cambiaste de flyer mientras se armaba la franja/);
    expect(theEditor().active()).toEqual([]);
  });

  it("Escape, Cancelar and the X close it and put nothing", async () => {
    await open();
    await tick("Adidas");
    await userEvent.keyboard("{Escape}");
    await expect.element(stripWindow()).not.toBeInTheDocument();
    expect(theEditor().active()).toEqual([]);
    await button("Armar franja").click();
    drag(STRIP_FROM, STRIP_TO);
    await button("Cancelar").click();
    await expect.element(stripWindow()).not.toBeInTheDocument();
    await button("Armar franja").click();
    drag(STRIP_FROM, STRIP_TO);
    await button("Cerrar").click();
    await expect.element(stripWindow()).not.toBeInTheDocument();
  });
});

async function buildOne() {
  await tick("Adidas", "Puppis");
  await page.getByTestId("strip-put").click();
  await expect.element(stripWindow()).not.toBeInTheDocument();
}

describe("a strip already built", () => {
  it("✎ Editar franja resumes it, with its brands", async () => {
    await open();
    await buildOne();
    await page.getByTestId("edit-strip").click();
    await expect.element(stripWindow()).toBeVisible();
    expect(strip().base).not.toBeNull();
    expect(chosenLogos()).toEqual(["Adidas.png", "Puppis.png"]);
    await button("Volver la franja al original").click();
    await expect.element(stripWindow()).not.toBeInTheDocument();
    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("La franja volvió a como viene en el flyer.");
    expect(theEditor().active()).toEqual([]);
  });

  it("Editar franja of the bar opens it from one of its logos", async () => {
    await open();
    await buildOne();
    const logo = theEditor().active()[1];
    touch((logo?.tx ?? 0) + 5, (logo?.ty ?? 0) + 5);
    const bar = page.getByRole("toolbar", { name: "Ajustar el elemento elegido" });
    await bar.getByRole("button", { name: "Editar franja" }).click();
    await expect.element(stripWindow()).toBeVisible();
    expect(strip().id).toBe(logo?.franja);
  });

  it("a click on it while marking opens it, and putting it again does not duplicate it", async () => {
    await open();
    await buildOne();
    const id = theEditor().active()[0]?.franja;
    await button("Armar franja").click();
    touch(350, 370);
    await expect.element(stripWindow()).toBeVisible();
    expect(strip().id).toBe(id);
    expect(theEditor().getState().mode).toBe("none");
    await card("Farmacia").click();
    await page.getByTestId("strip-put").click();
    await expect.element(stripWindow()).not.toBeInTheDocument();
    expect(
      theEditor()
        .active()
        .filter(({ franjaBase }) => franjaBase),
    ).toHaveLength(1);
    expect(
      theEditor()
        .active()
        .filter(({ franja, franjaBase }) => franja && !franjaBase),
    ).toHaveLength(3);
  });

  it("marking a box whose center falls inside resumes it; if not, it is cut", async () => {
    await open();
    await buildOne();
    await button("Armar franja").click();
    drag([110, 290], [590, 450]);
    await expect.element(stripWindow()).toBeVisible();
    expect(strip().base).not.toBeNull();
    await button("Cancelar").click();
    await button("Armar franja").click();
    drag([100, 440], [600, 600]);
    await expect.element(stripWindow()).toBeVisible();
    expect(strip().base).toBeNull();
    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("Ajusté el recuadro para no pisar la franja que ya armaste.");
    await button("Cancelar").click();
    await button("Armar franja").click();
    drag([100, 450], [600, 470]);
    await expect
      .element(page.getByRole("status"))
      .toMatchTextContent(/Ese recuadro es muy chico|cae casi todo/);
  });

  it("Editar franja of what is not there any more says so", async () => {
    await open();
    await buildOne();
    theEditor().editStrip("nothing");
    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("No encontré esa franja en este flyer.");
  });
});

describe("Sugerir marcas", () => {
  it("fills the places, marks them, and they go away together", async () => {
    const many = Array.from({ length: 9 }, (_brand, index) =>
      brand(`Marca ${String(index)}`, { subtitulo: index % 2 ? "Hogar" : "Moda" }),
    );
    await open({ catalog: many });
    await tick("Marca 0");
    await button(/Sugerir marcas/).click();
    await expect.element(button("Quitar sugeridas")).toBeVisible();
    expect(chosenLogos()).toHaveLength(5);
    expect(chosenLogos()[0]).toBe("Marca 0.png");
    await expect.element(page.getByRole("status")).toMatchTextContent(/Sugerimos 4 marcas/);
    expect(row(1).element().querySelector("[data-part=suggested]")).not.toBeNull();
    await button("Quitar sugeridas").click();
    expect(chosenLogos()).toEqual(["Marca 0.png"]);
    await expect.element(page.getByRole("status")).toHaveTextContent("Se quitaron 4 sugeridas.");
  });

  it("with all the places taken, or with nothing to suggest, it says so", async () => {
    await open({ catalog: [brand("Una")] });
    await tick("Una");
    await button(/Sugerir marcas/).click();
    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("No hay más marcas vigentes con esos filtros.");
    strip().change((now) => ({
      ...now,
      selection: Array.from({ length: 5 }, (_pick, index) => ({
        img: `${String(index)}.png`,
        t: String(index),
      })),
    }));
    await button(/Sugerir marcas/).click();
    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent(
        "La franja ya tiene sus 5 lugares ocupados. Quitá alguna para que te sugiera otras.",
      );
  });

  it("with fewer than places it says that the others are left, and where", async () => {
    await open({ catalog: [brand("Una", { provincias: ["SALTA"] })] });
    await page.getByTestId("brand-province").selectOptions("SALTA");
    await page.getByRole("combobox", { name: "Rubro" }).selectOptions("Indumentaria");
    await button(/Sugerir marcas/).click();
    await expect
      .element(page.getByRole("status"))
      .toMatchTextContent(/encontré 1 marca de Indumentaria en Salta; los otros lugares/);
  });

  it("logos that do not come down are not suggested", async () => {
    await open({ catalog: [brand("Una")], fetchLogo: () => Promise.reject(new Error("No")) });
    await button(/Sugerir marcas/).click();
    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("No se pudieron bajar los logos sugeridos. Probá de nuevo.");
    expect(chosenLogos()).toEqual([]);
  });

  it("if the window closed while they came down, nothing happens", async () => {
    const logos = deferred<null>();
    await open({
      catalog: [brand("Una")],
      fetchLogo: async () => {
        await logos.promise;
        return paintedLogo(100, 60);
      },
    });
    await button(/Sugerir marcas/).click();
    await expect.element(button("Sugiriendo…")).toBeDisabled();
    const session = strip();
    await button("Cancelar").click();
    logos.resolve(null);
    await vi.waitFor(() => {
      expect(session.isAlive()).toBe(false);
    });
    expect(session.getState().selection).toEqual([]);
  });
});

function fullScreen() {
  const asked: ManyBrandsRequest[] = [];
  return {
    asked,
    files: ALLOWED,
    picker: {
      pickManyBrands: (request: ManyBrandsRequest) => {
        asked.push(request);
      },
    },
  };
}

describe("choosing at full screen", () => {
  it("the window goes away and comes back with what was chosen, on the second step", async () => {
    const { asked, files, picker } = fullScreen();
    await open({ files, picker });
    await tick("Adidas");
    strip().change((now) => ({
      ...now,
      selection: now.selection.map((pick) => Object.assign({}, pick, { k: 2 })),
    }));
    const session = strip();
    await page.getByTestId("brand-province").selectOptions("MENDOZA");
    await button("Elegir en pantalla completa").click();
    await expect.element(stripWindow()).not.toBeInTheDocument();
    expect(session.isAlive()).toBe(true);
    const [request] = asked;
    if (!request) throw new Error("It did not go to choose");
    expect(request.filters.province).toBe("MENDOZA");
    expect(request.picked).toEqual([{ logo: "Adidas.png", title: "Adidas" }]);
    expect(request.limit).toBe(30);
    request.onAdd({ logo: "Puppis.png", title: "Puppis" });
    handles.filters?.publish({ ...NO_PROMOTION_FILTERS, province: "SALTA", category: "Mascotas" });
    request.onBack([
      { logo: "Puppis.png", title: "Puppis" },
      { logo: "Adidas.png", title: "Adidas" },
    ]);
    await expect.element(stripWindow()).toBeVisible();
    expect(strip()).toBe(session);
    expect(session.getState().selection).toEqual([
      { img: "Puppis.png", t: "Puppis" },
      { img: "Adidas.png", t: "Adidas", k: 2 },
    ]);
    await expect.element(page.getByTestId("brand-province")).toHaveValue("SALTA");
    await expect.element(page.getByRole("combobox", { name: "Rubro" })).toHaveValue("Mascotas");
  });

  it("Cancelar there leaves nothing alive", async () => {
    const { asked, files, picker } = fullScreen();
    await open({ files, picker });
    const session = strip();
    await button("Elegir en pantalla completa").click();
    asked[0]?.onCancel();
    expect(session.isAlive()).toBe(false);
  });

  it("a logo that does not come down there is not a problem yet", async () => {
    const { asked, files, picker } = fullScreen();
    await open({ files, picker, fetchLogo: () => Promise.reject(new Error("No")) });
    await button("Elegir en pantalla completa").click();
    asked[0]?.onAdd({ logo: "Puppis.png", title: "Puppis" });
    expect(theEditor().getState().strip).toBeNull();
  });

  it("if the flyer changed the brands wait for a new strip, and they are used up by it", async () => {
    const { asked, picker } = fullScreen();
    await open({
      picker,
      files: {
        "_opciones.json": {
          opts: [
            { n: 9, nombre: "Combustible", solapa: "flyer" },
            { n: 3, nombre: "Otro", solapa: "flyer" },
          ],
        },
        "_facultades.json": {
          roles: { asesor: { opcion_9: true, opcion_3: true, promos_buscar: true } },
        },
        "_active3.json": {
          name: "",
          imageUrl: paintedFlyer([...ROW_BLOCKS, { x: 10, y: 10, w: 20, h: 20, color: "#000000" }]),
          cfg: {},
        },
        "_legal3.json": { text: "Legal" },
      },
    });
    await tick("Adidas");
    await page.getByRole("combobox", { name: "Por fila" }).selectOptions("4");
    await button("Elegir en pantalla completa").click();
    const art = theEditor().currentArt();
    await workspaceOnScreen().selectOption(3, false);
    await vi.waitFor(() => {
      expect(theEditor().currentArt()).not.toBe(art);
    });
    handles.filters?.publish({ ...NO_PROMOTION_FILTERS, category: "Mascotas" });
    asked[0]?.onBack([
      { logo: "Adidas.png", title: "Adidas" },
      { logo: "Puppis.png", title: "Puppis" },
    ]);
    await expect
      .element(page.getByRole("status"))
      .toMatchTextContent(/Cambió el flyer mientras elegías.*tus 2 marcas siguen elegidas/);
    expect(theEditor().getState().mode).toBe("strip");
    expect(theEditor().getState().strip).toBeNull();
    expect(theEditor().active()).toEqual([]);

    drag(STRIP_FROM, STRIP_TO);
    await expect.element(stripWindow()).toBeVisible();
    expect(strip().getState()).toMatchObject({ perRow: 4 });
    expect(chosenLogos()).toEqual(["Adidas.png", "Puppis.png"]);
    await expect.element(page.getByRole("combobox", { name: "Rubro" })).toHaveValue("Mascotas");
    await button("Cancelar").click();

    await button("Armar franja").click();
    drag(STRIP_FROM, STRIP_TO);
    await expect.element(stripWindow()).toBeVisible();
    expect(chosenLogos()).toEqual([]);
  });

  it("what waits for a new strip goes away with Cancelar franja and with Listo", async () => {
    const { asked, files, picker } = fullScreen();
    await open({ files, picker });
    await tick("Adidas");
    await button("Elegir en pantalla completa").click();
    const editor = theEditor();
    const pending = {
      selection: [{ img: "Adidas.png", t: "Adidas" }],
      perRow: 0,
      filters: {
        search: "",
        category: "",
        province: "",
        locality: "",
        onePerBrand: true,
        hideOnline: false,
        onlyPercent: false,
      },
    };
    expect(asked).toHaveLength(1);
    editor.keepForNewStrip(pending);
    await button("Cancelar franja").click();
    await button("Armar franja").click();
    drag(STRIP_FROM, STRIP_TO);
    await expect.element(stripWindow()).toBeVisible();
    expect(chosenLogos()).toEqual([]);
    await button("Cancelar").click();

    editor.keepForNewStrip(pending);
    await expect.element(button("Cancelar franja")).toBeVisible();
    await button("Listo").click();
    await button("Cambiar logos").click();
    await button("Armar franja").click();
    drag(STRIP_FROM, STRIP_TO);
    await expect.element(stripWindow()).toBeVisible();
    expect(chosenLogos()).toEqual([]);
  });

  it("without the permission of Promociones it is not offered", async () => {
    await open({
      files: {
        "_facultades.json": { roles: { asesor: { opcion_9: true, promos_buscar: false } } },
      },
    });
    await expect.element(button("Elegir en pantalla completa")).not.toBeInTheDocument();
  });

  it("a new strip leaves behind what was being chosen", async () => {
    const stop = vi.fn<() => void>();
    await open({ picker: { stopPicking: stop } });
    expect(stop).toHaveBeenCalled();
  });
});

describe("on a phone", () => {
  beforeEach(async () => {
    await page.viewport(390, 844);
  });

  it("goes in two steps", async () => {
    await open();
    await tick("Adidas");
    await expect.element(page.getByTestId("strip-preview")).not.toBeVisible();
    await expect
      .element(page.getByRole("tab", { name: /^1\. Elegir marcas/ }))
      .toMatchTextContent(/\(1\)/);
    await expect.element(button(/^Siguiente: ordenar \(1\)/)).toBeVisible();
    await button(/^Siguiente/).click();
    await expect.element(page.getByTestId("strip-preview")).toBeVisible();
    await expect.element(page.getByTestId("brand-list")).not.toBeVisible();
    await button("← Elegir más").click();
    await expect.element(page.getByTestId("brand-list")).toBeVisible();
    await page.getByRole("tab", { name: /^2\. Ordenar y ver/ }).click();
    await expect.element(page.getByTestId("strip-preview")).toBeVisible();
    await page.getByRole("tab", { name: /^1\. Elegir marcas/ }).click();
    await expect.element(page.getByTestId("brand-list")).toBeVisible();
  });
});

describe("what a test can read", () => {
  it("with no window or flyer there is nothing to read", async () => {
    await openEditor({ blocks: ROW_BLOCKS });
    await waitForFlyer();
    expect(probe().strip()).toBeNull();
    expect(probe().selectionFacts("SALTA")).toEqual([]);
    expect(probe().detectStrip(100, 280, 500, 180)).toMatchObject({ logos: 5 });
    expect(probe().topCategoryIn("NINGUNA")).toBe("");
  });

  it("reads the strip, what is offered and what the catalog knows", async () => {
    await open();
    expect(window["__flyerProbe"]?.["logoStripWindow"]).toBeDefined();
    await tick("Coto");
    await logosDrawn(1);
    const read = probe().strip();
    expect(read).toMatchObject({
      resuming: false,
      perRow: 0,
      sizeOfAll: 1,
      marked: -1,
      chosen: [],
      originalLogos: 5,
      brands: [{ logo: "Coto.png", title: "Coto", size: 1, suggested: false }],
    });
    expect(probe().selectionFacts("MENDOZA")[0]).toMatchObject({
      logo: "Coto.png",
      category: "Supermercados",
      hasLocalPromotion: true,
      hasPromotionThereOrOnline: true,
    });
    expect(probe().selectionFacts("NEUQUEN")[0]).toMatchObject({
      hasLocalPromotion: false,
      hasPromotionThereOrOnline: false,
    });
    expect(probe().topCategoryIn("SALTA")).toBe("Supermercados");
    expect(probe().catalogRows()).toHaveLength(CATALOG.length);
    expect(client(0, 0).clientX).toBeTypeOf("number");
    key("Escape");
  });
});
