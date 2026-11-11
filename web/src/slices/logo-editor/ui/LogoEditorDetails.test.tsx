import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { type FlyerScene, resolveCalibration } from "@/shared/flyer-engine/index.ts";
import { workspaceOnScreen } from "@/shared/lib/flyer-workspace/testing/painted-flyer.ts";
import { PROMOTION_CATALOG_QUERY_KEY } from "@/shared/lib/promotions/catalog-query.ts";
import { NO_PROMOTION_FILTERS } from "@/shared/lib/promotions/promotion-filters.ts";
import { jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import { useLogoEditorActions } from "../model/editor-context.ts";
import type { LogoEditorProbe } from "../model/editor-probe.ts";
import { forgetPickerFilters } from "../model/brand-picker.ts";
import { flyerCoordinates } from "../model/coordinates.ts";
import { paintThumbnail } from "../model/thumbnail.ts";
import {
  brand,
  CATALOG,
  client,
  drag,
  handles,
  key,
  LOGO_A,
  LOGO_B,
  LOGO_C,
  openEditor,
  paintedFlyer,
  paintedLogo,
  theEditor,
  touch,
  waitForFlyer,
} from "../testing/editor-cloud.ts";

const MIDDLE_A = [LOGO_A.x + 40, LOGO_A.y + 30] as const;
const MIDDLE_B = [LOGO_B.x + 40, LOGO_B.y + 20] as const;
const MIDDLE_C = [LOGO_C.x + 40, LOGO_C.y + 20] as const;
const NOOP = (): void => undefined;
const SECOND_OPTION = { "_active3.json": {}, "_legal3.json": { text: "Otro" } };

function dialog() {
  return page.getByRole("dialog");
}

const theWorkspace = workspaceOnScreen;

function isReadable(value: unknown): value is {
  includeModo(): boolean;
  province(): string;
  localityAnswered(): boolean;
} {
  return typeof value === "object" && value !== null && "includeModo" in value;
}

function thePromotionsProbe() {
  const read: unknown = window["__flyerProbe"]?.["promotions"]?.();
  if (isReadable(read)) return read;
  throw new Error("The probe of Promociones is not there");
}

function isLogoEditorProbe(value: unknown): value is LogoEditorProbe {
  return typeof value === "object" && value !== null && "catalogSize" in value;
}

function theProbe(): LogoEditorProbe {
  const read: unknown = window["__flyerProbe"]?.["logoEditor"]?.();
  if (isLogoEditorProbe(read)) return read;
  throw new Error("The editor is not on screen");
}

async function enter() {
  await waitForFlyer();
  await page.getByRole("button", { name: "Cambiar logos" }).click();
  await expect.element(page.getByRole("button", { name: "Listo" })).toBeVisible();
}

async function put(at: readonly [number, number], title: string) {
  touch(at[0], at[1]);
  await expect.element(page.getByTestId("brand-card").first()).toBeVisible();
  await page.getByTestId("brand-card").filter({ hasText: title }).first().click();
  await expect.element(dialog()).not.toBeInTheDocument();
}

async function openBoth() {
  await openEditor({
    files: {
      ...SECOND_OPTION,
      "_active3.json": { imageUrl: paintedFlyer([LOGO_B]), cfg: {} },
    },
  });
  await enter();
}

function goTo(option: number) {
  return theWorkspace().selectOption(option, false);
}

function coordinatesOver(extra: number, hasScene = true) {
  const canvas = document.createElement("canvas");
  canvas.width = 500;
  canvas.height = 1000;
  document.body.append(canvas);
  const art = document.createElement("canvas");
  art.width = 1000;
  art.height = 2000;
  const calibration = { contacto: { ey: 100 }, imgW: 1000, imgH: 2000 };
  const scene: FlyerScene = {
    art,
    artKey: "a",
    calibration: resolveCalibration(calibration),
    singleCashback: false,
    whole: { art, artKey: "a", rawCalibration: calibration },
    cuts: [],
  };
  const state = { slot: { scene: hasScene ? scene : null }, scale: 0.5, extra };
  return { canvas, coordinates: flyerCoordinates(canvas, { getState: () => state }) };
}

function Reads() {
  useLogoEditorActions();
  return null;
}

beforeEach(async () => {
  handles.editor = null;
  localStorage.clear();
  forgetPickerFilters();
  await page.viewport(1366, 800);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("what a test reads of the editor", () => {
  it("says the same as what can be seen", async () => {
    await openEditor();
    await enter();
    await put(MIDDLE_A, "Adidas");
    const probe = theProbe();
    expect(probe.catalogSize()).toBe(CATALOG.length);
    expect(probe.placed()).toHaveLength(1);
    expect(probe.all()).toHaveLength(1);
    expect(probe.selection()).toEqual({ main: 0, chosen: [0], flyerLogos: 0 });
    expect(probe.isEditing()).toBe(true);
    expect(probe.isDragging()).toBe(false);
    expect(probe.mode()).toBe("none");
    expect(probe.clean()).toBe(false);
    expect(probe.openDesign()).toBeNull();
    expect(probe.undoSteps()[0]).toBe("");
    expect(probe.pickerTarget()).toBe(-1);
    expect(probe.pictureScale()).toBeGreaterThan(0);
    expect(probe.toClient(1, 1)).not.toBeNull();
    expect(probe.imageOf("Adidas.png")).not.toBeNull();
    expect(probe.imageOf("Nunca.png")).toBeNull();
    expect(probe.detect(...MIDDLE_B)).not.toBeNull();
    expect(probe.detect(700, 700)).toBeNull();
    expect(probe.hasDaysBelow(...MIDDLE_B)).toBe(false);
    expect(probe.hasDaysBelow(700, 700)).toBe(false);
    touch(...MIDDLE_C);
    await expect.element(dialog()).toBeVisible();
    expect(probe.pickerTarget()).toBe(-1);
    await dialog().getByRole("button", { name: "Cerrar" }).click();
    expect(probe.isSettled()).toBeDefined();
    const promotions = thePromotionsProbe();
    expect(promotions.includeModo()).toBe(true);
    expect(promotions.province()).toBe("");
    expect(promotions.localityAnswered()).toBe(true);
  });

  it("with no flyer there is nothing to read", async () => {
    await openEditor({ droppedFiles: ["_active9.json"] });
    await vi.waitFor(() => {
      expect(window["__flyerProbe"]?.["logoEditor"]).toBeDefined();
    });
    const probe = theProbe();
    expect(probe.detect(1, 1)).toBeNull();
    expect(probe.hasDaysBelow(1, 1)).toBe(false);
    expect(probe.imageOf("a.png")).toBeNull();
    const editor = theEditor();
    editor.openPoint(1, 1);
    editor.openBox(1, 1, 50, 50);
    editor.togglePlaceAt(1, 1);
    editor.moveFromFlyer({ x: 1, y: 1, w: 1, h: 1, bg: "" });
    editor.changeChosen();
    expect(editor.getState().picker).toBeNull();
  });

  it("finds days below a logo, and says when the flyer cannot be read", async () => {
    await openEditor({ blocks: [LOGO_A, { x: 120, y: 175, w: 80, h: 12, color: "#222222" }] });
    await enter();
    expect(theProbe().hasDaysBelow(...MIDDLE_A)).toBe(true);
    vi.spyOn(CanvasRenderingContext2D.prototype, "drawImage").mockImplementationOnce(() => {
      throw new Error("Tainted");
    });
    expect(theProbe().detect(...MIDDLE_A)).toBeNull();
    vi.spyOn(CanvasRenderingContext2D.prototype, "drawImage").mockImplementationOnce(() => {
      throw new Error("Tainted");
    });
    touch(...MIDDLE_A);
    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("No se pudo leer el flyer para buscar el logo.");
  });
});

describe("the marks over the flyer", () => {
  it("say which brand expired, once, and in red", async () => {
    const { harness } = await openEditor();
    await enter();
    await put(MIDDLE_A, "Adidas");
    await put(MIDDLE_B, "Puppis");
    await expect.element(page.getByTestId("logo-marker").first()).not.toHaveAttribute("data-note");
    const before = theWorkspace().renderDownload()?.toDataURL();
    harness.queryClient.setQueryData(PROMOTION_CATALOG_QUERY_KEY, {
      galicia: [brand("Puppis")],
      modo: [],
      all: [brand("Puppis")],
      meta: { last_sync_at: null, total: 1 },
      locations: [],
      failure: null,
    });
    const marker = page.getByTestId("logo-marker").first();
    await expect.element(marker).toHaveAttribute("data-note", "expired");
    await expect
      .element(marker)
      .toHaveAttribute("data-note-text", "Vencida · doble clic para cambiar");
    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("Hay 1 marca vencida en este flyer: está marcada en rojo.");
    // It is for whoever edits: what is downloaded does not change.
    expect(theWorkspace().renderDownload()?.toDataURL()).toBe(before);
    harness.queryClient.setQueryData(PROMOTION_CATALOG_QUERY_KEY, {
      galicia: [brand("Otra")],
      modo: [],
      all: [brand("Otra")],
      meta: { last_sync_at: null, total: 1 },
      locations: [],
      failure: null,
    });
    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("Hay 2 marcas vencidas en este flyer: están marcadas en rojo.");
  });

  it("follow the mouse over the flyer: the one below it shows whole", async () => {
    await openEditor();
    await enter();
    await put(MIDDLE_A, "Adidas");
    key("Escape");
    const canvas = page.getByTestId("flyer-canvas").element();
    const at = client(MIDDLE_A[0], MIDDLE_A[1]);
    canvas.dispatchEvent(new PointerEvent("pointermove", { ...at, bubbles: true }));
    const marker = page.getByTestId("logo-marker").first();
    await expect.element(marker).toHaveAttribute("data-near");
    expect(page.getByTestId("flyer-canvas").element().getAttribute("style")).toMatch(/move/);
    const away = client(700, 700);
    canvas.dispatchEvent(new PointerEvent("pointermove", { ...away, bubbles: true }));
    await expect.element(marker).not.toHaveAttribute("data-near");
    canvas.dispatchEvent(
      new PointerEvent("pointermove", { ...at, pointerType: "touch", bubbles: true }),
    );
    await expect.element(marker).not.toHaveAttribute("data-near");
    canvas.dispatchEvent(new PointerEvent("pointermove", { ...at, bubbles: true }));
    document.body.dispatchEvent(new PointerEvent("pointermove", { ...at, bubbles: true }));
    await expect.element(marker).not.toHaveAttribute("data-near");
  });

  it("a box being marked is seen while dragging, and goes away", async () => {
    await openEditor();
    await enter();
    const canvas = page.getByTestId("flyer-canvas").element();
    const from = client(600, 500);
    const to = client(700, 600);
    canvas.dispatchEvent(new PointerEvent("pointerdown", { ...from, button: 0, bubbles: true }));
    document.dispatchEvent(new PointerEvent("pointermove", { ...to, bubbles: true }));
    expect(theEditor().getState().box).not.toBeNull();
    document.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true }));
    expect(theEditor().getState().box).toBeNull();
  });
});

