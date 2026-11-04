// What a box marked on the flyer means when there are strips built there already. It resumes one ONLY
// if the center of what was marked falls inside it: going over more than half of it was not enough,
// because a new strip marked right below one was taken for it, and their brands got mixed.
import type { PlacedChange } from "./change.ts";
import type { StripPick, StripRect } from "./strip-types.ts";

const SMALLEST_HEIGHT = 30;
const SMALLEST_WIDTH = 60;
const AIR = 4;

/** How much of the smaller of the two the other one takes. */
export function overlapOf({ ox, oy, ow, oh }: PlacedChange, rect: StripRect): number {
  const width = Math.min(ox + ow, rect.x + rect.w) - Math.max(ox, rect.x);
  const height = Math.min(oy + oh, rect.y + rect.h) - Math.max(oy, rect.y);
  if (width <= 0 || height <= 0) return 0;
  return (width * height) / Math.max(1, Math.min(ow * oh, rect.w * rect.h));
}

function holdsPoint({ ox, oy, ow, oh }: PlacedChange, x: number, y: number): boolean {
  return x >= ox && x <= ox + ow && y >= oy && y <= oy + oh;
}

function basesOf(list: readonly PlacedChange[]): readonly PlacedChange[] {
  return list.filter(({ franjaBase }) => franjaBase);
}

/** The built strip at that point of the flyer. */
export function stripAt(
  list: readonly PlacedChange[],
  x: number,
  y: number,
): PlacedChange | undefined {
  return basesOf(list).find((base) => holdsPoint(base, x, y));
}

function placeOf(base: PlacedChange): StripRect {
  return { x: base.ox, y: base.oy, w: base.ow, h: base.oh, bg: base.bg, corta: false };
}

/** One above the other, or one beside the other: the box loses what goes over the built one. */
function trimmedBy(rect: StripRect, base: PlacedChange, cx: number, cy: number): StripRect {
  const baseX = base.ox + base.ow / 2;
  const baseY = base.oy + base.oh / 2;
  const apartX = Math.abs(cx - baseX) / (base.ow + rect.w);
  const apartY = Math.abs(cy - baseY) / (base.oh + rect.h);
  if (apartY >= apartX) {
    if (baseY < cy) {
      const top = base.oy + base.oh + AIR;
      return { ...rect, y: Math.max(rect.y, top), h: rect.h - Math.max(0, top - rect.y) };
    }
    return { ...rect, h: Math.min(rect.h, base.oy - AIR - rect.y) };
  }
  if (baseX < cx) {
    const left = base.ox + base.ow + AIR;
    return { ...rect, x: Math.max(rect.x, left), w: rect.w - Math.max(0, left - rect.x) };
  }
  return { ...rect, w: Math.min(rect.w, base.ox - AIR - rect.x) };
}

/** The strip already built that a box falls on: the same rule as when marking it by hand. */
export function stripToResume(
  list: readonly PlacedChange[],
  box: StripRect,
): PlacedChange | undefined {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  return basesOf(list).find((one) => overlapOf(one, box) > 0.5 && holdsPoint(one, cx, cy));
}

export type StripWhere =
  | { readonly kind: "resume"; readonly rect: StripRect; readonly base: PlacedChange }
  | { readonly kind: "new"; readonly rect: StripRect; readonly trimmed: boolean }
  | { readonly kind: "too-small" };

export function whereStripOpens(list: readonly PlacedChange[], marked: StripRect): StripWhere {
  const cx = marked.x + marked.w / 2;
  const cy = marked.y + marked.h / 2;
  const base = stripToResume(list, marked);
  if (base) return { kind: "resume", rect: placeOf(base), base };
  let rect = marked;
  let trimmed = false;
  for (const other of basesOf(list)) {
    if (overlapOf(other, rect) > 0) {
      rect = trimmedBy(rect, other, cx, cy);
      trimmed = true;
    }
  }
  if (trimmed && (rect.h < SMALLEST_HEIGHT || rect.w < SMALLEST_WIDTH))
    return { kind: "too-small" };
  return { kind: "new", rect, trimmed };
}

/**
 * The selection of a strip as it is TODAY: a logo deleted or changed for another brand after it was
 * built does not come back. The order and what was adjusted by hand stay.
 */
export function currentSelection(
  list: readonly PlacedChange[],
  base: PlacedChange,
): readonly StripPick[] {
  const alive = list.filter(
    ({ franja, franjaBase, img }) => franja === base.franja && !franjaBase && img,
  );
  const logos = new Set(alive.map(({ img }) => img));
  const kept = (base.franjaSel ?? []).filter(({ img }) => logos.has(img));
  const known = new Set(kept.map(({ img }) => img));
  const added = alive.flatMap(({ img, t }) => (img && !known.has(img) ? [{ img, t }] : []));
  return [...kept, ...added];
}
