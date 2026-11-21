// The days under a supermarket on the flyer. Looks for the text printed under the logo, as a block
// centered below it, with measures in pixels of the flyer scaled to its width and not in proportion
// to the height of the logo: a logo 30 pixels tall left the text out. The logo is not split inside
// unless its box is very tall: the small letters of a logo are not days.
import type { FlyerArt } from "@/shared/flyer-engine/index.ts";
import type { DrawnBox, FlyerPlace } from "./change.ts";
import {
  countLines,
  differenceAt,
  INK_TOLERANCE,
  pixelsOf,
  printedTextColor,
  rgbOf,
} from "./flyer-pixels.ts";
import { TEXT_LINE_HEIGHT, widthOfLines } from "./text-measure.ts";

const BASE_WIDTH = 1240;
const SHORT_LINE_LIMIT = 44;

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface DaysSplit {
  readonly logo: FlyerPlace;
  readonly text: FlyerPlace | null;
  readonly lines: readonly Box[];
}

export function unitOf(art: FlyerArt): number {
  return Math.max(0.5, art.width / BASE_WIDTH);
}

function rowExtent(
  data: Uint8ClampedArray,
  row: number,
  width: number,
  background: readonly [number, number, number],
) {
  let [first, last] = [width, -1];
  for (let column = 0; column < width; column += 1) {
    if (differenceAt(data, (row * width + column) * 4, background) > INK_TOLERANCE) {
      first = Math.min(first, column);
      last = column;
    }
  }
  return { first, last };
}

interface RowBlock {
  y0: number;
  y1: number;
  x0: number;
  x1: number;
}

/** Blocks of rows with ink inside a box. `tolerance`: empty rows allowed within one block. */
function rowBlocks(art: FlyerArt, box: Box, background: string, tolerance: number): Box[] {
  const width = Math.max(1, Math.round(box.w));
  const height = Math.max(1, Math.round(box.h));
  const data = pixelsOf(art, Math.round(box.x), Math.round(box.y), width, height);
  const color = rgbOf(background);
  const blocks: RowBlock[] = [];
  let current: RowBlock | null = null;
  let gap = 0;
  for (let row = 0; row < height; row += 1) {
    const { first, last } = rowExtent(data, row, width, color);
    if (last >= 0) {
      if (current && gap <= tolerance) {
        current.y1 = row;
        current.x0 = Math.min(current.x0, first);
        current.x1 = Math.max(current.x1, last);
      } else {
        current = { y0: row, y1: row, x0: first, x1: last };
        blocks.push(current);
      }
      gap = 0;
    } else if (current) {
      gap += 1;
    }
  }
  return blocks.map(({ x0, x1, y0, y1 }) => ({
    x: box.x + x0,
    y: box.y + y0,
    w: x1 - x0 + 1,
    h: y1 - y0 + 1,
  }));
}

/** The lines of a block of text: pieces apart by real air. The dot of an "i" is not a line. */
function linesOf(blocks: readonly Box[]): Box[] {
  const lines: { x0: number; x1: number; y0: number; y1: number }[] = [];
  for (const block of blocks) {
    const last = lines.at(-1);
    if (last && (block.h < 5 || block.y <= last.y1 + 1)) {
      last.x0 = Math.min(last.x0, block.x);
      last.x1 = Math.max(last.x1, block.x + block.w);
      last.y1 = Math.max(last.y1, block.y + block.h);
    } else {
      lines.push({ x0: block.x, x1: block.x + block.w, y0: block.y, y1: block.y + block.h });
    }
  }
  return lines.map(({ x0, x1, y0, y1 }) => ({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }));
}

function acceptsFirst(block: Box, bottom: number, unit: number): "yes" | "skip" | "stop" {
  if (block.y - bottom > 42 * unit) return "stop";
  return block.h < 7 * unit ? "skip" : "yes";
}

function goesOn(block: Box, taken: readonly Box[], unit: number): boolean {
  const last = taken.at(-1);
  const first = taken[0];
  if (!last || !first) return false;
  if (block.y - (last.y + last.h) > Math.max(8 * unit, last.h * 0.7)) return false;
  return block.y + block.h - first.y <= 72 * unit;
}

function textBlocksBelow(blocks: readonly Box[], place: FlyerPlace, unit: number): Box[] {
  const cx = place.x + place.w / 2;
  const bottom = place.y + place.h;
  const reach = Math.max(place.w * 0.35, 30 * unit);
  const taken: Box[] = [];
  for (const block of blocks) {
    if (block.h > SHORT_LINE_LIMIT * unit) break;
    if (Math.abs(block.x + block.w / 2 - cx) <= reach) {
      if (taken.length === 0) {
        const verdict = acceptsFirst(block, bottom, unit);
        if (verdict === "stop") break;
        if (verdict === "yes") taken.push(block);
      } else {
        if (!goesOn(block, taken, unit)) break;
        taken.push(block);
      }
    }
  }
  return taken;
}

