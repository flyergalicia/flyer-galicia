import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import {
  paintedFlyer,
  readingsOnScreen,
  workspaceOnScreen,
} from "@/shared/lib/flyer-workspace/testing/painted-flyer.ts";
import { forgetPickerFilters } from "../model/brand-picker.ts";
import {
  client,
  drag,
  handles,
  key,
  LOGO_A,
  LOGO_B,
  openEditor,
  theEditor,
  touch,
  waitForFlyer,
} from "../testing/editor-cloud.ts";

const SOURCE_BLOCKS = [
  { x: 100, y: 100, w: 600, h: 200, color: "#123456" },
  { x: 100, y: 500, w: 600, h: 200, color: "#654321" },
];
const SOURCE_FILE = { id: "f1", nombre: "Shoppings", img: paintedFlyer(SOURCE_BLOCKS), mini: "" };
const TWO_SOURCES = {
  lista: [
    SOURCE_FILE,
    {
      ...SOURCE_FILE,
      id: "f2",
      nombre: "",
      img: paintedFlyer([]),
      mini: "data:image/jpeg;base64,x",
    },
    { id: "", img: "nada" },
    3,
  ],
};

function bar() {
  return page.getByTestId("logo-editor-bar");
}

function pointerOnCanvas(type: string, x: number, y: number, fields: PointerEventInit = {}) {
  const at = client(x, y);
  const target =
    type === "pointerdown" ? document.querySelector('[data-testid="flyer-canvas"]') : document;
  target?.dispatchEvent(new PointerEvent(type, { ...at, button: 0, bubbles: true, ...fields }));
}

async function enter() {
  await waitForFlyer();
  await page.getByRole("button", { name: "Cambiar logos" }).click();
  await expect.element(page.getByRole("button", { name: "Listo" })).toBeVisible();
}

function height() {
  return workspaceOnScreen().getState().slot.scene?.art.height ?? 0;
}

async function trim(from: number, to: number) {
  await bar().getByRole("button", { name: "Recortar" }).click();
  drag([300, from], [300, to]);
  await page.getByRole("dialog").getByRole("button", { name: "Quitar esta parte" }).click();
}

function settled() {
  return vi.waitFor(() => {
    expect(theEditor().isSettled()).toBe(true);
  });
}

async function markOnSheet(from: number, to: number) {
  const sheet = page.getByTestId("section-sheet").element();
  const { top, height: tall } = sheet.getBoundingClientRect();
  const factor = tall / 900;
  const at = (y: number) => ({ clientY: top + y * factor, bubbles: true, button: 0, pointerId: 1 });
  vi.spyOn(sheet, "setPointerCapture").mockImplementation(() => undefined);
  sheet.dispatchEvent(new PointerEvent("pointerdown", at(from)));
  sheet.dispatchEvent(new PointerEvent("pointermove", at(to)));
  sheet.dispatchEvent(new PointerEvent("pointerup", at(to)));
}

