import { describe, expect, it, vi } from "vitest";
import { boxOf, type PlacedChange } from "./change.ts";
import { builtStrip } from "./strip-build.ts";
import { detectStrip } from "./strip-detect.ts";
import { stripDays } from "./strip-days.ts";
import { type StripPlace } from "./strip-layout.ts";
import { attachStripPreview } from "./strip-preview.ts";
import { attachRowDrag } from "./strip-row-drag.ts";
import { attachStripKeyboard } from "./strip-keyboard.ts";
import { createStripSession, type StripSession } from "./strip-session.ts";
import type { StripInfo, StripPick, StripRect } from "./strip-types.ts";

type Block = readonly [number, number, number, number];

function art(width: number, height: number, blocks: readonly Block[]) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No canvas here");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#123456";
  for (const [x, y, w, h] of blocks) context.fillRect(x, y, w, h);
  return canvas;
}

const INFO: StripInfo = {
  bg: "rgb(255,255,255)",
  n: 4,
  filas: [
    { cy: 100, h: 60, n: 2 },
    { cy: 200, h: 60, n: 2 },
  ],
  porFila: 2,
  medH: 60,
  conTexto: false,
  txtH: 0,
  maxH: 60,
  cajas: [],
};
const RECT: StripRect = { x: 50, y: 50, w: 600, h: 200, bg: "rgb(255,255,255)" };
const PLACES: StripPlace[] = [
  { cx: 200, cy: 100, w: 200, h: 60 },
  { cx: 500, cy: 100, w: 200, h: 60 },
];
const PICKS: StripPick[] = [
  { img: "coto", t: "Coto" },
  { img: "nike", t: "Nike" },
];

function canvasArt() {
  return art(1240, 400, []);
}

describe("reading the logos of a strip", () => {
  it("finds them, row by row, and leaves specks out", () => {
    const found = detectStrip(
      art(800, 300, [
        [50, 20, 60, 40],
        [200, 25, 60, 40],
        [350, 20, 60, 50],
        [100, 120, 60, 40],
        [300, 120, 60, 40],
        [700, 250, 4, 4],
      ]),
      0,
      0,
      800,
      300,
    );
    expect(found).toMatchObject({ n: 5, porFila: 3, conTexto: false, txtH: 0, maxH: 54 });
    expect(found.filas.map(({ n }) => n)).toEqual([3, 2]);
    expect(found.bg).toBe("rgb(255,255,255)");
    expect(found.cajas).toHaveLength(5);
  });

  it("a low row right under another is its text, and neither a row nor a place", () => {
    const found = detectStrip(
      art(800, 300, [
        [50, 20, 90, 60],
        [300, 20, 90, 60],
        [60, 100, 70, 15],
        [310, 100, 70, 15],
      ]),
      0,
      0,
      800,
      300,
    );
    expect(found).toMatchObject({ n: 2, conTexto: true, porFila: 2 });
    expect(found.filas).toHaveLength(1);
    expect(found.txtH).toBeGreaterThan(0);
  });

  it("a box with nothing printed reads nothing", () => {
    const found = detectStrip(art(300, 100, []), 0, 0, 300, 100);
    expect(found).toMatchObject({ n: 0, filas: [], porFila: 0, medH: 0, maxH: 0 });
  });
});

function daysOf(logo: string): string {
  return logo === "coto" ? "Martes" : "";
}

