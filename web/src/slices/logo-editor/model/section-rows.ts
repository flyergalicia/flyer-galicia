// How busy each row of a flyer is, to enter between two blocks: the part of the row that is not of
// the color of the margin, plus some texture. Almost 0 is a gap. The flat fill of a card is not one:
// it is of another color than the margin. Worked out once per picture.
import type { FlyerArt } from "@/shared/flyer-engine/index.ts";

const BLANK_BELOW = 2;
const SMALLEST_GAP_ROWS = 4;
const TILE_ROWS = 400;
const OUT_OF_MARGIN = 12;
const TEXTURE = 0.2;
const CLOSE_TO_MOUSE = 0.06;
const COPY_EDGE_REACH = 60;
const SMALLEST_COPY = 12;

export type SectionPicture = FlyerArt;

interface RowSample {
  readonly data: Uint8ClampedArray;
  readonly offset: number;
  readonly previous: Uint8ClampedArray | null;
  readonly previousOffset: number;
  readonly width: number;
}

const known = new WeakMap<object, Float32Array>();

function sizeOf(picture: SectionPicture): { width: number; height: number } {
  return picture instanceof HTMLImageElement
    ? { width: picture.naturalWidth, height: picture.naturalHeight }
    : { width: picture.width, height: picture.height };
}

function difference(
  one: Uint8ClampedArray,
  at: number,
  other: Uint8ClampedArray,
  otherAt: number,
): number {
  let total = 0;
  for (const channel of [0, 1, 2]) {
    total += Math.abs((one[at + channel] ?? 0) - (other[otherAt + channel] ?? 0));
  }
  return total;
}

function marginAt(data: Uint8ClampedArray, offset: number): Uint8ClampedArray {
  const start = offset + 16;
  const margin = new Uint8ClampedArray(3);
  for (const channel of [0, 1, 2]) {
    const sum =
      (data[start + channel] ?? 0) +
      (data[start + 16 + channel] ?? 0) +
      (data[start + 32 + channel] ?? 0);
    margin[channel] = sum / 3;
  }
  return margin;
}

function rowBusyness({ data, offset, previous, previousOffset, width }: RowSample): number {
  const margin = marginAt(data, offset);
  let [texture, samples, outside] = [0, 0, 0];
  for (let x = 0; x < width - 4; x += 4) {
    const pixel = offset + x * 4;
    texture += difference(data, pixel, data, pixel + 16);
    if (previous) texture += difference(data, pixel, previous, previousOffset + x * 4);
    if (difference(data, pixel, margin, 0) > OUT_OF_MARGIN) outside += 1;
    samples += 1;
  }
  return (100 * outside) / samples + (TEXTURE * texture) / samples;
}

function measureRows(picture: SectionPicture): Float32Array {
  const { width, height } = sizeOf(picture);
  const rows = new Float32Array(height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = TILE_ROWS;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return rows;
  try {
    let last: Uint8ClampedArray | null = null;
    for (let top = 0; top < height; top += TILE_ROWS) {
      const tall = Math.min(TILE_ROWS, height - top);
      context.clearRect(0, 0, width, TILE_ROWS);
      context.drawImage(picture, 0, top, width, tall, 0, 0, width, tall);
      const { data } = context.getImageData(0, 0, width, tall);
      for (let row = 0; row < tall; row += 1) {
        rows[top + row] = rowBusyness({
          data,
          offset: row * width * 4,
          previous: row ? data : last,
          previousOffset: row ? (row - 1) * width * 4 : 0,
          width,
        });
      }
      last = data.slice((tall - 1) * width * 4, tall * width * 4);
    }
  } catch {
    // A picture without CORS cannot be read: no gaps are known.
  }
  return rows;
}

export function rowsOf(picture: SectionPicture): Float32Array {
  const already = known.get(picture);
  if (already) return already;
  const rows = measureRows(picture);
  known.set(picture, rows);
  return rows;
}

export function isBlankRow(rows: Float32Array, row: number): boolean {
  return (rows[row] ?? 0) < BLANK_BELOW;
}

export interface FlyerGap {
  /** The middle of the gap, or the smoothest row if there is none near. */
  readonly y: number;
  /** How tall the gap is; 0 if none was found. */
  readonly g: number;
}

function gapAround(rows: Float32Array, row: number): { from: number; to: number } {
  let from = row;
  while (from > 0 && isBlankRow(rows, from - 1)) from -= 1;
  let to = row;
  while (to < rows.length - 1 && isBlankRow(rows, to + 1)) to += 1;
  return { from, to };
}

function nearestGap(rows: Float32Array, y: number, first: number, last: number): FlyerGap | null {
  let best: FlyerGap | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  let row = first;
  while (row <= last) {
    if (isBlankRow(rows, row)) {
      const { from, to } = gapAround(rows, row);
      const distance = y < from ? from - y : Math.max(0, y - to);
      if (to - from >= SMALLEST_GAP_ROWS && distance < bestDistance) {
        bestDistance = distance;
        best = { y: Math.round((from + to) / 2), g: to - from + 1 };
      }
      row = to + 1;
    } else {
      row += 1;
    }
  }
  return best;
}

/** Where to cut or to put something near y: entering in the middle of a gap leaves even space. */
export function gapNear(picture: SectionPicture, y: number, reach = 40): FlyerGap {
  const rows = rowsOf(picture);
  const first = Math.max(0, Math.round(y) - reach);
  const last = Math.min(rows.length - 1, Math.round(y) + reach);
  const gap = nearestGap(rows, y, first, last);
  if (gap) return gap;
  let [smoothest, lowest] = [Math.round(y), Number.POSITIVE_INFINITY];
  for (let row = first; row <= last; row += 1) {
    const cost = (rows[row] ?? 0) + Math.abs(row - y) * CLOSE_TO_MOUSE;
    if (cost < lowest) [smoothest, lowest] = [row, cost];
  }
  return { y: smoothest, g: 0 };
}

/** What was dragged on the flyer to copy: its edges go to gaps, and its blank margins are left out. */
export function sectionFromDrag(
  picture: SectionPicture,
  from: number,
  to: number,
): { readonly sy: number; readonly sh: number } | null {
  const [a, b] = [Math.min(from, to), Math.max(from, to)];
  if (b - a < SMALLEST_COPY) return null;
  let top = gapNear(picture, a, COPY_EDGE_REACH).y;
  let bottom = gapNear(picture, b, COPY_EDGE_REACH).y;
  if (bottom - top < SMALLEST_COPY) [top, bottom] = [a, b];
  const rows = rowsOf(picture);
  let [inkTop, inkBottom] = [top, bottom];
  while (inkTop < inkBottom && isBlankRow(rows, inkTop)) inkTop += 1;
  while (inkBottom > inkTop && isBlankRow(rows, inkBottom - 1)) inkBottom -= 1;
  if (inkBottom - inkTop >= SMALLEST_COPY) [top, bottom] = [inkTop, inkBottom];
  return { sy: Math.round(top), sh: Math.round(bottom - top) };
}

/** A section as a small picture: the thumbnails, and what follows the mouse. */
export function sectionThumbnail(
  picture: HTMLImageElement,
  { sy, sh }: { readonly sy: number; readonly sh: number },
  width: number,
): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = Math.max(1, Math.round((sh * width) / picture.naturalWidth));
  const context = canvas.getContext("2d");
  if (!context) return "";
  try {
    context.imageSmoothingQuality = "high";
    context.drawImage(picture, 0, sy, picture.naturalWidth, sh, 0, 0, width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } catch {
    return "";
  }
}
