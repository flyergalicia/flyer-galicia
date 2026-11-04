// The preview of the window: the piece of the flyer with the strip already built. It is drawn directly
// on its canvas (plan, rule 7). Its size is measured only on opening, on a change of the size of the
// window or with "Ampliar": ticking brands never changes it.
import type { FlyerArt } from "@/shared/flyer-engine/index.ts";
import { type StripDays, stripDays } from "./strip-days.ts";
import {
  adjusted,
  fitLogo,
  type StripPlace,
  stripPlaces,
  STRIP_LINE_HEIGHT,
} from "./strip-layout.ts";
import { chosenOf, movedAll, toggledInGroup } from "./strip-selection.ts";
import type { StripSession } from "./strip-session.ts";
import { textFont } from "./text-measure.ts";

const MARGIN = 6;
const PHONE = 900;
const SMALLEST_WIDTH = 160;
const SMALLEST_HEIGHT = 110;
const FALLBACK_WIDTH = 600;
const HEIGHT_NORMAL = { computer: 0.29, phone: 0.24 };
const HEIGHT_LARGE = { computer: 0.56, phone: 0.42 };
const WORTH_GROWING = 1.15;
const RESIZE_WAIT_MS = 150;
const TOUCH_MARGIN = 6;
const ORANGE = "#F26122";
const DARK_ORANGE = "#C2410C";
const WHITE = "#fff";
const WAITING_FILL = "rgba(128,128,128,.18)";
const WAITING_TEXT = "#777";

export interface StripPreviewSources {
  readonly picture: () => FlyerArt | null;
  readonly logoImage: (logo: string) => HTMLCanvasElement | null;
  /** The tick of the days and what goes for each logo, as the window has them now. */
  readonly withDays: () => boolean;
  readonly daysOf: (logo: string) => string;
  readonly onMeasured: (canGrow: boolean) => void;
}

interface Crop {
  readonly x0: number;
  readonly y0: number;
  readonly width: number;
  readonly height: number;
}

function cropOf(session: StripSession, art: FlyerArt): Crop {
  const { x, y, w, h } = session.rect;
  const x0 = Math.max(0, x - MARGIN);
  const y0 = Math.max(0, y - MARGIN);
  return {
    x0,
    y0,
    width: Math.min(art.width, x + w + MARGIN) - x0,
    height: Math.min(art.height, y + h + MARGIN) - y0,
  };
}

function heightShare(isLarge: boolean): number {
  const shares = isLarge ? HEIGHT_LARGE : HEIGHT_NORMAL;
  return window.innerWidth <= PHONE ? shares.phone : shares.computer;
}

/** The width it goes on screen, and if "Ampliar" would make it grow: a wide strip already fills it. */
function measure(canvas: HTMLCanvasElement, crop: Crop, isLarge: boolean) {
  const room = Math.max(SMALLEST_WIDTH, (canvas.parentElement?.clientWidth || FALLBACK_WIDTH) - 2);
  const aspect = crop.width / crop.height;
  const widthFor = (share: number) => Math.min(room, window.innerHeight * share * aspect);
  const usedHeight = Math.max(SMALLEST_HEIGHT, window.innerHeight * heightShare(isLarge));
  return {
    width: Math.round(Math.min(room, usedHeight * aspect)),
    canGrow: isLarge || widthFor(heightShare(true)) >= widthFor(heightShare(false)) * WORTH_GROWING,
  };
}

function sizeCanvas(canvas: HTMLCanvasElement, width: number, height: number, ratio: number): void {
  if (canvas.style.width !== `${String(width)}px`) {
    canvas.style.width = `${String(width)}px`;
    canvas.style.height = `${String(height)}px`;
  }
  const [wanted, wantedTall] = [Math.round(width * ratio), Math.round(height * ratio)];
  if (canvas.width !== wanted) canvas.width = wanted;
  if (canvas.height !== wantedTall) canvas.height = wantedTall;
}

