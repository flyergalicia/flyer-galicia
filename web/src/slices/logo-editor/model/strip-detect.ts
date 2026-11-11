// The logos inside a strip and how they are placed: the same as touching a loose logo (the background
// is the color that repeats the most, parts closer than the gap are one logo), but all at once.
import type { FlyerArt } from "@/shared/flyer-engine/index.ts";
import {
  backgroundOf,
  CELL,
  grow,
  type InkGrid,
  inkGrid,
  pixelsOf,
  rgbText,
} from "./flyer-pixels.ts";
import type { StripBox, StripInfo, StripRow } from "./strip-types.ts";

/** Smaller than this on both sides, it is a speck of the compression. */
const SPECK = 12;
const SAME_ROW = 0.6;
const TEXT_ROW_HEIGHT = 0.65;
const TEXT_ROW_REACH = 1.35;

interface RowOfLogos {
  cy: number;
  h: number;
  n: number;
  readonly logos: StripBox[];
  isText: boolean;
}

function logosInGrid(grid: InkGrid, x: number, y: number): StripBox[] {
  const taken = new Uint8Array(grid.cw * grid.ch);
  const logos: StripBox[] = [];
  for (let cell = 0; cell < grid.cw * grid.ch; cell += 1) {
    if (grid.on[cell] && !taken[cell]) {
      const { bounds } = grow(grid, cell, taken);
      const w = (bounds.x1 - bounds.x0 + 1) * CELL;
      const h = (bounds.y1 - bounds.y0 + 1) * CELL;
      if (w >= SPECK || h >= SPECK) {
        logos.push({ x: x + bounds.x0 * CELL, y: y + bounds.y0 * CELL, w, h });
      }
    }
  }
  return logos;
}

function centerOf({ y, h }: StripBox): number {
  return y + h / 2;
}

/** Rows by the height of the center. */
function rowsOf(logos: readonly StripBox[]): RowOfLogos[] {
  const rows: RowOfLogos[] = [];
  const sorted = logos.toSorted((one, other) => centerOf(one) - centerOf(other));
  for (const logo of sorted) {
    const cy = centerOf(logo);
    const row = rows.at(-1);
    if (row && Math.abs(cy - row.cy) <= Math.max(row.h, logo.h) * SAME_ROW) {
      row.n += 1;
      row.cy = (row.cy * (row.n - 1) + cy) / row.n;
      row.h = Math.max(row.h, logo.h);
      row.logos.push(logo);
    } else {
      rows.push({ cy, h: logo.h, n: 1, logos: [logo], isText: false });
    }
  }
  return rows;
}

/**
 * A row much lower right under another one is the TEXT of that row (the days of the supermarkets),
 * and not logos: it counts neither as a row nor as a place. Without this, the grid of supermarkets
 * gave six short rows, and the logos and the days came out tiny.
 */
function markTextRows(rows: readonly RowOfLogos[]): void {
  for (const [index, row] of rows.entries()) {
    const before = rows[index - 1];
    if (
      before &&
      !before.isText &&
      row.h <= before.h * TEXT_ROW_HEIGHT &&
      row.cy - before.cy <= before.h * TEXT_ROW_REACH + row.h
    ) {
      row.isText = true;
    }
  }
}

function plainRow({ cy, h, n }: RowOfLogos): StripRow {
  return { cy, h, n };
}

/** Reads the logos printed in a box of the flyer. */
export function detectStrip(art: FlyerArt, x: number, y: number, w: number, h: number): StripInfo {
  const data = pixelsOf(art, x, y, w, h);
  const background = backgroundOf(data);
  const rows = rowsOf(logosInGrid(inkGrid(data, w, h, background), x, y));
  markTextRows(rows);
  const textHeights = rows.flatMap(({ isText, logos }) => (isText ? logos.map((l) => l.h) : []));
  const kept = rows.filter(({ isText }) => !isText);
  const logos = kept.flatMap((row) => row.logos);
  const heights = logos.map((logo) => logo.h).toSorted((one, other) => one - other);
  return {
    bg: rgbText(background),
    n: logos.length,
    filas: kept.map(plainRow),
    porFila: kept.reduce((most, { n }) => Math.max(most, n), 0),
    medH: heights[heights.length >> 1] ?? 0,
    conTexto: textHeights.length > 0,
    txtH: textHeights.length > 0 ? Math.min(...textHeights) : 0,
    maxH: heights.at(-1) ?? 0,
    cajas: logos,
  };
}
