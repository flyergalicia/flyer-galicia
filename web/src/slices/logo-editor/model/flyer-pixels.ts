// Finds what is printed on the picture of the flyer: no calibration, only its pixels. It looks at
// the picture and not at the canvas, so what is already changed does not get in the way.
import type { FlyerArt } from "@/shared/flyer-engine/index.ts";
import type { DrawnBox, FlyerPlace, InkWindow } from "./change.ts";

/** Pixels of picture between the parts of one logo. Megatlon and farmacity are 18 apart. */
export const LOGO_GAP = 12;
/** How different from the background a color has to be to count as ink. */
export const INK_TOLERANCE = 40;
const REACH_X = 330;
const REACH_Y = 230;
/** Cells of 3 pixels: what is found is measured in them. */
export const CELL = 3;
const SEED_RADIUS_CELLS = 10;
const MAX_LOGO_WIDTH = 560;
const MAX_LOGO_HEIGHT = 380;
const SMALLEST_LOGO = 8;
const SMALLEST_BOX = 6;
const ROOM_MARGIN = 8;
const TEXT_INK_DIFFERENCE = 120;

export type Rgb = readonly [number, number, number];

export interface DetectionFailure {
  readonly error: "nada" | "grande";
}

export type Detection = FlyerPlace | DetectionFailure;

export function hasFailed(detection: Detection): detection is DetectionFailure {
  return "error" in detection;
}

/** The pixels of a box of the picture. */
export function pixelsOf(
  art: FlyerArt,
  x: number,
  y: number,
  w: number,
  h: number,
): Uint8ClampedArray {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("No canvas here");
  context.drawImage(art, x, y, w, h, 0, 0, w, h);
  return context.getImageData(0, 0, w, h).data;
}

function at(data: Uint8ClampedArray, offset: number): number {
  return data[offset] ?? 0;
}

export function differenceAt(data: Uint8ClampedArray, offset: number, color: Rgb): number {
  return Math.max(
    Math.abs(at(data, offset) - color[0]),
    Math.abs(at(data, offset + 1) - color[1]),
    Math.abs(at(data, offset + 2) - color[2]),
  );
}

function groupKey(data: Uint8ClampedArray, offset: number): string {
  return `${at(data, offset) >> 4}|${at(data, offset + 1) >> 4}|${at(data, offset + 2) >> 4}`;
}

function mostRepeatedGroup(data: Uint8ClampedArray): string | null {
  const counts = new Map<string, number>();
  let best: string | null = null;
  let bestCount = 0;
  for (let offset = 0; offset < data.length; offset += 8) {
    const key = groupKey(data, offset);
    const count = (counts.get(key) ?? 0) + 1;
    counts.set(key, count);
    if (count > bestCount) {
      bestCount = count;
      best = key;
    }
  }
  return best;
}

/** The color that repeats the most, grouped by 16 tones per channel, and its exact average. */
export function backgroundOf(data: Uint8ClampedArray): Rgb {
  const best = mostRepeatedGroup(data);
  let [red, green, blue, members] = [0, 0, 0, 0];
  for (let offset = 0; offset < data.length; offset += 8) {
    if (groupKey(data, offset) === best) {
      red += at(data, offset);
      green += at(data, offset + 1);
      blue += at(data, offset + 2);
      members += 1;
    }
  }
  if (!members) return [255, 255, 255];
  return [Math.round(red / members), Math.round(green / members), Math.round(blue / members)];
}

export function rgbText([red, green, blue]: Rgb): string {
  return `rgb(${red},${green},${blue})`;
}

export function rgbOf(text: string): Rgb {
  const [red = 0, green = 0, blue = 0] = (text.match(/\d+/g) ?? []).map(Number);
  return [red, green, blue];
}

export interface InkGrid {
  readonly on: Uint8Array;
  readonly cw: number;
  readonly ch: number;
}

/** Cells of 3 pixels: one has ink if any pixel of it strays from the background. */
export function inkGrid(data: Uint8ClampedArray, w: number, h: number, background: Rgb): InkGrid {
  const cw = Math.ceil(w / CELL);
  const ch = Math.ceil(h / CELL);
  const on = new Uint8Array(cw * ch);
  for (let y = 0; y < h; y += 1) {
    const row = Math.trunc(y / CELL) * cw;
    for (let x = 0; x < w; x += 1) {
      if (differenceAt(data, (y * w + x) * 4, background) > INK_TOLERANCE) {
        on[row + Math.trunc(x / CELL)] = 1;
      }
    }
  }
  return { on, cw, ch };
}

