import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

// The same per-pixel threshold and tolerance as toHaveScreenshot in playwright.config.ts.
const PIXEL_THRESHOLD = 0.2;
export const MAX_DIFF_RATIO = 0.001;
// The edges of the letters change a little from one run to another. On a small button, 0.1% is
// not even one letter's edge, so a few pixels are always allowed: 8 came up with the machine
// busy, and moving a badge by one pixel changes more than 100.
const ALWAYS_ALLOWED_PIXELS = 12;

export function allowedPixels(clip: Clip): number {
  return Math.max(ALWAYS_ALLOWED_PIXELS, Math.floor(clip.width * clip.height * MAX_DIFF_RATIO));
}

export interface Clip {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const REFERENCE_DIR = fileURLToPath(new URL("../../../fixtures/visual/darwin/", import.meta.url));

export function referenceImage(name: string): PNG {
  return PNG.sync.read(readFileSync(`${REFERENCE_DIR}${name}.png`));
}

/** Whole pixels that are inside the box and the image: a fractional edge blends with its neighbor. */
export function clipOf(box: Box, viewport: { width: number; height: number }): Clip | null {
  const left = Math.max(0, Math.ceil(box.x));
  const top = Math.max(0, Math.ceil(box.y));
  const right = Math.min(viewport.width, Math.floor(box.x + box.width));
  const bottom = Math.min(viewport.height, Math.floor(box.y + box.height));
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function crop(image: PNG, { x, y, width, height }: Clip): PNG {
  const part = new PNG({ width, height });
  PNG.bitblt(image, part, x, y, width, height, 0, 0);
  return part;
}

export function pixelAt(image: PNG, x: number, y: number): string {
  const start = (image.width * y + x) * 4;
  return `rgb(${String(image.data[start])}, ${String(image.data[start + 1])}, ${String(image.data[start + 2])})`;
}

/** Paints a part of the crop, given in page coordinates, so that it does not count. */
export function paintOut(image: PNG, area: Box, origin: Clip): void {
  const left = Math.max(0, Math.floor(area.x) - origin.x);
  const top = Math.max(0, Math.floor(area.y) - origin.y);
  const right = Math.min(image.width, Math.ceil(area.x + area.width) - origin.x);
  const bottom = Math.min(image.height, Math.ceil(area.y + area.height) - origin.y);
  for (let row = top; row < bottom; row += 1) {
    for (let column = left; column < right; column += 1) {
      const start = (image.width * row + column) * 4;
      image.data.set([255, 0, 255, 255], start);
    }
  }
}

/** Paints the four corners of a rounded box, so that what is behind them does not count. */
export function paintCorners(image: PNG, box: Box, radius: number, origin: Clip): void {
  for (const x of [box.x, box.x + box.width - radius]) {
    for (const y of [box.y, box.y + box.height - radius]) {
      paintOut(image, { x, y, width: radius, height: radius }, origin);
    }
  }
}

export interface Difference {
  pixels: number;
  ratio: number;
  /** The image of the differences, to attach when it fails. */
  picture: Buffer;
}

export function difference(reference: PNG, actual: PNG): Difference {
  const { width, height } = reference;
  const diff = new PNG({ width, height });
  const pixels = pixelmatch(reference.data, actual.data, diff.data, width, height, {
    threshold: PIXEL_THRESHOLD,
  });
  return { pixels, ratio: pixels / (width * height), picture: PNG.sync.write(diff) };
}
