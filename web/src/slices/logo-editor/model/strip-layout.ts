// Where each logo of a strip goes. By default in the rows of the original, shared out evenly: 8 logos
// in a strip of 2 rows give 4 and 4, not 7 and 1. A row is added only if each row would otherwise
// have more than 1.5 times what it had.
import type { DrawnBox } from "./change.ts";
import type { StripInfo, StripPick, StripRect } from "./strip-types.ts";

/** Most logos a strip takes. */
export const STRIP_MAX = 30;

export const STRIP_LINE_HEIGHT = 1.18;

const COLUMNS_WITHOUT_ROWS = 6;
const TOO_MANY_PER_ROW = 1.5;
const HEIGHT_OF_ROW = 0.82;
const HEIGHT_OF_ORIGINAL = 1.15;
const HEIGHT_WITHOUT_ORIGINAL = 0.7;
const WIDTH_OF_CELL = 0.86;
const SURFACE = 1.5;
const FONT_OF_PRINTED_LINE = 0.75;
const ROOM_FOR_ROW = 0.9;
const TWO_LINES = 2;
const AIR_OF_LINE = 0.35;
const ORIGINAL_LOGO_LIMIT = 1.05;

export interface StripPlace {
  readonly cx: number;
  readonly cy: number;
  readonly w: number;
  readonly h: number;
}

/** How many go on each row when nobody chose it. */
function automaticColumns(info: StripInfo, count: number): number {
  const rows = info.filas.length;
  if (!rows) return Math.min(COLUMNS_WITHOUT_ROWS, Math.max(1, count));
  const limit = Math.max(info.porFila, Math.floor(info.porFila * TOO_MANY_PER_ROW));
  let needed = rows;
  while (Math.ceil(count / needed) > limit) needed += 1;
  return Math.ceil(count / needed);
}

/**
 * With the rows of the original, at its heights. If not, shared out evenly INSIDE the zone where the
 * logos were: if the box took part of the title or of the text below, a new row stepped on them.
 */
function rowCenters(info: StripInfo, rect: StripRect, rows: number) {
  const original = info.filas;
  const first = original[0];
  const last = original.at(-1);
  if (original.length === rows && first && last) {
    return {
      centers: original.map(({ cy }) => cy),
      step: rows > 1 ? (last.cy - first.cy) / (rows - 1) : rect.h,
    };
  }
  let [top, bottom] = [rect.y, rect.y + rect.h];
  if (original.length > 1 && first && last) {
    const between = (last.cy - first.cy) / (original.length - 1);
    top = Math.max(rect.y, first.cy - between / 2);
    bottom = Math.min(rect.y + rect.h, last.cy + between / 2);
  }
  const step = (bottom - top) / rows;
  return {
    centers: Array.from({ length: rows }, (_row, index) => top + step * (index + 0.5)),
    step,
  };
}

/** A grid with days below: the place of a logo is what is left between rows, less two lines of days. */
function logoHeight(info: StripInfo, step: number): number {
  const usual = Math.min(
    step * HEIGHT_OF_ROW,
    info.medH ? info.medH * HEIGHT_OF_ORIGINAL : step * HEIGHT_WITHOUT_ORIGINAL,
  );
  if (!info.conTexto || !info.txtH || step <= 0) return usual;
  const font = info.txtH / FONT_OF_PRINTED_LINE;
  const room = step * ROOM_FOR_ROW - font * STRIP_LINE_HEIGHT * TWO_LINES - font * AIR_OF_LINE;
  return Math.max(usual, Math.min(room, (info.maxH || usual) * ORIGINAL_LOGO_LIMIT));
}

/** The last row, if it comes up short, goes centered. */
export function stripPlaces(
  rect: StripRect,
  info: StripInfo,
  perRow: number,
  count: number,
): StripPlace[] {
  const columns = Math.max(1, Math.min(perRow || automaticColumns(info, count), count || 1));
  const rows = Math.max(1, Math.ceil(count / columns));
  const { centers, step } = rowCenters(info, rect, rows);
  const cell = rect.w / columns;
  const height = logoHeight(info, step);
  const width = cell * WIDTH_OF_CELL;
  return Array.from({ length: count }, (_place, index) => {
    const row = Math.floor(index / columns);
    const onRow = Math.min(columns, count - row * columns);
    const left = rect.x + (rect.w - onRow * cell) / 2;
    return {
      cx: left + cell * ((index % columns) + 0.5),
      cy: centers[row] ?? 0,
      w: width,
      h: height,
    };
  });
}

/**
 * The same visual weight: all with about the same surface, so that a very wide one does not come out
 * thin and a square one huge, without going beyond their place.
 */
export function fitLogo({ cx, cy, w, h }: StripPlace, aspect: number): DrawnBox {
  const surface = h * h * SURFACE;
  const [width, height] = [Math.sqrt(surface * aspect), Math.sqrt(surface / aspect)];
  const factor = Math.min(1, w / width, h / height);
  const [tw, th] = [width * factor, height * factor];
  return { tx: cx - tw / 2, ty: cy - th / 2, tw, th };
}

/** What was adjusted by hand on the preview: it grows from its center. */
export function adjusted(
  { k = 1, dx = 0, dy = 0 }: StripPick,
  sizeOfAll: number,
  { tx, ty, tw, th }: DrawnBox,
): DrawnBox {
  const size = k * sizeOfAll;
  const [width, height] = [tw * size, th * size];
  const [cx, cy] = [tx + tw / 2 + dx, ty + th / 2 + dy];
  return { tx: cx - width / 2, ty: cy - height / 2, tw: width, th: height };
}
