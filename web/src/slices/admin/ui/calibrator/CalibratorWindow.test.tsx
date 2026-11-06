// The calibrator on screen: its chips, its fields, its bases and templates, the zoom, its size, and
// the canvas that is dragged.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { createAppHarness } from "@/shared/lib/testing/app-harness.tsx";
import { startingCalibration } from "../../model/calibrator/calibration.ts";
import {
  type CalibratorSource,
  createCalibratorStore,
  openBenefit,
} from "../../model/calibrator/calibrator-store.ts";
import { EDITOR_SIZE_KEY } from "../../model/calibrator/editor-size.ts";
import { zoneRects } from "../../model/calibrator/zones.ts";
import { CalibratorWindow } from "./CalibratorWindow.tsx";

/** A flyer with the benefit box of Rubros: a panel of one color with its drawing on the left. */
function flyerWithBox(): HTMLCanvasElement {
  const canvas = whiteFlyer();
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No canvas");
  context.fillStyle = "rgb(205, 222, 240)";
  context.fillRect(100, 2500, 1040, 300);
  context.fillStyle = "#333333";
  context.fillRect(150, 2490, 301, 320);
  return canvas;
}

function whiteFlyer(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 1240;
  canvas.height = 6457;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No canvas");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, 1240, 6457);
  return canvas;
}

async function openCalibrator(source: Partial<CalibratorSource> = {}) {
  const store = createCalibratorStore(
    {
      image: whiteFlyer(),
      name: "flyer_1_op9.jpg",
      url: "u",
      option: 9,
      optionName: "Combustible",
      tab: "flyer",
      ...source,
    },
    startingCalibration(),
    window.innerWidth,
  );
  const template = openBenefit(store);
  const onSave = vi.fn<() => void>();
  const onClose = vi.fn<() => void>();
  const harness = createAppHarness();
  const screen = await render(
    harness.wrap(
      <CalibratorWindow
        calibrator={{ store, template }}
        saving={false}
        onSave={onSave}
        onClose={onClose}
      />,
    ),
  );
  await expect.element(page.getByTestId("calibrator")).toBeVisible();
  return { store, onSave, onClose, screen };
}

const editor = () => page.getByTestId("calibrator");
const chip = (id: string) => editor().element().querySelector<HTMLElement>(`[data-zone="${id}"]`);
const notice = () => page.getByRole("status");

function canvasPoint(store: ReturnType<typeof createCalibratorStore>, zone: string) {
  const rect = zoneRects(store.frame())[zone];
  const canvas = editor().getByTestId("calibrator-canvas").element().getBoundingClientRect();
  if (!rect) throw new Error(zone);
  return {
    x: canvas.left + (rect.x + rect.w / 2) * store.scale(),
    y: canvas.top + (rect.y + rect.h / 2) * store.scale(),
  };
}

function pointer(type: string, target: Element, x: number, y: number, extra: object = {}) {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      pointerId: 1,
      ...extra,
    }),
  );
}

beforeEach(async () => {
  await page.viewport(1366, 800);
});

afterEach(() => {
  localStorage.removeItem(EDITOR_SIZE_KEY);
});

async function repeat(times: number, act: () => Promise<void>): Promise<void> {
  if (times === 0) return;
  await act();
  await repeat(times - 1, act);
}