async function copyASection() {
  await bar().getByRole("button", { name: "Insertar" }).click();
  await expect.element(page.getByTestId("section-sheet")).toBeVisible();
  await markOnSheet(90, 310);
  await expect.element(page.getByRole("button", { name: "Copiar esta sección" })).toBeEnabled();
  await page.getByRole("button", { name: "Copiar esta sección" }).click();
  await vi.waitFor(() => {
    expect(theEditor().getState().mode).toBe("insert");
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
  vi.restoreAllMocks();
});

describe("Recortar", () => {
  it("drags, shows and asks; only on confirming the flyer changes", async () => {
    await openEditor();
    await enter();
    const whole = height();
    await bar().getByRole("button", { name: "Recortar" }).click();
    await expect.element(bar().getByRole("button", { name: "Cancelar recorte" })).toBeVisible();
    pointerOnCanvas("pointerdown", 300, 300);
    pointerOnCanvas("pointermove", 300, 500);
    await expect.element(page.getByTestId("trim-band")).toBeVisible();
    pointerOnCanvas("pointerup", 300, 500);
    await expect.element(page.getByText("Se quita esta parte")).toBeVisible();
    expect(height()).toBe(whole);
    await expect.element(bar().getByRole("button", { name: "Recortar" })).toBeVisible();
    key("r");
    expect(theEditor().getState().mode).toBe("none");
    key("Escape");
    await expect.element(page.getByText("Se quita esta parte")).not.toBeInTheDocument();
    expect(height()).toBe(whole);
  });

  it("takes the band out; the logos go up, those inside go, and it says so", async () => {
    await openEditor({ blocks: [LOGO_A, LOGO_B] });
    await enter();
    const editor = theEditor();
    const art = editor.picture();
    if (!art) throw new Error("No flyer");
    editor.placeLogo({ x: 100, y: 600, w: 80, h: 40, bg: "rgb(255,255,255)" }, "", "", null);
    editor.placeLogo({ x: 300, y: 300, w: 80, h: 40, bg: "rgb(255,255,255)" }, "", "", null);
    await settled();
    await vi.waitFor(() => {
      expect(editor.works.activeWork()?.temp).toBe(true);
    });
    const whole = height();
    await trim(280, 420);
    const [cut] = editor.cuts();
    if (!cut) throw new Error("No cut");
    expect(height()).toBe(whole - cut.h);
    expect(editor.active()).toHaveLength(1);
    expect(editor.active()[0]?.oy).toBe(600 - cut.h);
    await expect.element(page.getByText(/cambio de logo quedaba adentro/)).toBeVisible();
    await expect
      .element(page.getByTestId("cuts-sign").getByText(/Recortado: 1 parte/))
      .toBeVisible();
    expect(editor.getState().history.steps.at(-1)?.label).toBe("Recortar una parte");
  });

  it("goes back to how it was with its button, and with Deshacer", async () => {
    await openEditor();
    await enter();
    const whole = height();
    await trim(300, 450);
    const cropped = height();
    expect(cropped).toBeLessThan(whole);
    await page
      .getByTestId("cuts-sign")
      .getByRole("button", { name: "Volver a como estaba" })
      .click();
    expect(height()).toBe(whole);
    await expect.element(page.getByText("El flyer volvió a estar entero.")).toBeVisible();
    expect(theEditor().cuts()).toEqual([]);
    await bar().getByRole("button", { name: "Deshacer" }).click();
    await vi.waitFor(() => {
      expect(height()).toBe(cropped);
    });
    await bar().getByRole("button", { name: "Deshacer" }).click();
    await vi.waitFor(() => {
      expect(height()).toBe(whole);
    });
    await bar().getByRole("button", { name: "Rehacer" }).click();
    await vi.waitFor(() => {
      expect(height()).toBe(cropped);
    });
  });

  it("explains a touch, a band too thin or too large, and a band on the officers", async () => {
    await openEditor();
    await enter();
    await bar().getByRole("button", { name: "Recortar" }).click();
    touch(300, 300);
    await expect.element(page.getByRole("status").getByText(/Arrastrá de arriba/)).toBeVisible();
    await bar().getByRole("button", { name: "Cancelar recorte" }).click();
    expect(theEditor().getState().mode).toBe("none");
    await bar().getByRole("button", { name: "Recortar" }).click();
    drag([300, 10], [300, 800]);
    await expect.element(page.getByText(/Es demasiado para quitar/)).toBeVisible();
    await bar().getByRole("button", { name: "Recortar" }).click();
    const canvas = document.querySelector('[data-testid="flyer-canvas"]');
    canvas?.dispatchEvent(
      new PointerEvent("pointerdown", { ...client(300, 300), button: 0, bubbles: true }),
    );
    document.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true }));
    expect(theEditor().getState().trimBand).toBeNull();
    key("Escape");
    expect(theEditor().getState().mode).toBe("none");
  });

  it("the crop goes with Restaurar and with leaving, and a late confirmation does not apply", async () => {
    await openEditor();
    await enter();
    const whole = height();
    await trim(300, 450);
    theEditor().forget();
    expect(height()).toBe(whole);
    await bar().getByRole("button", { name: "Recortar" }).click();
    drag([300, 300], [300, 450]);
    await expect.element(page.getByText("Se quita esta parte")).toBeVisible();
    await page.getByRole("button", { name: "Listo" }).click();
    await expect.element(page.getByText("Se quita esta parte")).not.toBeInTheDocument();
    expect(height()).toBe(whole);
  });

  it("the card of Montos can know it: the flyer stops carrying amounts when they are cut", async () => {
    await openEditor();
    await enter();
    const scene = workspaceOnScreen().getState().slot.scene;
    const y = scene?.calibration.montos.y ?? 0;
    const factor = (scene?.art.width ?? 1) / (scene?.calibration.imgW ?? 1);
    await bar().getByRole("button", { name: "Recortar" }).click();
    drag([300, y * factor - 20], [300, y * factor + 40]);
    await page.getByRole("dialog").getByRole("button", { name: "Quitar esta parte" }).click();
    await expect.element(page.getByText(/ya no lleva importes/)).toBeVisible();
    const readings = readingsOnScreen();
    expect(readings.legalWith("A {cashback} B")).toBe("A B");
    expect(readings.blockText()).toBe("");
    expect(readings.optionCalibration(9)).toEqual(workspaceOnScreen().optionScene(9)?.calibration);
    expect(readings.optionCalibration(77)).toEqual({});
    expect(workspaceOnScreen().currentValues().recortes).toHaveLength(1);
    expect(workspaceOnScreen().currentValues().recBase).toBeTruthy();
  });
});