describe("the days under the logos of a strip", () => {
  it("without the tick there are none", () => {
    const days = stripDays({
      art: canvasArt(),
      info: INFO,
      selection: PICKS,
      places: PLACES,
      withDays: false,
      daysOf,
    });
    expect(days.byIndex).toEqual([]);
  });

  it("with no supermarket with days, there are none", () => {
    const days = stripDays({
      art: canvasArt(),
      info: INFO,
      selection: PICKS,
      places: PLACES,
      withDays: true,
      daysOf: () => "",
    });
    expect(days.byIndex).toEqual([null, null]);
  });

  it("the place is shared: the logo above, the days below", () => {
    const days = stripDays({
      art: canvasArt(),
      info: INFO,
      selection: PICKS,
      places: PLACES,
      withDays: true,
      daysOf,
    });
    const [day, other] = days.byIndex;
    expect(other).toBeNull();
    expect(day?.text).toBe("Martes");
    expect(day?.logo.cy).toBeLessThan(100);
    expect(day?.logo.h).toBeLessThan(60);
    expect(day?.y).toBeGreaterThan(100);
    expect(days.fontSize).toBeGreaterThanOrEqual(12);
  });

  it("a grid that had days keeps the logo on its place, and the letter of the original", () => {
    const days = stripDays({
      art: canvasArt(),
      info: { ...INFO, conTexto: true, txtH: 15 },
      selection: PICKS,
      places: PLACES,
      withDays: true,
      daysOf,
    });
    const [day] = days.byIndex;
    expect(day?.logo).toEqual(PLACES[0]);
    expect(days.fontSize).toBe(20);
    expect(day?.y).toBeGreaterThan(130);
  });

  it("what does not fit goes in two lines, and smaller for all if it still does not", () => {
    const narrow = [{ cx: 200, cy: 100, w: 60, h: 60 }];
    const days = stripDays({
      art: canvasArt(),
      info: INFO,
      selection: PICKS.slice(0, 1),
      places: narrow,
      withDays: true,
      daysOf: () => "Lunes, martes, jueves y viernes",
    });
    const [day] = days.byIndex;
    expect(day?.text).toBe("Lunes, martes, jueves y\nviernes");
    expect(days.fontSize).toBeGreaterThanOrEqual(10);
    expect(days.fontSize).toBeLessThan(12);
    const unbroken = stripDays({
      art: canvasArt(),
      info: INFO,
      selection: PICKS.slice(0, 1),
      places: narrow,
      withDays: true,
      daysOf: () => "Todoslosdíasdelasemana",
    });
    expect(unbroken.byIndex[0]?.text).toBe("Todoslosdíasdelasemana");
  });
});

function loose(fields: Partial<PlacedChange> = {}): PlacedChange {
  return {
    x: 0,
    y: 0,
    w: 10,
    h: 10,
    bg: "",
    img: "x",
    t: "X",
    ox: 800,
    oy: 800,
    ow: 10,
    oh: 10,
    ...fields,
  };
}

function build(list: readonly PlacedChange[], withDays = false, id = "fr1") {
  return builtStrip(list, {
    id,
    rect: RECT,
    info: INFO,
    selection: PICKS,
    perRow: 0,
    sizeOfAll: 1,
    aspects: [2, 2],
    days: (places) =>
      stripDays({
        art: canvasArt(),
        info: INFO,
        selection: PICKS,
        places,
        withDays,
        daysOf: (logo) => (logo === "coto" ? "Martes" : ""),
      }),
  });
}

describe("what a strip leaves on the flyer", () => {
  it("covers the strip, and the logos do not cover anything else", () => {
    const [cover, first] = build([]);
    expect(cover).toMatchObject({
      x: 48,
      y: 48,
      w: 604,
      h: 204,
      franja: "fr1",
      franjaBase: true,
      franjaCols: 0,
      franjaKt: 1,
      franjaInfo: INFO,
      franjaSel: PICKS,
    });
    expect(first).toMatchObject({ w: 0, h: 0, img: "coto", t: "Coto", franja: "fr1" });
  });

  it("what was in the zone goes, by its place or by where it was moved to", () => {
    const list = build([
      loose({ ox: 100, oy: 100, t: "in its place" }),
      loose({ t: "moved in", tx: 100, ty: 100, tw: 10, th: 10 }),
      loose({ t: "far" }),
      loose({ t: "no number", tx: Number.NaN, ty: 100, tw: 10, th: 10 }),
    ]);
    const titles = list.map(({ t }) => t);
    expect(titles).not.toContain("in its place");
    expect(titles).not.toContain("moved in");
    expect(titles).toContain("far");
    expect(titles).toContain("no number");
  });

  it("a logo of ANOTHER strip is not touched, and those of this one are replaced", () => {
    const other = loose({ ox: 100, oy: 100, franja: "other", t: "other" });
    const own = loose({ ox: 100, oy: 100, franja: "fr1", t: "own" });
    const titles = build([other, own]).map(({ t }) => t);
    expect(titles).toContain("other");
    expect(titles).not.toContain("own");
  });

  it("the days go centered under their logo, and they belong to the strip", () => {
    const list = build([], true);
    const text = list.find(({ tipo }) => tipo === "txt");
    const logo = list.find(({ img }) => img === "coto");
    if (!text || !logo) throw new Error("They were not placed");
    const [days, its] = [boxOf(text), boxOf(logo)];
    expect(text).toMatchObject({ texto: "Martes", t: "Martes", peso: 500, franja: "fr1" });
    expect(days.tx + days.tw / 2).toBeCloseTo(its.tx + its.tw / 2);
    expect(days.ty).toBeGreaterThan(its.ty + its.th - 1);
    expect(text.ox).toBe(days.tx);
  });

  it("with no place for a brand it just goes on", () => {
    const list = builtStrip([], {
      id: "fr1",
      rect: RECT,
      info: INFO,
      selection: [],
      perRow: 0,
      sizeOfAll: 1,
      aspects: [],
      days: () => ({ byIndex: [], fontSize: 0, color: "", weight: 500 }),
    });
    expect(list).toHaveLength(1);
  });
});