describe("on another flyer", () => {
  it("the changes of the first are not active, and come back with it", async () => {
    await openBoth();
    await put(MIDDLE_A, "Adidas");
    const art = theEditor().currentArt();
    await goTo(3);
    await vi.waitFor(() => {
      expect(theEditor().currentArt()).not.toBe(art);
    });
    expect(theEditor().active()).toEqual([]);
    expect(theEditor().chosen()).toEqual([]);
    await goTo(9);
    await vi.waitFor(() => {
      expect(theEditor().active()).toHaveLength(1);
    });
  });

  it("what was copied does not go to another flyer, and Deshacer starts over", async () => {
    await openBoth();
    await put(MIDDLE_A, "Adidas");
    key("c", { ctrlKey: true });
    const art = theEditor().currentArt();
    await goTo(3);
    await vi.waitFor(() => {
      expect(theEditor().currentArt()).not.toBe(art);
    });
    expect(theEditor().canUndo()).toBe(false);
    key("v", { ctrlKey: true });
    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("Lo copiado era de otro flyer.");
    await put(MIDDLE_B, "Puppis");
    expect(theEditor().active()).toHaveLength(1);
    expect(theEditor().getState().art).toBe(theEditor().currentArt());
  });

  it("Shift on a logo of the flyer starts its list clean", async () => {
    await openBoth();
    await put(MIDDLE_A, "Adidas");
    const art = theEditor().currentArt();
    await goTo(3);
    await vi.waitFor(() => {
      expect(theEditor().currentArt()).not.toBe(art);
    });
    touch(...MIDDLE_B, { shiftKey: true });
    expect(theEditor().getState().list).toEqual([]);
    expect(theEditor().getState().places).toHaveLength(1);
  });

  it("a logo that arrives after the flyer changed does not fall on it", async () => {
    let arrive: (blob: Blob) => void = NOOP;
    await openEditor({
      files: { "_active3.json": { imageUrl: paintedFlyer([LOGO_B]), cfg: {} } },
      fetchLogo: () =>
        new Promise((resolve) => {
          arrive = resolve;
        }),
    });
    await enter();
    touch(...MIDDLE_B);
    await page.getByTestId("brand-card").filter({ hasText: "Adidas" }).first().click();
    const art = theEditor().currentArt();
    await goTo(3);
    await vi.waitFor(() => {
      expect(theEditor().currentArt()).not.toBe(art);
    });
    arrive(await paintedLogo(50, 50));
    await new Promise((resolve) => {
      setTimeout(resolve, 30);
    });
    expect(theEditor().active()).toEqual([]);
    await page.getByRole("button", { name: "Cancelar" }).click();
  });

  it("nothing happens with nothing chosen", async () => {
    await openBoth();
    const editor = theEditor();
    editor.nudge(1, 1);
    editor.resizeBy(10);
    editor.backToOriginal();
    editor.deleteChosen();
    editor.paste();
    editor.openSeveral([]);
    editor.changeChosen();
    expect(editor.copyChosen()).toBe(false);
    expect(editor.deleteChosen()).toBe(0);
    expect(editor.active()).toEqual([]);
    expect(editor.getState().picker).toBeNull();
  });
});