describe("the calibrator", () => {
  it("says which flyer it is, and offers the zones of its tab", async () => {
    await openCalibrator();
    expect(editor().getByRole("heading").element().textContent).toBe(
      "Calibrar flyer — Combustible",
    );
    expect(chip("mb3")?.textContent).toBe("Plus");
    expect(chip("cashback")).toBeNull();
    await expect.element(editor().getByText("Altura final (px):")).toBeVisible();
    expect(editor().getByTestId("zone-properties").query()).toBeNull();
  });

  it("a chip chooses the zone and shows its fields; again, lets it go", async () => {
    const { store } = await openCalibrator();
    await userEvent.click(chip("empresa") ?? document.body);
    expect(chip("empresa")?.getAttribute("aria-pressed")).toBe("true");
    const fields = editor().getByTestId("zone-properties");
    expect(fields.element().querySelector("b")?.textContent).toBe("Empresa");
    expect(
      [...fields.element().querySelectorAll("label")].map((label) => label.firstChild?.textContent),
    ).toEqual(["Letra px", "Peso", "Color", "Ancho máx."]);
    await userEvent.fill(fields.getByRole("spinbutton").first(), "60");
    await userEvent.selectOptions(fields.getByRole("combobox"), "400");
    expect(store.cfg.empresa).toMatchObject({ fs: 60, peso: "400" });
    await userEvent.click(fields.getByRole("button", { name: "Restablecer" }));
    expect(store.cfg.empresa.fs).toBe(46);
    await expect.element(fields.getByRole("spinbutton").first()).toHaveValue(46);
    await userEvent.click(chip("empresa") ?? document.body);
    expect(store.chosen()).toBeNull();
  });

  it("the group of amounts colors each box; a box has its own width", async () => {
    const { store } = await openCalibrator();
    await userEvent.click(chip("montos") ?? document.body);
    const colors = editor().getByTestId("zone-properties").getByTitle("Monto 2");
    const input = colors.element();
    if (!(input instanceof HTMLInputElement)) throw new Error("color");
    input.value = "#123456";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(store.cfg.montos.boxes[1]?.col).toBe("#123456");
    await userEvent.click(chip("mb1") ?? document.body);
    await expect
      .poll(() => editor().getByTestId("zone-properties").element().querySelector("b")?.textContent)
      .toBe("Eminent Platinum");
    const color = editor()
      .getByTestId("zone-properties")
      .element()
      .querySelector("input[type=color]");
    if (!(color instanceof HTMLInputElement)) throw new Error("color");
    color.value = "#654321";
    color.dispatchEvent(new Event("input", { bubbles: true }));
    expect(store.cfg.montos.boxes[1]?.col).toBe("#654321");
  });

  it("a base fills its zones and says so; the height is chosen or automatic", async () => {
    const { store } = await openCalibrator();
    await userEvent.selectOptions(
      editor().getByRole("combobox"),
      "Pasá tu sueldo: súper + combustible",
    );
    await userEvent.click(editor().getByRole("button", { name: "Cargar base" }));
    expect(store.cfg.imgH).toBe(7711);
    await expect
      .element(notice())
      .toHaveTextContent(
        "Base «Pasá tu sueldo: súper + combustible» cargada. Si no era, cerrá sin guardar.",
      );
    const height = editor().getByPlaceholder("auto");
    await userEvent.fill(height, "5000");
    await userEvent.keyboard("{Enter}");
    expect(store.cfg.cropH).toBe(5000);
    await userEvent.click(editor().getByRole("button", { name: "Auto" }));
    expect(store.cfg.cropH).toBe(0);
    await userEvent.fill(height, "4000");
    await userEvent.click(editor().getByRole("heading"));
    expect(store.cfg.cropH).toBe(4000);
  });

  it("zooms with its buttons up to 130 %, and back", async () => {
    await openCalibrator();
    const label = editor().getByTestId("calibrator-zoom");
    await expect.element(label).toHaveTextContent("100%");
    const closer = editor().getByRole("button", { name: "Acercar" });
    await userEvent.click(closer);
    await userEvent.click(closer);
    await userEvent.click(closer);
    await expect.element(label).toHaveTextContent("130%");
    await userEvent.click(editor().getByRole("button", { name: "Alejar" }));
    await expect.element(label).toHaveTextContent("104%");
    await userEvent.click(label);
    await expect.element(label).toHaveTextContent("100%");
  });

  it("Ctrl + wheel zooms once per frame; the wheel alone does not", async () => {
    const { store } = await openCalibrator();
    const canvas = editor().getByTestId("calibrator-canvas").element();
    canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true }));
    canvas.dispatchEvent(
      new WheelEvent("wheel", { deltaY: -100, ctrlKey: true, bubbles: true, cancelable: true }),
    );
    canvas.dispatchEvent(
      new WheelEvent("wheel", { deltaY: 100, ctrlKey: true, bubbles: true, cancelable: true }),
    );
    canvas.dispatchEvent(
      new WheelEvent("wheel", { deltaY: -100, ctrlKey: true, bubbles: true, cancelable: true }),
    );
    await expect.poll(() => store.scale()).toBeCloseTo(store.startScale() * 1.15);
  });

  it("a zone is dragged on the picture, and a click elsewhere takes nothing", async () => {
    const { store } = await openCalibrator();
    const canvas = editor().getByTestId("calibrator-canvas").element();
    pointer("pointerdown", canvas, 2, 2);
    expect(store.chosen()).toBeNull();
    const start = canvasPoint(store, "empresa");
    pointer("pointerdown", canvas, start.x, start.y);
    expect(store.chosen()).toBe("empresa");
    pointer("pointermove", canvas, start.x, start.y + 40 * store.scale());
    pointer("pointerup", window.document.body, start.x, start.y);
    expect(store.cfg.empresa.yc).toBeCloseTo(765, 0);
    pointer("pointermove", canvas, start.x, start.y + 400);
    pointer("pointerup", window.document.body, 0, 0);
    expect(store.cfg.empresa.yc).toBeCloseTo(765, 0);
  });

  it("the arrows move the chosen zone, ten with Shift", async () => {
    const { store } = await openCalibrator();
    await userEvent.keyboard("{ArrowDown}");
    expect(store.cfg.empresa.yc).toBe(725);
    await userEvent.click(chip("empresa") ?? document.body);
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{Shift>}{ArrowRight}{/Shift}");
    expect(store.cfg.empresa).toMatchObject({ yc: 726, xc: 630 });
    await userEvent.keyboard("x");
    expect(store.cfg.empresa.yc).toBe(726);
  });

  it("saves and closes by its buttons; Escape does nothing", async () => {
    const { onSave, onClose } = await openCalibrator();
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(editor().getByRole("button", { name: "Guardar y activar" }));
    await userEvent.click(editor().getByRole("button", { name: "Cerrar" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a test reads what it would save and where each zone is, without changing anything", async () => {
    const { store, screen } = await openCalibrator();
    const read = window["__flyerProbe"]?.calibrator;
    expect(read?.()).toMatchObject({ scale: store.scale(), calibration: { imgH: 6457 } });
    await screen.unmount();
    expect(window["__flyerProbe"]?.calibrator).toBeUndefined();
  });
});

describe("the size of the editor", () => {
  it("«Ampliar» takes almost the whole window, and again brings it back; it is remembered", async () => {
    await openCalibrator();
    const card = editor().element();
    const normal = card.getBoundingClientRect().width;
    await userEvent.click(editor().getByRole("button", { name: /Ampliar/ }));
    expect(card.getBoundingClientRect().width).toBeGreaterThan(normal);
    expect(JSON.parse(localStorage.getItem(EDITOR_SIZE_KEY) ?? "{}")).toMatchObject({
      w: window.innerWidth - 32,
    });
    await userEvent.click(editor().getByRole("button", { name: /Ampliar/ }));
    expect(card.getBoundingClientRect().width).toBe(normal);
  });

  it("the bar and the corner are dragged, and a double click forgets them", async () => {
    localStorage.setItem(EDITOR_SIZE_KEY, JSON.stringify({ w: 900, h: 700 }));
    await openCalibrator();
    const card = editor().element();
    expect(card.getBoundingClientRect().width).toBe(900);
    const split = editor().getByTestId("calibrator-split").element();
    const picture = editor().getByTestId("calibrator-picture").element();
    const before = picture.getBoundingClientRect().height;
    pointer("pointerdown", split, 10, 300);
    pointer("pointermove", split, 10, 260);
    pointer("pointerup", split, 10, 260);
    expect(picture.getBoundingClientRect().height).toBeLessThan(before);
    expect(JSON.parse(localStorage.getItem(EDITOR_SIZE_KEY) ?? "{}").bh).toBeGreaterThan(0);
    split.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(JSON.parse(localStorage.getItem(EDITOR_SIZE_KEY) ?? "{}").bh).toBeUndefined();
    const corner = editor().getByTestId("calibrator-corner").element();
    pointer("pointerdown", corner, 500, 500);
    pointer("pointermove", corner, 450, 480);
    pointer("pointerup", corner, 450, 480);
    expect(card.getBoundingClientRect().width).toBe(800);
    pointer("pointermove", corner, 400, 400);
    expect(card.getBoundingClientRect().width).toBe(800);
    corner.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(localStorage.getItem(EDITOR_SIZE_KEY)).toBe("{}");
  });
});

describe("the benefit of Flyer Rubros", () => {
  it("has its table of lines, from the template of the option", async () => {
    await openCalibrator({ tab: "rubros", optionName: "Supermercado" });
    expect(editor().getByRole("heading").element().textContent).toBe(
      "Calibrar flyer — Supermercado (Flyer Rubros)",
    );
    await expect.element(editor().getByLabelText("Plantilla")).toHaveValue("supermercado");
    expect(editor().getByTestId("benefit-line").all()).toHaveLength(5);
    expect(chip("blAll")?.textContent).toBe("Cartel (todo)");
  });

  it("a line is written, sized, colored and aligned; another is added and one taken out", async () => {
    const { store } = await openCalibrator({ tab: "rubros" });
    const first = editor().getByTestId("benefit-line").first();
    await userEvent.fill(first.getByRole("textbox").first(), "Hola {nombre}");
    await userEvent.fill(first.getByRole("spinbutton"), "20");
    await userEvent.selectOptions(first.getByRole("combobox").first(), "600");
    await userEvent.selectOptions(first.getByRole("combobox").last(), "left");
    const color = first.element().querySelector("input[type=color]");
    if (!(color instanceof HTMLInputElement)) throw new Error("color");
    color.value = "#00ff00";
    color.dispatchEvent(new Event("input", { bubbles: true }));
    expect(store.cfg.benef.lineas?.[0]).toMatchObject({
      t: "Hola {nombre}",
      fs: 20,
      peso: 600,
      align: "left",
      color: "#00ff00",
    });
    expect(chip("bl0")?.textContent).toBe("Hola NOMBRE");
    await userEvent.click(editor().getByRole("button", { name: "+ Línea" }));
    expect(editor().getByTestId("benefit-line").all()).toHaveLength(7);
    expect(document.activeElement instanceof HTMLInputElement && document.activeElement.value).toBe(
      "Nueva línea",
    );
    await userEvent.click(editor().getByRole("button", { name: "Quitar la línea 7" }));
    expect(store.cfg.benef.lineas).toHaveLength(6);
    await userEvent.click(editor().getByRole("button", { name: "Elegir la línea 2 en la imagen" }));
    expect(store.chosen()).toBe("bl1");
  });

  it("a template asks before replacing the lines, and Cancelar leaves them", async () => {
    const { store } = await openCalibrator({ tab: "rubros" });
    await userEvent.selectOptions(editor().getByLabelText("Plantilla"), "adicional");
    await userEvent.click(editor().getByRole("button", { name: "Cargar plantilla" }));
    const question = page.getByRole("alertdialog");
    await expect
      .poll(() => question.element().querySelector("h2")?.textContent)
      .toBe('¿Reemplazar las líneas actuales por la plantilla "Promo adicional: combustible"?');
    await userEvent.click(question.getByRole("button", { name: "Cancelar" }));
    expect(store.cfg.benef.lineas).toHaveLength(6);
    await userEvent.click(editor().getByRole("button", { name: "Cargar plantilla" }));
    await userEvent.click(
      page.getByRole("alertdialog").getByRole("button", { name: "Reemplazar" }),
    );
    expect((store.cfg.benef.lineas ?? []).map(({ x }) => x)).toEqual([119, 673]);
    await expect.poll(() => notice().element().textContent).toMatch(/cargada en su posición/);
  });

  it("with no lines the template goes in without asking; centering says what it found", async () => {
    const { store } = await openCalibrator({ tab: "rubros" });
    await userEvent.click(editor().getByRole("button", { name: /Centrar en el cuadro/ }));
    await expect.poll(() => notice().element().textContent).toMatch(/No encontré el cuadro/);
    await repeat(6, () =>
      userEvent.click(editor().getByRole("button", { name: "Quitar la línea 1" })),
    );
    await userEvent.click(editor().getByRole("button", { name: /Centrar en el cuadro/ }));
    await userEvent.click(editor().getByRole("button", { name: "Cargar plantilla" }));
    expect(page.getByRole("alertdialog").query()).toBeNull();
    expect(store.cfg.benef.lineas).toHaveLength(6);
  });
});

describe("what the fields show", () => {
  it("what is saved, or the default when the calibration says nothing", async () => {
    const { store } = await openCalibrator({ tab: "rubros" });
    Reflect.deleteProperty(store.cfg.empresa, "peso");
    Reflect.deleteProperty(store.cfg.empresa, "mw");
    store.takeSaved({ benef: { lineas: [{ t: "Sola", x: 100, y: 2600, align: "left" }] } });
    await userEvent.click(chip("empresa") ?? document.body);
    const fields = editor().getByTestId("zone-properties");
    await expect.element(fields.getByRole("combobox")).toHaveValue("700");
    await expect.element(fields.getByRole("spinbutton").last()).toHaveValue(null);
    const line = editor().getByTestId("benefit-line").first();
    await expect.element(line.getByRole("spinbutton")).toHaveValue(17);
    await expect.element(line.getByRole("combobox").last()).toHaveValue("left");
    expect(line.element().querySelector<HTMLInputElement>("input[type=color]")?.value).toBe(
      "#000000",
    );
  });
});

describe("on a phone", () => {
  it("the editor keeps its size as it comes, whatever was saved", async () => {
    await page.viewport(390, 800);
    localStorage.setItem(EDITOR_SIZE_KEY, JSON.stringify({ w: 900, h: 700, bh: 300 }));
    await openCalibrator();
    expect(editor().element().style.width).toBe("");
    expect(editor().getByTestId("calibrator-picture").element().style.height).toBe("");
    const split = editor().getByTestId("calibrator-split").element();
    pointer("pointerdown", split, 10, 300);
    pointer("pointerup", split, 10, 300);
    expect(JSON.parse(localStorage.getItem(EDITOR_SIZE_KEY) ?? "{}")).toEqual({
      w: 900,
      h: 700,
      bh: 300,
    });
  });
});

describe("the templates on a picture with the box", () => {
  it("a measured template stays where it was measured; another is centered on the box", async () => {
    const { store } = await openCalibrator({
      tab: "rubros",
      optionName: "Promo adicional",
      image: flyerWithBox(),
    });
    expect((store.cfg.benef.lineas ?? []).map(({ x }) => x)).toEqual([119, 673]);
    await userEvent.selectOptions(editor().getByLabelText("Plantilla"), "supermercado");
    await userEvent.click(editor().getByRole("button", { name: "Cargar plantilla" }));
    await userEvent.click(
      page.getByRole("alertdialog").getByRole("button", { name: "Reemplazar" }),
    );
    expect(new Set((store.cfg.benef.lineas ?? []).map(({ x }) => x))).toEqual(new Set([795]));
    await expect
      .poll(() => notice().element().textContent)
      .toBe('Plantilla "Supermercado" cargada y centrada en el cuadro.');
    await userEvent.click(editor().getByRole("button", { name: /Centrar en el cuadro/ }));
    await expect.poll(() => notice().element().textContent).toBe("Cartel centrado en el cuadro.");
    await userEvent.selectOptions(editor().getByLabelText("Plantilla"), "adicional");
    await userEvent.click(editor().getByRole("button", { name: "Cargar plantilla" }));
    await userEvent.click(
      page.getByRole("alertdialog").getByRole("button", { name: "Reemplazar" }),
    );
    expect((store.cfg.benef.lineas ?? []).map(({ x }) => x)).toEqual([119, 673]);
  });
});