function isOnRing(dx: number, dy: number, radius: number): boolean {
  return Math.max(Math.abs(dx), Math.abs(dy)) === radius;
}

function inkOnRing({ on, cw, ch }: InkGrid, sx: number, sy: number, radius: number): number {
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const [qx, qy] = [sx + dx, sy + dy];
      const inside = qx >= 0 && qy >= 0 && qx < cw && qy < ch;
      if (isOnRing(dx, dy, radius) && inside && on[qy * cw + qx]) return qy * cw + qx;
    }
  }
  return -1;
}

/** The cell touched, or the nearest one with ink, up to some 30 pixels. */
function seedCell(grid: InkGrid, sx: number, sy: number): number {
  for (let radius = 0; radius <= SEED_RADIUS_CELLS; radius += 1) {
    const found = inkOnRing(grid, sx, sy, radius);
    if (found >= 0) return found;
  }
  return -1;
}

interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * The cells with ink closer than the gap of a logo to one another. `comp` marks those already taken:
 * several logos of one strip share it, so that none is found twice.
 */
export function grow(
  grid: InkGrid,
  seed: number,
  comp: Uint8Array = new Uint8Array(grid.cw * grid.ch),
): { bounds: Bounds; comp: Uint8Array } {
  const { on, cw, ch } = grid;
  const reach = Math.ceil(LOGO_GAP / CELL);
  const pending = [seed];
  const bounds: Bounds = { x0: cw, y0: ch, x1: -1, y1: -1 };
  comp[seed] = 1;
  while (pending.length > 0) {
    const cell = pending.pop() ?? 0;
    const [cx, cy] = [cell % cw, Math.trunc(cell / cw)];
    bounds.x0 = Math.min(bounds.x0, cx);
    bounds.x1 = Math.max(bounds.x1, cx);
    bounds.y0 = Math.min(bounds.y0, cy);
    bounds.y1 = Math.max(bounds.y1, cy);
    for (let ny = Math.max(0, cy - reach); ny <= Math.min(ch - 1, cy + reach); ny += 1) {
      for (let nx = Math.max(0, cx - reach); nx <= Math.min(cw - 1, cx + reach); nx += 1) {
        const next = ny * cw + nx;
        if (on[next] && !comp[next]) {
          comp[next] = 1;
          pending.push(next);
        }
      }
    }
  }
  return { bounds, comp };
}

/** It reaches the edge of what was read, and there is more picture beyond: it is not a loose logo. */
function touchesEdge(
  { x0, y0, x1, y1 }: Bounds,
  { cw, ch }: InkGrid,
  area: { x0: number; y0: number; x1: number; y1: number },
  picture: { width: number; height: number },
): boolean {
  return (
    (x0 === 0 && area.x0 > 0) ||
    (y0 === 0 && area.y0 > 0) ||
    (x1 === cw - 1 && area.x1 < picture.width) ||
    (y1 === ch - 1 && area.y1 < picture.height)
  );
}

function clampCell(value: number, size: number): number {
  return Math.min(size - 1, Math.max(0, value));
}