describe("on a touch screen", () => {
  it("the bar brings arrows, a step bigger than those of the keyboard", async () => {
    vi.spyOn(window, "matchMedia").mockReturnValue(window.matchMedia("(min-width: 1px)"));
    await openEditor();
    await enter();
    await put(MIDDLE_A, "Adidas");
    const { tx = 0, ty = 0 } = theEditor().active()[0] ?? {};
    const bar = page.getByRole("toolbar", { name: "Ajustar el elemento elegido" });
    await bar.getByRole("button", { name: "Mover a la derecha" }).click();
    await bar.getByRole("button", { name: "Mover abajo" }).click();
    await bar.getByRole("button", { name: "Mover a la izquierda" }).click();
    await bar.getByRole("button", { name: "Mover arriba" }).click();
    expect(theEditor().active()[0]).toMatchObject({ tx, ty });
  });
});

describe("the thumbnail", () => {
  const place = { x: 100, y: 100, w: 120, h: 60, bg: "rgb(255,255,255)" };
  const logo = document.createElement("canvas");
  logo.width = 200;
  logo.height = 100;

  function fakes(found: CanvasImageSource | null, arrives: () => Promise<HTMLCanvasElement>) {
    const art = document.createElement("canvas");
    art.width = 400;
    art.height = 400;
    return {
      canvas: document.createElement("canvas"),
      editor: { picture: () => art, currentArt: () => "art" },
      logos: { imageFor: () => found, fetch: arrives },
      place,
    };
  }

  it("shows the place when it was not touched", () => {
    const parts = fakes(null, () => Promise.resolve(logo));
    paintThumbnail({ ...parts, logoKey: "" })();
    expect(parts.canvas.hidden).toBe(false);
    expect(parts.canvas.width).toBe(96);
  });

  it("does nothing with no flyer", () => {
    const parts = fakes(null, () => Promise.resolve(logo));
    const editor = { picture: () => null, currentArt: () => "" };
    paintThumbnail({ ...parts, editor, logoKey: "" })();
    expect(parts.canvas.width).toBe(300);
  });

  it("shows the logo of now, in its proportion", () => {
    const parts = fakes(logo, () => Promise.resolve(logo));
    paintThumbnail({ ...parts, logoKey: "a.png" })();
    expect(parts.canvas.width).toBe(96);
    expect(parts.canvas.height).toBe(48);
  });

  it("a logo out of memory is not replaced by the one of the flyer: it is asked for", async () => {
    const parts = fakes(null, () => Promise.resolve(logo));
    paintThumbnail({ ...parts, logoKey: "a.png" });
    expect(parts.canvas.hidden).toBe(true);
    await vi.waitFor(() => {
      expect(parts.canvas.hidden).toBe(false);
    });
  });

  it("an upload out of memory stays hidden, and the window closing lets it go", async () => {
    const parts = fakes(null, () => Promise.resolve(logo));
    paintThumbnail({ ...parts, logoKey: "pc:1:a.png" })();
    expect(parts.canvas.hidden).toBe(true);
    const failing = fakes(null, () => Promise.reject(new Error("No")));
    paintThumbnail({ ...failing, logoKey: "a.png" })();
    const closing = fakes(null, () => Promise.resolve(logo));
    const stop = paintThumbnail({ ...closing, logoKey: "a.png" });
    stop();
    await Promise.resolve();
    expect(closing.canvas.hidden).toBe(true);
  });
});

