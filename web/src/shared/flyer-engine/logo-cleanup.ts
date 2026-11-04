// A logo arrives with a background of its own, and on a cream flyer it would show as a patch. This
// takes the background out; it runs once per logo, so it works on the pixels directly.
import { contextOf, createCanvas, pictureSize } from "./canvas.ts";

const OPAQUE = 200;
const SEE_THROUGH = 24;
const WHITE = 235;
const SIMILAR_TO_BACKGROUND = 28;
const SOFT_EDGE_DIFFERENCE = 110;
const DARK_BACKGROUND = 150;
const DARK_INK_DIFFERENCE = 60;
const LIGHT_INK = 190;

interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

type Rgb = readonly [number, number, number];

function at(data: Uint8ClampedArray, offset: number): number {
  return data[offset] ?? 0;
}

function differenceFrom(data: Uint8ClampedArray, offset: number, color: Rgb): number {
  return Math.max(
    Math.abs(at(data, offset) - color[0]),
    Math.abs(at(data, offset + 1) - color[1]),
    Math.abs(at(data, offset + 2) - color[2]),
  );
}

function luminance(r: number, g: number, b: number): number {
  return 0.3 * r + 0.59 * g + 0.11 * b;
}

function neighborsOf(index: number, { width, height }: Pixels): number[] {
  const x = index % width;
  const y = Math.trunc(index / width);
  return [
    ...(x > 0 ? [index - 1] : []),
    ...(x < width - 1 ? [index + 1] : []),
    ...(y > 0 ? [index - width] : []),
    ...(y < height - 1 ? [index + width] : []),
  ];
}

/** The background of reference: that of the corners if they are opaque, or else white. */
function referenceColor({ data, width, height }: Pixels): Rgb {
  const corners = [
    0,
    (width - 1) * 4,
    (height - 1) * width * 4,
    ((height - 1) * width + width - 1) * 4,
  ].filter((offset) => at(data, offset + 3) > OPAQUE);
  if (corners.length < 3) return [255, 255, 255];
  const channel = (index: number) => {
    const sorted = corners.map((offset) => at(data, offset + index)).toSorted((a, b) => a - b);
    return sorted[sorted.length >> 1] ?? 255;
  };
  return [channel(0), channel(1), channel(2)];
}

function borderOffsets({ width, height }: Pixels): number[] {
  const offsets: number[] = [];
  for (let x = 0; x < width; x += 1) offsets.push(x * 4, ((height - 1) * width + x) * 4);
  for (let y = 0; y < height; y += 1) offsets.push(y * width * 4, (y * width + width - 1) * 4);
  return offsets;
}

function isAlreadyTransparent(pixels: Pixels): boolean {
  const border = borderOffsets(pixels);
  const clear = border.filter((offset) => at(pixels.data, offset + 3) <= SEE_THROUGH).length;
  return clear >= border.length * 0.3;
}

function isWhiteAt(data: Uint8ClampedArray, index: number): boolean {
  const offset = index * 4;
  return (
    at(data, offset + 3) > OPAQUE &&
    at(data, offset) > WHITE &&
    at(data, offset + 1) > WHITE &&
    at(data, offset + 2) > WHITE
  );
}

/** The white area that starts here, and the box around it. */
function whiteArea(pixels: Pixels, start: number, seen: Uint8Array) {
  const { data, width } = pixels;
  const area: number[] = [];
  const pending = [start];
  seen[start] = 1;
  let [x0, y0, x1, y1] = [Infinity, Infinity, 0, 0];
  while (pending.length > 0) {
    const index = pending.pop() ?? 0;
    area.push(index);
    const x = index % width;
    const y = Math.trunc(index / width);
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
    for (const next of neighborsOf(index, pixels)) {
      if (!seen[next] && isWhiteAt(data, next)) {
        seen[next] = 1;
        pending.push(next);
      }
    }
  }
  return { area, box: (x1 - x0 + 1) * (y1 - y0 + 1) };
}

/**
 * In a transparent PNG, a big white box inside it goes away: its box covers more than a quarter of
 * the picture and the area fills at least 40% of that box. Loose white letters are small and stay.
 */
function removeWhitePatch(pixels: Pixels): void {
  const { data, width, height } = pixels;
  const total = width * height;
  const seen = new Uint8Array(total);
  for (let index = 0; index < total; index += 1) {
    if (!seen[index] && isWhiteAt(data, index)) {
      const { area, box } = whiteArea(pixels, index, seen);
      if (box >= total * 0.25 && area.length >= box * 0.4) {
        for (const member of area) data[member * 4 + 3] = 0;
      }
    }
  }
}

function isLightInkOnDark({ data, width, height }: Pixels, background: Rgb): boolean {
  let ink = 0;
  let light = 0;
  for (let offset = 0; offset < width * height * 4; offset += 4) {
    if (differenceFrom(data, offset, background) > DARK_INK_DIFFERENCE) {
      ink += 1;
      if (
        at(data, offset) > LIGHT_INK &&
        at(data, offset + 1) > LIGHT_INK &&
        at(data, offset + 2) > LIGHT_INK
      ) {
        light += 1;
      }
    }
  }
  return ink > 0 && light >= ink * 0.8;
}