describe("Insertar", () => {
  it("opens with I or its button, says when there is nothing, and when it could not read", async () => {
    await openEditor({ files: {} });
    await enter();
    key("i");
    await expect.element(page.getByText("Todavía no hay flyers para copiar.")).toBeVisible();
    await expect.element(page.getByText(/Podés proponer uno/)).toBeVisible();
    key("n");
    await page.getByRole("dialog").getByRole("button", { name: "Cancelar" }).click();
    expect(theEditor().getState().sectionPicker).toBe(false);
  });

  it("a list that could not be read is not an empty one, and can be read again", async () => {
    const { harness } = await openEditor({ droppedFiles: ["_fuentes.json"] });
    await enter();
    key("i");
    await expect.element(page.getByText(/No se pudo leer la lista/)).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Reintentar" })).toBeVisible();
    await page.getByRole("button", { name: "Reintentar" }).click();
    await expect.element(page.getByText(/No se pudo leer la lista/)).toBeVisible();
    expect(harness).toBeTruthy();
  });

  it("with several it waits for one, and a picture that does not come says so", async () => {
    const lista = [
      SOURCE_FILE,
      { id: "f2", nombre: "Rota", img: "data:image/png;base64,no", mini: "" },
    ];
    await openEditor({ files: { "_fuentes.json": { lista } } });
    await enter();
    key("i");
    await expect.element(page.getByText("Elegí un flyer de la lista.")).toBeVisible();
    await page.getByRole("button", { name: "Rota" }).click();
    await expect.element(page.getByText(/No se pudo bajar este flyer/)).toBeVisible();
    await page.getByRole("button", { name: "Rota" }).click();
    await page.getByRole("button", { name: "Shoppings" }).click();
    await expect.element(page.getByTestId("section-sheet")).toBeVisible();
  });

  it("marks, copies and places; the rest goes down and it is a step of Deshacer", async () => {
    await openEditor({ files: { "_fuentes.json": { lista: [SOURCE_FILE] } } });
    await enter();
    const editor = theEditor();
    editor.placeLogo({ x: 100, y: 700, w: 80, h: 40, bg: "rgb(255,255,255)" }, "", "", null);
    await settled();
    const whole = height();
    await bar().getByRole("button", { name: "Insertar" }).click();
    await expect.element(page.getByRole("button", { name: "Copiar esta sección" })).toBeDisabled();
    await expect.element(page.getByTestId("section-sheet")).toBeVisible();
    await markOnSheet(300, 305);
    await expect.element(page.getByText(/Arrastrá de arriba hacia abajo/)).toBeVisible();
    await markOnSheet(90, 310);
    await expect.element(page.getByTestId("section-band")).toBeVisible();
    await expect.element(page.getByText(/Marcaste \d+ px de alto/)).toBeVisible();
    await page.getByRole("button", { name: "Copiar esta sección" }).click();
    await expect.element(bar().getByRole("button", { name: "Cancelar inserción" })).toBeVisible();
    expect(editor.getState().section?.nombre).toBe("Shoppings");
    expect(editor.getState().sectionThumbnail).toMatch(/^data:image/);
    const canvas = page.getByTestId("flyer-canvas").element();
    canvas.dispatchEvent(new PointerEvent("pointermove", { ...client(300, 400), bubbles: true }));
    await expect.element(page.getByTestId("insert-line")).toBeInTheDocument();
    pointerOnCanvas("pointerdown", 300, 400);
    await expect.element(page.getByTestId("insert-line")).not.toBeInTheDocument();
    await expect.element(page.getByText(/se insertó la sección/)).toBeVisible();
    const [cut] = editor.cuts();
    expect(cut?.ins?.u).toBe(SOURCE_FILE.img);
    expect(height()).toBe(whole + (cut?.h ?? 0));
    expect(editor.active()[0]?.oy).toBe(700 + (cut?.h ?? 0));
    await expect
      .element(page.getByTestId("cuts-sign").getByText(/Insertado: 1 sección/))
      .toBeVisible();
    await page
      .getByTestId("cuts-sign")
      .getByRole("button", { name: "Volver a como estaba" })
      .click();
    expect(editor.active()[0]?.oy).toBe(700);
    expect(height()).toBe(whole);
  });

  it("with a finger it asks first, and another place can be chosen", async () => {
    await openEditor({ files: { "_fuentes.json": { lista: [SOURCE_FILE] } } });
    await enter();
    await copyASection();
    const finger = { pointerType: "touch" };
    pointerOnCanvas("pointerdown", 300, 400, finger);
    await expect.element(page.getByText(/La sección entra donde está la línea/)).toBeVisible();
    key("i");
    await page.getByRole("button", { name: "Otro lugar" }).click();
    expect(theEditor().getState().mode).toBe("insert");
    pointerOnCanvas("pointerdown", 300, 400, finger);
    await page.getByRole("button", { name: "Insertar acá" }).click();
    expect(theEditor().cuts()).toHaveLength(1);
  });

  it("I and Escape cancel placing, and what was copied is offered again", async () => {
    await openEditor({ files: { "_fuentes.json": TWO_SOURCES } });
    await enter();
    key("i");
    await page.getByRole("button", { name: "Shoppings" }).click();
    await expect.element(page.getByTestId("section-sheet")).toBeVisible();
    await markOnSheet(90, 310);
    await page.getByRole("button", { name: "Copiar esta sección" }).click();
    key("i");
    expect(theEditor().getState().mode).toBe("none");
    key("i");
    await expect.element(page.getByText("Copiadas hace poco")).toBeVisible();
    await page.getByTestId("recent-section").click();
    await vi.waitFor(() => {
      expect(theEditor().getState().mode).toBe("insert");
    });
    key("Escape");
    expect(theEditor().getState().mode).toBe("none");
  });

  it("a section still on its way is not placed: it is said, and asked for", async () => {
    await openEditor({ files: { "_fuentes.json": { lista: [SOURCE_FILE] } } });
    await enter();
    theEditor().startPlacing({ u: "data:image/png;base64,no", sy: 1, sh: 1, sw: 1 });
    pointerOnCanvas("pointerdown", 300, 400);
    await expect.element(page.getByText(/todavía se está bajando/)).toBeVisible();
    expect(theEditor().cuts()).toEqual([]);
    theEditor().stopPlacing();
  });
});