function joined(blocks: readonly Box[], bg: string): FlyerPlace {
  const x0 = Math.min(...blocks.map(({ x }) => x));
  const x1 = Math.max(...blocks.map(({ x, w }) => x + w));
  const y0 = blocks[0]?.y ?? 0;
  const last = blocks.at(-1);
  return { x: x0, y: y0, w: x1 - x0, h: (last ? last.y + last.h : y0) - y0, bg };
}

function splitBelow(art: FlyerArt, place: FlyerPlace, unit: number): DaysSplit | null {
  const cx = place.x + place.w / 2;
  const bottom = place.y + place.h;
  const wide = Math.max(place.w * 1.25, 150 * unit);
  const x = Math.max(0, cx - wide / 2);
  const y = bottom + 2;
  const h = Math.min(art.height - y, 120 * unit);
  const w = Math.min(art.width - x, wide);
  if (h <= 8 || w <= 8) return null;
  const taken = textBlocksBelow(rowBlocks(art, { x, y, w, h }, place.bg, 1), place, unit);
  if (taken.length === 0) return null;
  return { logo: place, text: joined(taken, place.bg), lines: linesOf(taken) };
}

function firstTextBlock(blocks: readonly Box[], unit: number): number {
  const last = blocks.at(-1);
  let index = blocks.length - 1;
  while (index > 1) {
    const [current, before] = [blocks[index], blocks[index - 1]];
    if (!last || !current || !before) break;
    const fits =
      before.h <= 36 * unit &&
      last.y + last.h - before.y <= 72 * unit &&
      current.y - (before.y + before.h) <= Math.max(8 * unit, before.h * 0.7);
    if (!fits) break;
    index -= 1;
  }
  return index;
}

/** A very tall box: the logo and its days may come together in the detection. */
function splitInside(art: FlyerArt, place: FlyerPlace, unit: number): DaysSplit | null {
  if (place.h <= 110 * unit) return null;
  const blocks = rowBlocks(art, place, place.bg, 0);
  const last = blocks.at(-1);
  if (blocks.length < 2 || !last) return null;
  const start = firstTextBlock(blocks, unit);
  const text = blocks.slice(start);
  const above = blocks[start - 1];
  const top = text[0]?.y ?? 0;
  if (!above) return null;
  const gap = top - (above.y + above.h);
  const isText =
    gap >= 3 * unit && last.y + last.h - top <= 72 * unit && text.every(({ h }) => h <= 36 * unit);
  if (!isText) return null;
  const logoBottom = above.y + above.h;
  return {
    logo: {
      x: place.x,
      y: place.y,
      w: place.w,
      h: Math.max(4, logoBottom - place.y),
      bg: place.bg,
      ...(place.manual === undefined ? {} : { manual: place.manual }),
    },
    text: joined(text, place.bg),
    lines: linesOf(text),
  };
}

export function splitDays(art: FlyerArt, place: FlyerPlace): DaysSplit {
  const unit = unitOf(art);
  try {
    return (
      splitBelow(art, place, unit) ??
      splitInside(art, place, unit) ?? { logo: place, text: null, lines: [] }
    );
  } catch {
    return { logo: place, text: null, lines: [] };
  }
}

function fontSizeOfLine(art: FlyerArt, line: Box, background: string): number {
  const width = Math.max(1, Math.round(line.w));
  const height = Math.max(1, Math.round(line.h));
  const data = pixelsOf(art, Math.round(line.x), Math.round(line.y), width, height);
  const color = rgbOf(background);
  const rows: number[] = [];
  for (let row = 0; row < height; row += 1) {
    let count = 0;
    for (let column = 0; column < width; column += 1) {
      if (differenceAt(data, (row * width + column) * 4, color) > INK_TOLERANCE) count += 1;
    }
    rows.push(count);
  }
  const fullest = Math.max(...rows);
  const tail = rows.slice(Math.floor(height * 0.78));
  const average = tail.reduce((sum, count) => sum + count, 0) / Math.max(1, tail.length);
  const hasDescenders = tail.length > 0 && fullest > 0 && average / fullest < 0.3;
  return height / (hasDescenders ? 0.93 : 0.73);
}

/**
 * The size of a printed text, by the height of the ink of each line: with letters that go below the
 * line it is about 0.93 of the size, without them 0.73. With several lines, the average of each,
 * because the line spacing of the flyer is not that of the app.
 */
export function printedFontSize(art: FlyerArt, lines: readonly Box[], background: string): number {
  if (lines.length === 0) return 0;
  const sizes = lines.map((line) => fontSizeOfLine(art, line, background));
  return sizes.reduce((sum, size) => sum + size, 0) / sizes.length;
}

/**
 * The size of the new logo: the surface of the one it replaces, so that it weighs the same as its
 * neighbors, with its own proportion, and without stepping on the days below.
 */
