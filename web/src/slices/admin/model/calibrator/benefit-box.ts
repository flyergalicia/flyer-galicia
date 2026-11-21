// Finds the benefit box of Flyer Rubros on the picture (`_fgBenefDetectarCuadro`): a panel of one
// color, wide, with the drawing on one side and the area of the text on the other. Null if it is not
// there or the picture cannot be read.
import type { FlyerArt } from "@/shared/flyer-engine/index.ts";
import type { BenefitBox } from "./benefit.ts";

const WIDTH = 1240;
const SEARCH_FROM = 0.15;
const SEARCH_TO = 0.75;
const PROBE_DEFAULT = 0.4;
const PROBE_COLUMNS = [0.9, 0.5, 0.75, 0.25];
const PROBE_STEP = 40;
const PROBE_ROUNDS = 5;
const SAME_COLOR = 9;
const PAGE_COLOR = 10;
const PAGE_EDGE = 5;
const BORDER_ROOM = 6;
const PANEL_SHORTEST = 80;
const PANEL_TALLEST = 900;
const PANEL_NARROWEST = 300;
const TEXT_NARROWEST = 250;
const TEXT_GAP = 24;
const FULL_SHARE = 0.5;
const TEXT_SHARE = 0.6;

type Color = readonly [number, number, number];

interface Pixels {
  readonly data: Uint8ClampedArray;
  readonly height: number;
}

function colorAt({ data }: Pixels, x: number, y: number): Color {
  const index = (y * WIDTH + x) * 4;
  return [data[index] ?? 0, data[index + 1] ?? 0, data[index + 2] ?? 0];
}

function near(one: Color, other: Color, tolerance: number): boolean {
  return (
    Math.abs(one[0] - other[0]) <= tolerance &&
    Math.abs(one[1] - other[1]) <= tolerance &&
    Math.abs(one[2] - other[2]) <= tolerance
  );
}

/** The column from the probe up and down while it keeps the color, forgiving two pixels. */
function panelRows(pixels: Pixels, x: number, from: number, color: Color) {
  const same = (y: number) => near(colorAt(pixels, x, y), color, SAME_COLOR);
  let top = from;
  let gap = 0;
  for (; top > 0 && gap <= 2; top -= 1) gap = same(top - 1) ? 0 : gap + 1;
  top += gap;
  let bottom = from;
  gap = 0;
  for (; bottom < pixels.height - 1 && gap <= 2; bottom += 1) gap = same(bottom + 1) ? 0 : gap + 1;
  bottom -= gap;
  return { top, bottom };
}

/** For each column, how much of the panel (between its borders) has its color. */
function columnShares(pixels: Pixels, top: number, bottom: number, color: Color): number[] {
  const from = top + BORDER_ROOM;
  const to = bottom - BORDER_ROOM;
  const rows = to - from + 1;
  const shares: number[] = [];
  for (let x = 0; x < WIDTH; x += 1) {
    let count = 0;
    for (let y = from; y <= to; y += 1) {
      if (near(colorAt(pixels, x, y), color, SAME_COLOR)) count += 1;
    }
    shares.push(count / rows);
  }
  return shares;
}

/** The widest run of columns full of the color: the area of the text, beside the drawing. */
function textArea(shares: readonly number[], left: number, right: number) {
  let best = { from: -1, to: -1 };
  let run = { from: -1, to: -1 };
  let gap = 0;
  for (let x = left; x <= right; x += 1) {
    if ((shares[x] ?? 0) >= TEXT_SHARE) {
      if (run.from < 0) run = { from: x, to: x };
      run.to = x;
      gap = 0;
    } else if (run.from >= 0 && ++gap > TEXT_GAP) {
      if (run.to - run.from > best.to - best.from) best = run;
      run = { from: -1, to: -1 };
      gap = 0;
    }
  }
  if (run.from >= 0 && run.to - run.from > best.to - best.from) best = run;
  return best;
}

interface Probe {
  readonly x: number;
  readonly y: number;
  readonly offset: number;
}

function boxAt(pixels: Pixels, { x, y, offset }: Probe): BenefitBox | null {
  const page = colorAt(pixels, WIDTH - PAGE_EDGE, y);
  const color = colorAt(pixels, x, y);
  // The background of the page: the probe did not fall on the panel.
  if (near(color, page, PAGE_COLOR)) return null;
  const { top, bottom } = panelRows(pixels, x, y, color);
  if (bottom - top < PANEL_SHORTEST || bottom - top > PANEL_TALLEST) return null;
  const shares = columnShares(pixels, top, bottom, color);
  const left = shares.findIndex((share) => share >= FULL_SHARE);
  const right = shares.findLastIndex((share) => share >= FULL_SHARE);
  if (left < 0 || right - left < PANEL_NARROWEST) return null;
  const text = textArea(shares, left, right);
  if (text.from < 0 || text.to - text.from < TEXT_NARROWEST) return null;
  return {
    top: top + offset,
    bottom: bottom + offset,
    left,
    right,
    textoX0: text.from,
    textoX1: text.to,
    cx: Math.round((text.from + text.to) / 2),
    cy: Math.round((top + bottom) / 2 + offset),
  };
}

/** Where to probe, nearest to the block first: up and down by 40, at four columns each. */
function probes(base: number, height: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let round = 0; round <= PROBE_ROUNDS; round += 1) {
    for (const sign of [-1, 1]) {
      if (round === 0 && sign > 0) continue;
      const y = base + sign * round * PROBE_STEP;
      if (y < 0 || y >= height) continue;
      for (const share of PROBE_COLUMNS) out.push({ x: Math.round(WIDTH * share), y });
    }
  }
  return out;
}

function readArea(art: FlyerArt, offset: number, height: number): Pixels | null {
  const scale = art.width / WIDTH;
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context || height <= 0) return null;
  context.drawImage(art, 0, offset * scale, art.width, height * scale, 0, 0, WIDTH, height);
  return { data: context.getImageData(0, 0, WIDTH, height).data, height };
}

/** `around`: the middle of the block of lines, in pixels of the flyer. */
export function findBenefitBox(art: FlyerArt, around: number): BenefitBox | null {
  try {
    const flyerHeight = Math.round(art.height / (art.width / WIDTH));
    const offset = Math.round(flyerHeight * SEARCH_FROM);
    const height = Math.round(flyerHeight * SEARCH_TO) - offset;
    const pixels = readArea(art, offset, height);
    if (!pixels) return null;
    const base = Math.round((around || flyerHeight * PROBE_DEFAULT) - offset);
    for (const probe of probes(base, height)) {
      const box = boxAt(pixels, { ...probe, offset });
      if (box) return box;
    }
    return null;
  } catch {
    return null;
  }
}