function drawWaiting(ctx: CanvasRenderingContext2D, place: StripPlace, number: number): void {
  const { cx, cy, h } = place;
  ctx.fillStyle = WAITING_FILL;
  ctx.fillRect(cx - h * 0.6, cy - h * 0.4, h * 1.2, h * 0.8);
  ctx.fillStyle = WAITING_TEXT;
  ctx.font = `600 ${String(Math.round(h * 0.35))}px Figtree,Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(number), cx, cy);
}

function drawDays(
  ctx: CanvasRenderingContext2D,
  text: string,
  center: number,
  y: number,
  { fontSize, color, weight }: StripDays,
): void {
  ctx.save();
  ctx.font = textFont(weight, fontSize);
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lines = text.split("\n");
  for (const [index, line] of lines.entries()) {
    const shift = (index - (lines.length - 1) / 2) * fontSize * STRIP_LINE_HEIGHT;
    ctx.fillText(line, center, y + shift);
  }
  ctx.restore();
}

function drawMark(
  ctx: CanvasRenderingContext2D,
  { tx, ty, tw, th }: { tx: number; ty: number; tw: number; th: number },
  unit: number,
): void {
  ctx.save();
  ctx.setLineDash([6 * unit, 4 * unit]);
  ctx.lineWidth = 2 * unit;
  ctx.strokeStyle = ORANGE;
  ctx.strokeRect(tx - 3 * unit, ty - 3 * unit, tw + 6 * unit, th + 6 * unit);
  ctx.restore();
}

interface Number {
  readonly index: number;
  readonly x: number;
  readonly y: number;
}

/** A circle with the number of the order, at the top left of each logo: only on this preview. */
function drawNumbers(
  ctx: CanvasRenderingContext2D,
  numbers: readonly Number[],
  chosen: readonly number[],
  crop: Crop,
  unit: number,
): void {
  const radius = 8 * unit;
  ctx.font = `800 ${String(10 * unit)}px Figtree,Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const { index, x, y } of numbers) {
    const cx = Math.max(crop.x0 + radius + unit, x);
    const cy = Math.max(crop.y0 + radius + unit, y);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = chosen.includes(index) ? DARK_ORANGE : ORANGE;
    ctx.fill();
    ctx.lineWidth = 1.5 * unit;
    ctx.strokeStyle = WHITE;
    ctx.stroke();
    ctx.fillStyle = WHITE;
    ctx.fillText(String(index + 1), cx, cy + 0.5 * unit);
  }
}

function drawLogos(
  ctx: CanvasRenderingContext2D,
  session: StripSession,
  art: FlyerArt,
  sources: StripPreviewSources,
  crop: Crop,
  unit: number,
): void {
  const { selection, perRow, sizeOfAll } = session.getState();
  const places = stripPlaces(session.rect, session.info, perRow, selection.length);
  const days = stripDays({
    art,
    info: session.info,
    selection,
    places,
    withDays: sources.withDays(),
    daysOf: sources.daysOf,
  });
  const chosen = chosenOf(session.getState());
  const numbers: Number[] = [];
  const boxes = selection.map((pick, index) => {
    const place = places[index];
    if (!place) return null;
    const image = sources.logoImage(pick.img);
    if (!image) {
      drawWaiting(ctx, place, index + 1);
      return null;
    }
    const day = days.byIndex[index];
    const box = adjusted(pick, sizeOfAll, fitLogo(day?.logo ?? place, image.width / image.height));
    ctx.drawImage(image, box.tx, box.ty, box.tw, box.th);
    numbers.push({ index, x: box.tx, y: box.ty });
    if (day) drawDays(ctx, day.text, box.tx + box.tw / 2, day.y, days);
    if (chosen.includes(index)) drawMark(ctx, box, unit);
    return box;
  });
  drawNumbers(ctx, numbers, chosen, crop, unit);
  session.noteDrawing({ x0: crop.x0, y0: crop.y0, width: crop.width, boxes });
}

interface Grab {
  readonly x: number;
  readonly y: number;
  readonly factor: number;
  readonly pointer: number;
  readonly from: readonly { readonly index: number; readonly dx: number; readonly dy: number }[];
}