export function evenDestination(
  art: FlyerArt,
  place: FlyerPlace,
  aspect: number,
  bottomLimit: number | null,
): DrawnBox {
  const unit = unitOf(art);
  const width = Math.sqrt(place.w * place.h * aspect);
  const height = width / aspect;
  const maxWidth = Math.max(place.w, place.h * 2.4, 150 * unit);
  let maxHeight = Math.max(place.h, Math.min(place.h * 2.2, 95 * unit));
  if (bottomLimit !== null) {
    maxHeight = Math.min(maxHeight, Math.max(place.h, bottomLimit - place.y + place.h * 0.15));
  }
  const factor = Math.min(1, maxWidth / width, maxHeight / height);
  const [w, h] = [width * factor, height * factor];
  const cx = place.x + place.w / 2;
  let cy = place.y + place.h / 2;
  if (bottomLimit !== null && cy + h / 2 > bottomLimit) cy = bottomLimit - h / 2;
  return { tx: cx - w / 2, ty: cy - h / 2, tw: w, th: h };
}

const DAYS_WEIGHT = 500;
const DEFAULT_DAYS_COLOR = "#1A1A1A";

/** Where to cut in two lines: at the last " y ", or at the space nearest to the middle. */
function cutForTwoLines(text: string): number {
  const lastAnd = text.lastIndexOf(" y ");
  if (lastAnd > 0) return lastAnd + 2;
  const middle = text.length / 2;
  let best = -1;
  for (let at = 0; at < text.length; at += 1) {
    if (text[at] === " " && (best < 0 || Math.abs(at - middle) < Math.abs(best - middle))) {
      best = at;
    }
  }
  return best;
}

export interface DaysInput {
  readonly art: FlyerArt;
  readonly logoPlace: FlyerPlace;
  readonly text: FlyerPlace | null;
  readonly days: string;
  readonly lines: readonly Box[];
  readonly center: number;
}

/** The letter and color of the original, or those by default with no text to take them from. */
function daysLook(art: FlyerArt, text: FlyerPlace | null, lines: readonly Box[], unit: number) {
  if (!text) return { size: 20 * unit, color: DEFAULT_DAYS_COLOR, printedLines: 1 };
  const printedLines = Math.max(1, lines.length || countLines(art, text));
  const printed = printedFontSize(art, lines, text.bg);
  return {
    size: Math.max(12 * unit, Math.min(40 * unit, printed || text.h / printedLines)),
    color: printedTextColor(art, text) ?? DEFAULT_DAYS_COLOR,
    printedLines,
  };
}

/** If they do not fit in a line they go in two, before making the letter smaller. */
function fittedDays(days: string, startSize: number, room: number, unit: number) {
  let written = days;
  if (widthOfLines(written, DAYS_WEIGHT, startSize) > room) {
    const cut = cutForTwoLines(written);
    if (cut > 0) written = `${written.slice(0, cut).trim()}\n${written.slice(cut).trim()}`;
  }
  const wide = widthOfLines(written, DAYS_WEIGHT, startSize);
  const size = wide > room ? Math.max(10 * unit, (startSize * room) / wide) : startSize;
  return { written, size: Math.round(size) };
}

/** What covers takes in the old text AND the new one. */
function coverForDays(
  { text, logoPlace, center }: DaysInput,
  top: number,
  newWidth: number,
  newHeight: number,
): FlyerPlace {
  const left = Math.min(text ? text.x : center, center - newWidth / 2);
  const right = Math.max(text ? text.x + text.w : center, center + newWidth / 2);
  const bottom = Math.max(text ? text.y + text.h : top, top + newHeight);
  const coverTop = Math.min(top, text ? text.y : top);
  return {
    x: Math.round(left),
    y: Math.round(coverTop),
    w: Math.round(right - left),
    h: Math.round(bottom - coverTop),
    bg: text ? text.bg : logoPlace.bg,
    vacio: !text,
  };
}

/** How the days of a supermarket go under its logo. */
export function daysLayout(input: DaysInput) {
  const { art, logoPlace, text, days, lines } = input;
  const unit = unitOf(art);
  const look = daysLook(art, text, lines, unit);
  const room = Math.max(text ? text.w * 1.15 : 0, logoPlace.w * 1.1, 130 * unit);
  const { written, size } = fittedDays(days, look.size, room, unit);
  const lineCount = written.split("\n").length;
  const top = text ? text.y : logoPlace.y + logoPlace.h + 8 * unit;
  const newWidth = Math.ceil(widthOfLines(written, DAYS_WEIGHT, size)) + 4;
  const newHeight = Math.ceil(lineCount * size * TEXT_LINE_HEIGHT);
  return {
    cover: coverForDays(input, top, newWidth, newHeight),
    content: { texto: written, color: look.color, peso: DAYS_WEIGHT, fs: size },
    top,
    splitFromLines: Boolean(text) && lineCount === 1 && look.printedLines > 1,
  };
}