function session(selection: readonly StripPick[] = PICKS): StripSession {
  return createStripSession({
    id: "fr1",
    rect: RECT,
    info: INFO,
    base: null,
    art: "flyer.png",
    selection,
    perRow: 0,
    sizeOfAll: 1,
    filters: null,
  });
}

function logoImage(): HTMLCanvasElement {
  return art(100, 50, [[5, 5, 90, 40]]);
}

function stage(strip: StripSession, { missing = false, days = "" } = {}) {
  const box = document.createElement("div");
  box.style.width = "700px";
  const canvas = document.createElement("canvas");
  box.append(canvas);
  document.body.append(box);
  const onMeasured = vi.fn<(canGrow: boolean) => void>();
  const preview = attachStripPreview(canvas, strip, {
    picture: () => art(800, 400, []),
    logoImage: () => (missing ? null : logoImage()),
    withDays: () => Boolean(days),
    daysOf: () => days,
    onMeasured,
  });
  return { canvas, preview, onMeasured, box };
}

function press(canvas: HTMLCanvasElement, type: string, x: number, y: number, shiftKey = false) {
  const box = canvas.getBoundingClientRect();
  canvas.dispatchEvent(
    new PointerEvent(type, {
      clientX: box.left + x,
      clientY: box.top + y,
      shiftKey,
      pointerId: 1,
      bubbles: true,
    }),
  );
}

/** Where a logo is, in pixels of the canvas on screen. */
function logoAt(strip: StripSession, canvas: HTMLCanvasElement, index: number) {
  const { x0, y0, width, boxes } = strip.drawing();
  const box = boxes[index];
  if (!box) throw new Error("That logo is not drawn");
  const scale = canvas.getBoundingClientRect().width / width;
  return {
    x: (box.tx + box.tw / 2 - x0) * scale,
    y: (box.ty + box.th / 2 - y0) * scale,
    scale,
  };
}

describe("the preview of the window", () => {
  it("draws what is chosen, and measures itself only once", () => {
    const strip = session();
    const { canvas, preview, onMeasured, box } = stage(strip);
    expect(strip.drawing().boxes.filter(Boolean)).toHaveLength(2);
    const width = canvas.style.width;
    expect(onMeasured).toHaveBeenCalledOnce();
    strip.change((now) => ({ ...now, marked: 0 }));
    expect(canvas.style.width).toBe(width);
    expect(onMeasured).toHaveBeenCalledOnce();
    preview.remeasure();
    expect(onMeasured).toHaveBeenCalledTimes(2);
    preview.detach();
    box.remove();
  });

  it("a logo on its way is a gray box with its number, and the days go under it", () => {
    const strip = session();
    const waiting = stage(strip, { missing: true });
    expect(strip.drawing().boxes).toEqual([null, null]);
    waiting.preview.detach();
    waiting.box.remove();
    const withDays = stage(strip, { days: "Martes\ny viernes" });
    expect(strip.drawing().boxes.filter(Boolean)).toHaveLength(2);
    withDays.preview.detach();
    withDays.box.remove();
  });

  it("with no picture or canvas it does not draw", () => {
    const strip = session();
    const canvas = document.createElement("canvas");
    const preview = attachStripPreview(canvas, strip, {
      picture: () => null,
      logoImage: () => null,
      withDays: () => false,
      daysOf: () => "",
      onMeasured: () => undefined,
    });
    expect(strip.drawing().width).toBe(0);
    preview.detach();
  });

  it("the size of the window measures it again, a moment later", () => {
    vi.useFakeTimers();
    const strip = session();
    const { preview, onMeasured, box } = stage(strip);
    window.dispatchEvent(new Event("resize"));
    window.dispatchEvent(new Event("resize"));
    vi.advanceTimersByTime(150);
    expect(onMeasured).toHaveBeenCalledTimes(2);
    preview.detach();
    box.remove();
    vi.useRealTimers();
  });

  it("touching a logo marks it, dragging moves it, and touching off lets it go", () => {
    const strip = session();
    const { canvas, preview, box } = stage(strip);
    const { x, y, scale } = logoAt(strip, canvas, 1);
    press(canvas, "pointerdown", x, y);
    expect(strip.getState().marked).toBe(1);
    press(canvas, "pointermove", x + 30, y + 15);
    expect(strip.getState().selection[1]?.dx).toBe(Math.round(30 / scale));
    press(canvas, "pointerup", x + 30, y + 15);
    press(canvas, "pointermove", x + 90, y);
    expect(strip.getState().selection[1]?.dx).toBe(Math.round(30 / scale));
    press(canvas, "pointerdown", 1, 1);
    expect(strip.getState().marked).toBe(-1);
    preview.detach();
    box.remove();
  });

  it("with Shift it adds and takes out, and a touch off with Shift keeps them", () => {
    const strip = session();
    const { canvas, preview, box } = stage(strip);
    const first = logoAt(strip, canvas, 0);
    const second = logoAt(strip, canvas, 1);
    press(canvas, "pointerdown", first.x, first.y);
    press(canvas, "pointerup", first.x, first.y);
    press(canvas, "pointerdown", second.x, second.y, true);
    press(canvas, "pointermove", second.x + 20, second.y);
    expect(strip.getState().selection[0]?.dx).toBe(strip.getState().selection[1]?.dx);
    press(canvas, "pointerup", second.x + 20, second.y);
    press(canvas, "pointerdown", 1, 1, true);
    expect(strip.getState().group).toEqual([0, 1]);
    const moved = logoAt(strip, canvas, 1);
    press(canvas, "pointerdown", moved.x, moved.y, true);
    expect(strip.getState().group).toEqual([0]);
    preview.detach();
    box.remove();
  });
});