function hitAt(session: StripSession, x: number, y: number): number {
  const { boxes } = session.drawing();
  for (let index = boxes.length - 1; index >= 0; index -= 1) {
    const box = boxes[index];
    if (
      box &&
      x >= box.tx - TOUCH_MARGIN &&
      x <= box.tx + box.tw + TOUCH_MARGIN &&
      y >= box.ty - TOUCH_MARGIN &&
      y <= box.ty + box.th + TOUCH_MARGIN
    ) {
      return index;
    }
  }
  return -1;
}

/** Touching a logo marks it, and dragging it moves it. The sizes are below the preview. */
function attachPointer(canvas: HTMLCanvasElement, session: StripSession): () => void {
  let grab: Grab | null = null;

  const onDown = (event: PointerEvent) => {
    const { x0, y0, width } = session.drawing();
    const box = canvas.getBoundingClientRect();
    if (!width || !box.width) return;
    const factor = width / box.width;
    const x = x0 + (event.clientX - box.left) * factor;
    const y = y0 + (event.clientY - box.top) * factor;
    const hit = hitAt(session, x, y);
    if (hit < 0) {
      if (!event.shiftKey) session.change((choice) => ({ ...choice, marked: -1, group: [] }));
      return;
    }
    event.preventDefault();
    if (event.shiftKey) {
      // Shift adds it or takes it out; taken out, there is nothing to drag.
      session.change((choice) => toggledInGroup(choice, hit));
      if (!chosenOf(session.getState()).includes(hit)) return;
    } else if (!chosenOf(session.getState()).includes(hit)) {
      session.change((choice) => ({ ...choice, group: [] }));
    }
    session.change((choice) => ({ ...choice, marked: hit }));
    const state = session.getState();
    const chosen = chosenOf(state);
    const dragged = chosen.includes(hit) ? chosen : [hit];
    grab = {
      x: event.clientX,
      y: event.clientY,
      factor,
      pointer: event.pointerId,
      from: dragged.map((index) => {
        const { dx = 0, dy = 0 } = state.selection[index] ?? {};
        return { index, dx, dy };
      }),
    };
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // A pointer that is already gone: the drag ends by itself.
    }
  };

  const onMove = (event: PointerEvent) => {
    if (!grab || event.pointerId !== grab.pointer) return;
    const { x, y, factor, from } = grab;
    const [byX, byY] = [(event.clientX - x) * factor, (event.clientY - y) * factor];
    session.change((choice) => movedAll(choice, from, byX, byY));
  };

  const onUp = () => {
    grab = null;
  };

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  return () => {
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointercancel", onUp);
  };
}

export interface StripPreview {
  readonly draw: () => void;
  /** Its size is measured again: the window changed, or it came into sight. */
  readonly remeasure: () => void;
  readonly detach: () => void;
}

export function attachStripPreview(
  canvas: HTMLCanvasElement,
  session: StripSession,
  sources: StripPreviewSources,
): StripPreview {
  let width = 0;
  let wasLarge = session.getState().isLarge;
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;

  const draw = () => {
    const art = sources.picture();
    const ctx = canvas.getContext("2d");
    if (!art || !ctx) return;
    const crop = cropOf(session, art);
    const { isLarge } = session.getState();
    if (!width || isLarge !== wasLarge) {
      wasLarge = isLarge;
      const measured = measure(canvas, crop, isLarge);
      width = measured.width;
      sources.onMeasured(measured.canGrow);
    }
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const height = Math.round((width * crop.height) / crop.width);
    sizeCanvas(canvas, width, height, ratio);
    const scale = (width * ratio) / crop.width;
    const unit = ratio / scale;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.translate(-crop.x0, -crop.y0);
    ctx.drawImage(art, 0, 0);
    ctx.fillStyle = session.info.bg;
    ctx.fillRect(session.rect.x, session.rect.y, session.rect.w, session.rect.h);
    drawLogos(ctx, session, art, sources, crop, unit);
  };

  const remeasure = () => {
    width = 0;
    draw();
  };
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(remeasure, RESIZE_WAIT_MS);
  };
  const stopListening = session.subscribe(draw);
  const stopPointer = attachPointer(canvas, session);
  window.addEventListener("resize", onResize);
  draw();
  return {
    draw,
    remeasure,
    detach: () => {
      stopListening();
      stopPointer();
      clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
    },
  };
}