describe("the letters while editing", () => {
  it("do nothing while the band is asked about, or a place is confirmed", async () => {
    await openEditor();
    await enter();
    await bar().getByRole("button", { name: "Recortar" }).click();
    drag([300, 300], [300, 450]);
    await expect.element(page.getByText("Se quita esta parte")).toBeVisible();
    key("f");
    expect(theEditor().getState().mode).toBe("none");
    await page.getByRole("dialog").getByRole("button", { name: "Cancelar" }).click();
    expect(theEditor().getState().pendingTrim).toBeNull();
  });

  it("nothing happens with no flyer coordinates, and the actions without their object do nothing", async () => {
    await openEditor();
    await enter();
    const editor = theEditor();
    editor.confirmTrim();
    editor.confirmPlacing();
    editor.otherPlace();
    editor.backToWhole();
    editor.forgetCuts();
    editor.hoverPlacing(10);
    expect(editor.cuts()).toEqual([]);
    editor.attachCoordinates(null);
    editor.trimDragged(10, 20);
    editor.pressPlacing(10, false);
    await expect.element(page.getByText(/Ahí van los oficiales/)).toBeVisible();
  });

  it("the crop lost with a stale list is left alone, and a late confirmation is not applied", async () => {
    await openEditor();
    await enter();
    const editor = theEditor();
    const workspace = workspaceOnScreen();
    await bar().getByRole("button", { name: "Recortar" }).click();
    drag([300, 300], [300, 450]);
    await expect.element(page.getByText("Se quita esta parte")).toBeVisible();
    workspace.setCuts([{ y: 10, h: 10 }]);
    editor.confirmTrim();
    expect(editor.cuts()).toEqual([{ y: 10, h: 10 }]);
    workspace.setCuts([]);
    editor.placeLogo({ x: 100, y: 600, w: 80, h: 40, bg: "rgb(255,255,255)" }, "", "", null);
    workspace.setCuts([{ y: 10, h: 10 }]);
    await trim(300, 450);
    expect(editor.cuts()).toHaveLength(2);
    expect(editor.getState().list).toHaveLength(1);
  });
});
