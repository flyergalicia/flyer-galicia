// The flyer with its cuts applied: a canvas of the same width, put together by parts.
import { contextOf, createCanvas, pictureSize } from "./canvas.ts";
import { type Cut, type FlyerArt, type InsertedSection } from "./types.ts";

const SEAM_ROWS = 6;
const SAME_COLOR = 4;
const ANOTHER_COLOR = 60;
const SEAM_STEP = 16;

export type SectionImages = ReadonlyMap<string, HTMLImageElement>;

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function rowDifference(ctx: CanvasRenderingContext2D, width: number, a: number, b: number): number {
  const first = ctx.getImageData(0, a, width, 1).data;
  const second = ctx.getImageData(0, b, width, 1).data;
  let total = 0;
  let samples = 0;
  for (let x = 0; x < width * 4; x += SEAM_STEP) {
    for (const channel of [0, 1, 2]) {
      total += Math.abs((first[x + channel] ?? 0) - (second[x + channel] ?? 0));
    }
    samples += 1;
  }
  return total / samples;
}

/** A background that is similar, not equal, fades over some pixels; a very different one stays sharp. */
function blendSeam(
  ctx: CanvasRenderingContext2D,
  width: number,
  fixedRow: number,
  firstRow: number,
  step: number,
): void {
  try {
    const difference = rowDifference(ctx, width, fixedRow, firstRow);
    if (difference < SAME_COLOR || difference > ANOTHER_COLOR) return;
    ctx.save();
    for (let row = 0; row < SEAM_ROWS; row += 1) {
      ctx.globalAlpha = 1 - (row + 1) / (SEAM_ROWS + 1);
      ctx.drawImage(ctx.canvas, 0, fixedRow, width, 1, 0, firstRow + row * step, width, 1);
    }
    ctx.restore();
  } catch {
    // A source picture without CORS cannot be read: the seam stays as it is.
  }
}

function drawSection(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  section: InsertedSection,
  place: { y: number; height: number; width: number; pad: number },
): void {
  const { y, height, width, pad } = place;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    image,
    0,
    section.sy,
    pictureSize(image).width,
    section.sh,
    0,
    y + pad,
    width,
    height - 2 * pad,
  );
  if (pad > 0) return;
  if (y > 0) blendSeam(ctx, width, y - 1, y, 1);
  if (y + height < ctx.canvas.height) blendSeam(ctx, width, y + height, y + height - 1, -1);
}

/** A section goes in: the picture grows and what is below goes down. With no image, a gap stays. */
function insertSection(
  source: CanvasImageSource,
  size: { width: number; height: number },
  cut: Cut & { ins: InsertedSection },
  sections: SectionImages,
): HTMLCanvasElement {
  const { width, height } = size;
  const y = clamp(Math.round(cut.y), 0, height);
  const added = Math.max(1, Math.round(cut.h));
  const section = cut.ins;
  const pad = clamp(Math.round(section.pad || 0), 0, Math.floor((added - 1) / 2));
  const canvas = createCanvas(width, height + added);
  const ctx = contextOf(canvas);
  if (y > 0) ctx.drawImage(source, 0, 0, width, y, 0, 0, width, y);
  if (height - y > 0) {
    ctx.drawImage(source, 0, y, width, height - y, 0, y + added, width, height - y);
  }
  ctx.drawImage(source, 0, clamp(y - 1, 0, height - 1), width, 1, 0, y, width, added);
  const image = sections.get(section.u);
  if (image) drawSection(ctx, image, section, { y, height: added, width, pad });
  return canvas;
}

function removeBand(
  source: CanvasImageSource,
  { width, height }: { width: number; height: number },
  cut: Cut,
): HTMLCanvasElement {
  const y = clamp(Math.round(cut.y), 0, height);
  const removed = clamp(Math.round(cut.h), 0, height - y);
  const canvas = createCanvas(width, height - removed);
  const ctx = contextOf(canvas);
  if (y > 0) ctx.drawImage(source, 0, 0, width, y, 0, 0, width, y);
  const below = height - y - removed;
  if (below > 0) ctx.drawImage(source, 0, y + removed, width, below, 0, y, width, below);
  return canvas;
}

function hasSection(cut: Cut): cut is Cut & { ins: InsertedSection } {
  return Boolean(cut.ins);
}

/** Every cut after the other, each one in pixels of what the ones before left. */
export function applyCuts(art: FlyerArt, cuts: readonly Cut[], sections: SectionImages): FlyerArt {
  let result: FlyerArt = art;
  let { width, height } = pictureSize(art);
  for (const cut of cuts) {
    result = hasSection(cut)
      ? insertSection(result, { width, height }, cut, sections)
      : removeBand(result, { width, height }, cut);
    ({ width, height } = pictureSize(result));
  }
  return result;
}

/** The file name of an address: what identifies a flyer in stored data. */
export function artFileName(address: string): string {
  return address.split(/[?#]/)[0]?.split("/").pop() ?? "";
}

function cutSignature(cut: Cut): string {
  const section = cut.ins
    ? `i${artFileName(cut.ins.u).replaceAll(/\W/g, "").slice(-12)}${String(Math.round(cut.ins.sy))}.`
    : "";
  return `${section}${String(Math.round(cut.y))}-${String(Math.round(cut.h))}`;
}

/** What makes the key of a cropped picture different from the key of the whole one. */
export function cutsSignature(cuts: readonly Cut[]): string {
  return cuts.map(cutSignature).join("_");
}