describe("the coordinates", () => {
  it("go from the screen to the picture and back", () => {
    const { canvas, coordinates } = coordinatesOver(0);
    const { left, top } = canvas.getBoundingClientRect();
    expect(coordinates.screenScale()).toBeCloseTo(0.5, 5);
    expect(coordinates.toPicture(left + 50, top + 100)).toEqual({ x: 100, y: 200 });
    expect(coordinates.toClient(100, 200)).toEqual({ x: left + 50, y: top + 100 });
    expect(coordinates.toLayer(10, 20, 30, 40)).toEqual({
      left: 5,
      top: 10,
      width: 15,
      height: 20,
    });
    canvas.remove();
  });

  it("with no flyer there is no point, and with no canvas size there is no scale", () => {
    const { canvas, coordinates } = coordinatesOver(0, false);
    expect(coordinates.toPicture(1, 1)).toBeNull();
    canvas.width = 0;
    expect(coordinates.screenScale()).toBe(0);
    canvas.remove();
  });

  it("what is under the gap for more officers goes down, and the gap is nobody's", () => {
    const { canvas, coordinates } = coordinatesOver(100);
    const { left, top } = canvas.getBoundingClientRect();
    const read = Array.from({ length: 200 }, (_, step) =>
      coordinates.toPicture(left, top + step * 5),
    );
    const gap = read.findIndex((point) => point === null);
    expect(gap).toBeGreaterThan(0);
    const after = read.slice(gap).findIndex((point) => point !== null) + gap;
    const below = read[after];
    expect(below?.y).toBeLessThan(after * 5 * 2);
    expect(coordinates.toLayer(0, below?.y ?? 0, 0, 0).top).toBeCloseTo(after * 5, 0);
    canvas.remove();
  });
});