function rowsStage(strip: StripSession) {
  const list = document.createElement("div");
  list.style.position = "relative";
  for (const [index, { img }] of strip.getState().selection.entries()) {
    const row = document.createElement("div");
    row.dataset["stripRow"] = "";
    row.dataset["index"] = String(index);
    row.style.height = "40px";
    row.innerHTML = `<span data-strip-handle="">⠿</span><span>${img}</span><button>x</button>`;
    list.append(row);
  }
  document.body.append(list);
  const dragging = attachRowDrag(list, strip, { line: "line", lifted: "lifted", ordering: "busy" });
  return { list, ...dragging };
}

function pointer(type: string, clientY: number, fields: PointerEventInit = {}) {
  return new PointerEvent(type, {
    clientY,
    pointerId: 1,
    pointerType: "mouse",
    bubbles: true,
    ...fields,
  });
}

function rowOf(list: HTMLElement, index: number): HTMLElement {
  const row = list.querySelector<HTMLElement>(`[data-index="${String(index)}"]`);
  if (!row) throw new Error("No such row");
  return row;
}

describe("ordering the rows by dragging", () => {
  const THREE: StripPick[] = [...PICKS, { img: "vea", t: "Vea" }];

  it("with the mouse, once it moved a bit, and the row falls where the line says", () => {
    const strip = session(THREE);
    const { list, detach, justDropped } = rowsStage(strip);
    const first = rowOf(list, 0);
    const y = first.getBoundingClientRect().top + 5;
    first.dispatchEvent(pointer("pointerdown", y));
    list.dispatchEvent(pointer("pointermove", y + 1));
    expect(first.classList.contains("lifted")).toBe(false);
    const end = rowOf(list, 2).getBoundingClientRect().bottom + 5;
    list.dispatchEvent(pointer("pointermove", end));
    expect(first.classList.contains("lifted")).toBe(true);
    expect(list.querySelector(".line")).not.toBeNull();
    list.dispatchEvent(pointer("pointerup", end));
    expect(strip.getState().selection.map(({ img }) => img)).toEqual(["nike", "vea", "coto"]);
    expect(strip.getState().marked).toBe(2);
    expect(list.querySelector(".line")).toBeNull();
    expect(justDropped()).toBe(true);
    detach();
    list.remove();
  });

  it("a click stays a click, and on a button nothing starts", () => {
    const strip = session(THREE);
    const { list, detach, justDropped } = rowsStage(strip);
    const first = rowOf(list, 0);
    first.querySelector("button")?.dispatchEvent(pointer("pointerdown", 1));
    list.dispatchEvent(pointer("pointermove", 200));
    expect(first.classList.contains("lifted")).toBe(false);
    first.dispatchEvent(pointer("pointerdown", 1));
    list.dispatchEvent(pointer("pointerup", 1));
    expect(justDropped()).toBe(false);
    expect(strip.getState().selection).toEqual(THREE);
    detach();
    list.remove();
  });

  it("with a finger only from the handle, and it starts at once", () => {
    const strip = session(THREE);
    const { list, detach } = rowsStage(strip);
    const first = rowOf(list, 0);
    const touch = { pointerType: "touch" };
    first.lastElementChild?.previousElementSibling?.dispatchEvent(pointer("pointerdown", 1, touch));
    expect(first.classList.contains("lifted")).toBe(false);
    first.querySelector("[data-strip-handle]")?.dispatchEvent(pointer("pointerdown", 1, touch));
    expect(first.classList.contains("lifted")).toBe(true);
    list.dispatchEvent(pointer("pointercancel", 1, touch));
    expect(first.classList.contains("lifted")).toBe(false);
    expect(strip.getState().selection).toEqual(THREE);
    detach();
    list.remove();
  });

  it("another mouse button or pointer does not count, and losing it lets it go", () => {
    const strip = session(THREE);
    const { list, detach } = rowsStage(strip);
    const first = rowOf(list, 0);
    first.dispatchEvent(pointer("pointerdown", 1, { button: 2 }));
    list.dispatchEvent(pointer("pointermove", 100));
    expect(first.classList.contains("lifted")).toBe(false);
    first.dispatchEvent(pointer("pointerdown", 1));
    list.dispatchEvent(pointer("pointermove", 100, { pointerId: 2 }));
    expect(first.classList.contains("lifted")).toBe(false);
    list.dispatchEvent(pointer("pointermove", 100));
    expect(first.classList.contains("lifted")).toBe(true);
    list.dispatchEvent(pointer("lostpointercapture", 100));
    expect(first.classList.contains("lifted")).toBe(false);
    detach();
    list.remove();
  });
});

