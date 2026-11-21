// The guides of a drag: the box of what moves (edges and center) against the edges and centers of the
// other changes, the center of the flyer and the center of the place of the logo touched.
import { boxOf, isAdjustable, type PlacedChange } from "./change.ts";

const SNAP_SCREEN_PIXELS = 6;

export interface MovingLogo {
  readonly index: number;
  readonly tx: number;
  readonly ty: number;
}

export interface GuideLine {
  readonly axis: "vertical" | "horizontal";
  /** In pixels of the picture. */
  readonly at: number;
  readonly distance: number;
  /** With the keyboard: not on the line yet. */
  readonly near?: boolean;
  /** With the keyboard: exactly on it. */
  readonly exact?: boolean;
}

export interface GuideResult {
  readonly dx: number;
  readonly dy: number;
  readonly lines: readonly GuideLine[];
}

function closest(mine: readonly number[], candidates: readonly number[], limit: number) {
  let best: { distance: number; at: number } | null = null;
  for (const own of mine) {
    for (const at of candidates) {
      const distance = at - own;
      if (Math.abs(distance) <= limit && (!best || Math.abs(distance) < Math.abs(best.distance))) {
        best = { distance, at };
      }
    }
  }
  return best;
}

function movingBox(
  moving: readonly MovingLogo[],
  list: readonly PlacedChange[],
  dx: number,
  dy: number,
) {
  let [x0, y0, x1, y1] = [1e9, 1e9, -1e9, -1e9];
  for (const { index, tx, ty } of moving) {
    const change = list[index];
    if (change) {
      const { tw, th } = boxOf(change);
      x0 = Math.min(x0, tx + dx);
      y0 = Math.min(y0, ty + dy);
      x1 = Math.max(x1, tx + dx + tw);
      y1 = Math.max(y1, ty + dy + th);
    }
  }
  return { x0, y0, x1, y1 };
}

export interface GuideInput {
  readonly list: readonly PlacedChange[];
  readonly moving: readonly MovingLogo[];
  readonly main: number;
  readonly dx: number;
  readonly dy: number;
  /** Pixels of screen per pixel of picture. */
  readonly screenScale: number;
  readonly flyerWidth: number;
}

function linesToCompare({ list, moving, main, flyerWidth }: GuideInput) {
  const moves = new Set(moving.map(({ index }) => index));
  const vertical: number[] = [];
  const horizontal: number[] = [];
  for (const [index, change] of list.entries()) {
    if (!moves.has(index) && isAdjustable(change)) {
      const { tx, ty, tw, th } = boxOf(change);
      vertical.push(tx, tx + tw / 2, tx + tw);
      horizontal.push(ty, ty + th / 2, ty + th);
    }
  }
  if (flyerWidth) vertical.push(flyerWidth / 2);
  const reference = list[main];
  if (reference?.ow) {
    vertical.push(reference.ox + reference.ow / 2);
    horizontal.push(reference.oy + reference.oh / 2);
  }
  return { vertical, horizontal };
}

export function guidesFor(input: GuideInput): GuideResult {
  const { list, moving, dx, dy, screenScale } = input;
  const { x0, y0, x1, y1 } = movingBox(moving, list, dx, dy);
  const { vertical, horizontal } = linesToCompare(input);
  const limit = SNAP_SCREEN_PIXELS / screenScale;
  const bestX = closest([x0, (x0 + x1) / 2, x1], vertical, limit);
  const bestY = closest([y0, (y0 + y1) / 2, y1], horizontal, limit);
  const lines: GuideLine[] = [];
  if (bestX) lines.push({ axis: "vertical", at: bestX.at, distance: bestX.distance });
  if (bestY) lines.push({ axis: "horizontal", at: bestY.at, distance: bestY.distance });
  return { dx: bestX?.distance ?? 0, dy: bestY?.distance ?? 0, lines };
}

/** With the arrows, no magnet (one pixel at a time would fight it): solid is exactly on the line. */
export function keyboardLines(lines: readonly GuideLine[]): readonly GuideLine[] {
  return lines.map((line) => {
    const near = Math.abs(line.distance) >= 0.5;
    return { ...line, near, exact: !near };
  });
}