describe("the context of the editor", () => {
  it("needs its provider", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(render(<Reads />)).rejects.toThrow(/LogoEditorProvider/);
  });
});

describe("a supermarket on a place with days", () => {
  const WITH_DAYS = [LOGO_A, { x: 120, y: 175, w: 80, h: 12, color: "#222222" }];

  it("replaces them with its own, in their place", async () => {
    await openEditor({ blocks: WITH_DAYS });
    await enter();
    await put(MIDDLE_A, "Coto");
    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("Listo: Coto con sus días de descuento (Martes).");
    const [logo, days] = theEditor().active();
    expect(days).toMatchObject({ tipo: "txt", texto: "Martes", peso: 500 });
    expect(days?.ty).toBeGreaterThanOrEqual(170);
    expect((logo?.ty ?? 0) + (logo?.th ?? 0)).toBeLessThanOrEqual(175);
    expect(theEditor().getState().selected).toBe(0);
  });

  it("with no days of discount, it takes away those printed", async () => {
    await openEditor({ blocks: WITH_DAYS });
    await enter();
    await put(MIDDLE_A, "Disco");
    await expect.element(page.getByRole("status")).toMatchTextContent(/saqué los días que había/);
    expect(theEditor().active().at(-1)).toMatchObject({ img: "", t: "" });
  });
});