function key(name: string, fields: KeyboardEventInit = {}, target: EventTarget = document) {
  const event = new KeyboardEvent("keydown", {
    key: name,
    bubbles: true,
    cancelable: true,
    ...fields,
  });
  target.dispatchEvent(event);
  return event;
}

describe("the keys of the window", () => {
  it("Ctrl+Z and Ctrl+Y go through the steps, except in a field", () => {
    vi.useFakeTimers();
    const strip = session();
    const detach = attachStripKeyboard(strip);
    strip.change((now) => ({ ...now, selection: [] }));
    expect(key("z", { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(strip.getState().selection).toEqual(PICKS);
    key("y", { metaKey: true });
    expect(strip.getState().selection).toEqual([]);
    key("z", { ctrlKey: true });
    key("z", { ctrlKey: true, shiftKey: true });
    expect(strip.getState().selection).toEqual([]);
    expect(key("x", { ctrlKey: true }).defaultPrevented).toBe(false);
    const field = document.createElement("input");
    document.body.append(field);
    expect(key("z", { ctrlKey: true }, field).defaultPrevented).toBe(false);
    expect(key("z", { altKey: true, ctrlKey: true }).defaultPrevented).toBe(false);
    field.remove();
    detach();
    vi.useRealTimers();
  });

  it("+ and − change the size, and writing does not; on a slider it does", () => {
    const strip = session();
    const detach = attachStripKeyboard(strip);
    strip.change((now) => ({ ...now, marked: 0 }));
    key("+");
    expect(strip.getState().selection[0]?.k).toBe(1.1);
    key("_", { shiftKey: true });
    expect(strip.getState().selection[0]?.k).toBe(0.85);
    key("=");
    key("-");
    expect(strip.getState().selection[0]?.k).toBe(0.85);
    expect(key("a").defaultPrevented).toBe(false);
    const field = document.createElement("input");
    document.body.append(field);
    key("+", {}, field);
    expect(strip.getState().selection[0]?.k).toBe(0.85);
    field.type = "range";
    key("+", {}, field);
    expect(strip.getState().selection[0]?.k).toBe(0.95);
    const area = document.createElement("div");
    area.contentEditable = "true";
    document.body.append(area);
    key("+", {}, area);
    expect(strip.getState().selection[0]?.k).toBe(0.95);
    area.remove();
    field.remove();
    detach();
    key("+");
    expect(strip.getState().selection[0]?.k).toBe(0.95);
    strip.close();
  });
});