/** Looks for the logo printed at a point of the picture. */
export function detectLogo(art: FlyerArt, ix: number, iy: number): Detection {
  const picture = { width: art.width, height: art.height };
  const area = {
    x0: Math.max(0, Math.round(ix - REACH_X)),
    y0: Math.max(0, Math.round(iy - REACH_Y)),
    x1: Math.min(picture.width, Math.round(ix + REACH_X)),
    y1: Math.min(picture.height, Math.round(iy + REACH_Y)),
  };
  const [w, h] = [area.x1 - area.x0, area.y1 - area.y0];
  if (w < 30 || h < 30) return { error: "nada" };
  const data = pixelsOf(art, area.x0, area.y0, w, h);
  const background = backgroundOf(data);
  const grid = inkGrid(data, w, h, background);
  const seed = seedCell(
    grid,
    clampCell(Math.floor((ix - area.x0) / CELL), grid.cw),
    clampCell(Math.floor((iy - area.y0) / CELL), grid.ch),
  );
  if (seed < 0) return { error: "nada" };
  const { bounds, comp } = grow(grid, seed);
  const boxW = (bounds.x1 - bounds.x0 + 1) * CELL;
  const boxH = (bounds.y1 - bounds.y0 + 1) * CELL;
  if (touchesEdge(bounds, grid, area, picture) || boxW > MAX_LOGO_WIDTH || boxH > MAX_LOGO_HEIGHT) {
    return { error: "grande" };
  }
  if (boxW < SMALLEST_LOGO && boxH < SMALLEST_LOGO) return { error: "nada" };
  return {
    x: area.x0 + bounds.x0 * CELL,
    y: area.y0 + bounds.y0 * CELL,
    w: Math.min(boxW, w - bounds.x0 * CELL),
    h: Math.min(boxH, h - bounds.y0 * CELL),
    bg: rgbText(background),
    win: { x0: area.x0, y0: area.y0, cw: grid.cw, ch: grid.ch, CS: CELL, on: grid.on, comp },
  };
}

function borderIndexes(w: number, h: number): number[] {
  const border: number[] = [];
  for (let index = 0; index < w; index += 1) border.push(index, (h - 1) * w + index);
  for (let index = 0; index < h; index += 1) border.push(index * w, index * w + w - 1);
  return border;
}

/** A box marked by hand: its background comes from the border. Null if it is too small. */
export function markedPlace(art: FlyerArt, rawX: number, rawY: number, rawW: number, rawH: number) {
  const x = Math.max(0, Math.round(rawX));
  const y = Math.max(0, Math.round(rawY));
  const w = Math.min(art.width - x, Math.round(rawW));
  const h = Math.min(art.height - y, Math.round(rawH));
  if (w < SMALLEST_BOX || h < SMALLEST_BOX) return null;
  const data = pixelsOf(art, x, y, w, h);
  const border = borderIndexes(w, h);
  const borderPixels = new Uint8ClampedArray(border.length * 4);
  for (const [position, index] of border.entries()) {
    borderPixels[position * 4] = at(data, index * 4);
    borderPixels[position * 4 + 1] = at(data, index * 4 + 1);
    borderPixels[position * 4 + 2] = at(data, index * 4 + 2);
  }
  const background = backgroundOf(borderPixels);
  let drawn = 0;
  for (let offset = 0; offset < data.length; offset += 4) {
    if (differenceAt(data, offset, background) > INK_TOLERANCE) drawn += 1;
  }
  const onBorder = border.filter(
    (index) => differenceAt(data, index * 4, background) > INK_TOLERANCE,
  ).length;
  return {
    x,
    y,
    w,
    h,
    bg: rgbText(background),
    manual: true,
    vacio: drawn < w * h * 0.002,
    corta: onBorder > border.length * 0.02,
  } satisfies FlyerPlace;
}

function isFreeCell(win: InkWindow, column: number, row: number): boolean {
  const cell = row * win.cw + column;
  return !win.on[cell] || Boolean(win.comp[cell]);
}

/** Is the box, with some air, free of ANOTHER drawing? Out of what was read: it is not known. */
function isFree(win: InkWindow | undefined, x: number, y: number, w: number, h: number): boolean {
  if (!win) return false;
  const first = Math.floor((x - ROOM_MARGIN - win.x0) / win.CS);
  const top = Math.floor((y - ROOM_MARGIN - win.y0) / win.CS);
  const last = Math.ceil((x + w + ROOM_MARGIN - win.x0) / win.CS);
  const bottom = Math.ceil((y + h + ROOM_MARGIN - win.y0) / win.CS);
  if (first < 0 || top < 0 || last > win.cw || bottom > win.ch) return false;
  for (let row = top; row < bottom; row += 1) {
    for (let column = first; column < last; column += 1) {
      if (!isFreeCell(win, column, row)) return false;
    }
  }
  return true;
}

/**
 * Where the new logo goes: fitted in the place of the old one, without stretching it. If its shape
 * leaves it much smaller, it grows while there is free background and up to about the same surface.
 */