describe("several places", () => {
  it("a logo that does not arrive is said, and the button comes back", async () => {
    await openEditor({ fetchLogo: () => Promise.reject(new Error("No")) });
    await enter();
    touch(...MIDDLE_A, { shiftKey: true });
    await page.getByRole("button", { name: "Reemplazar" }).click();
    await page.getByTestId("brand-card").filter({ hasText: "Adidas" }).click();
    await page.getByRole("button", { name: "Poner 1 de 1" }).click();
    await expect
      .element(page.getByRole("status"))
      .toMatchTextContent(/No se pudo bajar algún logo/);
    await expect.element(page.getByRole("button", { name: "Poner 1 de 1" })).toBeEnabled();
    await dialog().getByRole("button", { name: "Cerrar" }).click();
  });

  it("closing while they arrive leaves everything as it was", async () => {
    let arrive: (blob: Blob) => void = NOOP;
    await openEditor({
      fetchLogo: () =>
        new Promise((resolve) => {
          arrive = resolve;
        }),
    });
    await enter();
    touch(...MIDDLE_A, { shiftKey: true });
    await page.getByRole("button", { name: "Reemplazar" }).click();
    await page.getByTestId("brand-card").filter({ hasText: "Adidas" }).click();
    await page.getByRole("button", { name: "Poner 1 de 1" }).click();
    await expect.element(page.getByRole("button", { name: "Poniendo…" })).toBeVisible();
    await dialog().getByRole("button", { name: "Cerrar" }).click();
    arrive(await paintedLogo(50, 50));
    await new Promise((resolve) => {
      setTimeout(resolve, 30);
    });
    expect(theEditor().active()).toEqual([]);
  });

  it("a copy goes where it fell, and one logo is one", async () => {
    await openEditor();
    await enter();
    await put(MIDDLE_A, "Adidas");
    await page.getByRole("button", { name: "Duplicar" }).click();
    touch(...MIDDLE_C, { shiftKey: true });
    const group = page.getByRole("toolbar", { name: "Varios elegidos" });
    await expect.element(group).toMatchTextContent(/2 elegidos/);
    await group.getByRole("button", { name: "Reemplazar" }).click();
    await expect.element(dialog()).toHaveAccessibleName("Reemplazar 2 lugares");
    await dialog().getByRole("button", { name: "Cerrar" }).click();
    key("Escape");
    expect(theEditor().getState().places).toEqual([]);
    touch(...MIDDLE_C, { shiftKey: true });
    await expect.element(group).toMatchTextContent(/1 elegido /);
  });
});