/**
 * A dark background (white letters in a blue square): taking it out would leave white letters on a
 * white flyer. If what is inside is light, it is painted with the color of the background and the
 * background goes away, with soft edges. If it has colors, the square stays.
 */
function recolorOnDark(pixels: Pixels, background: Rgb): void {
  if (!isLightInkOnDark(pixels, background)) return;
  const { data, width, height } = pixels;
  const [r, g, b] = background;
  const dark = luminance(r, g, b);
  for (let offset = 0; offset < width * height * 4; offset += 4) {
    const light = luminance(at(data, offset), at(data, offset + 1), at(data, offset + 2));
    const alpha = Math.max(0, Math.min(1, (light - dark - 12) / (255 - dark - 24)));
    data[offset] = r;
    data[offset + 1] = g;
    data[offset + 2] = b;
    data[offset + 3] = Math.round(at(data, offset + 3) * alpha);
  }
}

function isBackgroundAt(data: Uint8ClampedArray, index: number, background: Rgb): boolean {
  const offset = index * 4;
  return (
    at(data, offset + 3) <= SEE_THROUGH ||
    differenceFrom(data, offset, background) <= SIMILAR_TO_BACKGROUND
  );
}

/** Empties the background from the edges inwards: what is enclosed by the drawing is not touched. */
function emptyFromEdges(pixels: Pixels, background: Rgb): void {
  const { data, width, height } = pixels;
  const seen = new Uint8Array(width * height);
  const pending = borderOffsets(pixels).map((offset) => offset / 4);
  while (pending.length > 0) {
    const index = pending.pop() ?? 0;
    if (!seen[index]) {
      seen[index] = 1;
      if (isBackgroundAt(data, index, background)) {
        data[index * 4 + 3] = 0;
        pending.push(...neighborsOf(index, pixels));
      }
    }
  }
}

function touchesEmpty(pixels: Pixels, x: number, y: number): boolean {
  const { data, width } = pixels;
  return neighborsOf(y * width + x, pixels).some((next) => data[next * 4 + 3] === 0);
}

/**
 * The edge of a drawing mixes ink and background: it gets transparency by how much it looks like the
 * background, and that color comes out of it. If not, a jagged halo of the old color stays.
 */
function softenEdge(data: Uint8ClampedArray, offset: number, background: Rgb): void {
  const difference = differenceFrom(data, offset, background);
  if (difference >= SOFT_EDGE_DIFFERENCE) return;
  const alpha = Math.max(0.15, difference / SOFT_EDGE_DIFFERENCE);
  for (const channel of [0, 1, 2] as const) {
    const unmixed = (at(data, offset + channel) - background[channel] * (1 - alpha)) / alpha;
    data[offset + channel] = Math.max(0, Math.min(255, Math.round(unmixed)));
  }
  data[offset + 3] = Math.round(at(data, offset + 3) * alpha);
}

function softenEdges(pixels: Pixels, background: Rgb): void {
  const { data, width, height } = pixels;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (data[offset + 3] !== 0 && touchesEmpty(pixels, x, y)) {
        softenEdge(data, offset, background);
      }
    }
  }
}

function cleanPixels(pixels: Pixels): void {
  const background = referenceColor(pixels);
  if (isAlreadyTransparent(pixels)) removeWhitePatch(pixels);
  else if (luminance(...background) < DARK_BACKGROUND) recolorOnDark(pixels, background);
  else {
    emptyFromEdges(pixels, background);
    softenEdges(pixels, background);
  }
}

function inkBox({ data, width, height }: Pixels) {
  let [x0, y0, x1, y1] = [width, height, -1, -1];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (at(data, (y * width + x) * 4 + 3) > SEE_THROUGH) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
    }
  }
  return { x0, y0, width: x1 - x0 + 1, height: y1 - y0 + 1, isEmpty: x1 < 0 };
}

export interface CleanupOptions {
  /** A logo moved inside the flyer keeps its box: cutting its margins would stretch it. */
  readonly keepMargins?: boolean;
}

/** The logo with no background, cut to its ink. The result does not come from a cache. */
export function cleanLogo(
  source: HTMLImageElement | HTMLCanvasElement,
  { keepMargins = false }: CleanupOptions = {},
): HTMLCanvasElement {
  const { width, height } = pictureSize(source);
  const canvas = createCanvas(width, height);
  const ctx = contextOf(canvas, { willReadFrequently: true });
  ctx.drawImage(source, 0, 0);
  const image = ctx.getImageData(0, 0, width, height);
  const pixels: Pixels = { data: image.data, width, height };
  cleanPixels(pixels);
  ctx.putImageData(image, 0, 0);
  if (keepMargins) return canvas;
  const box = inkBox(pixels);
  if (box.isEmpty) return canvas;
  const output = createCanvas(box.width, box.height);
  contextOf(output).drawImage(
    canvas,
    box.x0,
    box.y0,
    box.width,
    box.height,
    0,
    0,
    box.width,
    box.height,
  );
  return output;
}