export function destinationOf(place: FlyerPlace, aspect: number): DrawnBox {
  const cx = place.x + place.w / 2;
  const cy = place.y + place.h / 2;
  let [tw, th] = [place.w, place.w / aspect];
  if (th > place.h) {
    th = place.h;
    tw = th * aspect;
  }
  const area = place.w * place.h;
  let [bestW, bestH] = [tw, th];
  for (let factor = 1.05; factor <= 1.9; factor += 0.05) {
    const [w2, h2] = [tw * factor, th * factor];
    if (w2 * h2 > area * 1.1 || !isFree(place.win, cx - w2 / 2, cy - h2 / 2, w2, h2)) break;
    [bestW, bestH] = [w2, h2];
  }
  return { tx: cx - bestW / 2, ty: cy - bestH / 2, tw: bestW, th: bestH };
}

function inkInRows(
  data: Uint8ClampedArray,
  place: FlyerPlace,
  background: Rgb,
  tolerance: number,
): number[] {
  const rows: number[] = [];
  for (let y = 0; y < place.h; y += 1) {
    let count = 0;
    for (let x = 0; x < place.w; x += 1) {
      if (differenceAt(data, (y * place.w + x) * 4, background) > tolerance) count += 1;
    }
    rows.push(count);
  }
  return rows;
}

/** How many lines of text there are: between two lines there is almost no ink. */
export function countLines(art: FlyerArt, place: FlyerPlace): number {
  const data = pixelsOf(art, place.x, place.y, place.w, place.h);
  const rows = inkInRows(data, place, rgbOf(place.bg), INK_TOLERANCE);
  const threshold = Math.max(1, Math.max(...rows) * 0.08);
  let lines = 0;
  let inARow = 0;
  for (const count of [...rows, 0]) {
    if (count > threshold) {
      inARow += 1;
    } else {
      if (inARow >= 5) lines += 1;
      inARow = 0;
    }
  }
  return Math.max(1, Math.min(6, lines));
}

function toHex(value: number): string {
  return value.toString(16).padStart(2, "0");
}

/** The color that repeats the most in what is not background: that of the text it replaces. */
export function printedColor(art: FlyerArt, place: FlyerPlace): string | null {
  const data = pixelsOf(art, place.x, place.y, place.w, place.h);
  const background = rgbOf(place.bg);
  const counts = new Map<string, number>();
  let best: string | null = null;
  let bestCount = 0;
  for (let offset = 0; offset < data.length; offset += 4) {
    if (differenceAt(data, offset, background) > TEXT_INK_DIFFERENCE) {
      const key = `${at(data, offset) >> 3}|${at(data, offset + 1) >> 3}|${at(data, offset + 2) >> 3}`;
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      if (count > bestCount) {
        bestCount = count;
        best = key;
      }
    }
  }
  if (!best) return null;
  return `#${best
    .split("|")
    .map((part) => toHex(Math.min(255, (Number(part) << 3) + 4)))
    .join("")}`;
}

/** The color of a printed text: of the 15% farthest from the background, the core of the strokes. */
export function printedTextColor(art: FlyerArt, place: FlyerPlace): string | null {
  const rounded = roundedBox(place);
  const data = pixelsOf(art, rounded.x, rounded.y, rounded.w, rounded.h);
  const background = rgbOf(place.bg);
  const inked: { difference: number; offset: number }[] = [];
  for (let offset = 0; offset < data.length; offset += 4) {
    const difference = differenceAt(data, offset, background);
    if (difference > INK_TOLERANCE) inked.push({ difference, offset });
  }
  if (inked.length === 0) return null;
  const strongest = inked
    .toSorted((one, other) => other.difference - one.difference)
    .slice(0, Math.max(1, Math.round(inked.length * 0.15)));
  const channel = (index: number) =>
    Math.round(
      strongest.reduce((sum, { offset }) => sum + at(data, offset + index), 0) / strongest.length,
    );
  return `#${toHex(channel(0))}${toHex(channel(1))}${toHex(channel(2))}`;
}

export function roundedBox({ x, y, w, h }: Pick<FlyerPlace, "x" | "y" | "w" | "h">) {
  return {
    x: Math.round(x),
    y: Math.round(y),
    w: Math.max(1, Math.round(w)),
    h: Math.max(1, Math.round(h)),
  };
}