describe("choosing at full screen", () => {
  type Back = (chosen: (typeof CATALOG)[number] | null) => void;

  async function goAndCome() {
    const backs: Back[] = [];
    const answers = {
      picker: {
        pickOneBrand: ({ onBack }: { readonly onBack: Back }) => {
          backs.push(onBack);
        },
      },
      files: { "_active3.json": { imageUrl: paintedFlyer([LOGO_B]), cfg: {} } },
    };
    return { backs, answers };
  }

  it("if the flyer changed meanwhile it says so, and nothing falls on the new one", async () => {
    const { backs, answers } = await goAndCome();
    await openEditor(answers);
    await enter();
    touch(...MIDDLE_A);
    await page.getByRole("button", { name: "Elegir en pantalla completa" }).click();
    const art = theEditor().currentArt();
    await theWorkspace().selectOption(3, false);
    await vi.waitFor(() => {
      expect(theEditor().currentArt()).not.toBe(art);
    });
    backs[0]?.(CATALOG[0] ?? null);
    await expect
      .element(page.getByRole("status"))
      .toMatchTextContent(/Cambió el flyer mientras elegías/);
    expect(theEditor().active()).toEqual([]);
  });

  it("a logo that does not arrive is said", async () => {
    const { backs, answers } = await goAndCome();
    await openEditor({ ...answers, fetchLogo: () => Promise.reject(new Error("No")) });
    await enter();
    touch(...MIDDLE_A);
    await page.getByRole("button", { name: "Elegir en pantalla completa" }).click();
    backs[0]?.(CATALOG[0] ?? null);
    await expect.element(page.getByRole("status")).toMatchTextContent(/No se pudo bajar el logo/);
  });

  it("the days of a supermarket look at the locality left in Activas", async () => {
    const { backs, answers } = await goAndCome();
    const asked: unknown[] = [];
    await openEditor({
      ...answers,
      edge: ({ body }) => {
        asked.push(body);
        return jsonResponse({ data: { ids: ["Coto-25% de ahorro."] } });
      },
    });
    await enter();
    touch(...MIDDLE_A);
    await page.getByRole("button", { name: "Elegir en pantalla completa" }).click();
    handles.filters?.publish({
      ...NO_PROMOTION_FILTERS,
      province: "MENDOZA",
      locality: "LUJAN",
    });
    backs[0]?.(CATALOG.find(({ titulo }) => titulo === "Coto") ?? null);
    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("Listo: Coto con sus días de descuento (Martes).");
    expect(asked).toEqual([{ action: "ubicacion", provincia: "MENDOZA", localidad: "LUJAN" }]);
    forgetPickerFilters();
  });

  it("a logo that arrives after the flyer changed is left out", async () => {
    let arrive: (blob: Blob) => void = NOOP;
    const { backs, answers } = await goAndCome();
    await openEditor({
      ...answers,
      fetchLogo: () =>
        new Promise((resolve) => {
          arrive = resolve;
        }),
    });
    await enter();
    touch(...MIDDLE_A);
    await page.getByRole("button", { name: "Elegir en pantalla completa" }).click();
    backs[0]?.(CATALOG[0] ?? null);
    const art = theEditor().currentArt();
    await theWorkspace().selectOption(3, false);
    await vi.waitFor(() => {
      expect(theEditor().currentArt()).not.toBe(art);
    });
    arrive(await paintedLogo(50, 50));
    await new Promise((resolve) => {
      setTimeout(resolve, 30);
    });
    expect(theEditor().active()).toEqual([]);
  });

  it("with nobody to choose there, it only closes", async () => {
    await openEditor();
    await enter();
    touch(...MIDDLE_A);
    await page.getByRole("button", { name: "Elegir en pantalla completa" }).click();
    await expect.element(dialog()).not.toBeInTheDocument();
    expect(theEditor().active()).toEqual([]);
  });

  it("with the tick of days off, a supermarket goes alone", async () => {
    const { backs, answers } = await goAndCome();
    await openEditor(answers);
    await enter();
    touch(...MIDDLE_A);
    await page.getByRole("checkbox", { name: /Si es un súper/ }).click();
    await page.getByRole("button", { name: "Elegir en pantalla completa" }).click();
    backs[0]?.(CATALOG.find(({ titulo }) => titulo === "Coto") ?? null);
    await expect.element(page.getByRole("status")).toHaveTextContent("Listo: Coto en este flyer.");
  });
});

describe("the window, with a file that goes wrong", () => {
  it("says a picture that does not read", async () => {
    await openEditor();
    await enter();
    touch(...MIDDLE_C);
    await expect.element(page.getByTestId("brand-card").first()).toBeVisible();
    await userEvent.upload(
      page.getByTestId("logo-file"),
      new File(["no"], "roto.png", { type: "image/png" }),
    );
    await expect.element(page.getByRole("status")).toMatchTextContent(/No se pudo leer esa imagen/);
    await page.getByRole("button", { name: "Subir logo de la PC" }).click();
    await page.getByRole("button", { name: "Cancelar" }).click();
  });

  it("drags on a place free of Shift and moves nothing with the right button", async () => {
    await openEditor();
    await enter();
    drag([600, 500], [604, 503], { shiftKey: true });
    expect(theEditor().getState().places).toEqual([]);
  });
});
