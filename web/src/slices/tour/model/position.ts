// Where the light goes and where its globe goes (`_tourPos`): the light over the element, the veil
// with a hole over it, and the globe on the side where it fits best, with its arrow pointing at the
// middle of the element. The same numbers as today, so it sits in the same place.

export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export type Side = "right" | "left" | "bottom" | "top";

export interface ArrowPlace {
  readonly top?: number;
  readonly left?: number;
  readonly right?: number;
  readonly bottom?: number;
}

export interface TipPlace {
  readonly side: Side;
  readonly top: number;
  readonly left: number;
  readonly arrow: ArrowPlace;
}

/** How much the light goes beyond the element. */
const MARGIN = 6;
/** Between the element and the globe. */
const GAP = 16;
/** What the globe keeps from the edges of the window. */
const EDGE = 10;
const ARROW_HALF = 8;
const ARROW_FROM_CORNER = 12;
const ARROW_LAST = 24;

export function spotlightOf({ left, top, width, height }: Rect): Rect {
  return {
    left: left - MARGIN,
    top: top - MARGIN,
    width: width + 2 * MARGIN,
    height: height + 2 * MARGIN,
  };
}

function point(x: number, y: number): string {
  return `${String(x)}px ${String(y)}px`;
}

/** The veil is the whole window minus a rectangle over the element (evenodd). */
export function veilHole({ left, top, width, height }: Rect): string {
  const x1 = Math.round(left - MARGIN);
  const y1 = Math.round(top - MARGIN);
  const x2 = Math.round(left + width + MARGIN);
  const y2 = Math.round(top + height + MARGIN);
  return `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${[
    point(x1, y1),
    point(x1, y2),
    point(x2, y2),
    point(x2, y1),
    point(x1, y1),
  ].join(", ")})`;
}

function sideFor(rect: Rect, tip: Size, view: Size): Side {
  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;
  if (right + GAP + tip.width <= view.width - EDGE) return "right";
  if (rect.left - GAP - tip.width >= EDGE) return "left";
  if (bottom + GAP + tip.height <= view.height - EDGE) return "bottom";
  return "top";
}

function between(low: number, high: number, value: number): number {
  return Math.max(low, Math.min(high, value));
}

function arrowFor(side: Side, rect: Rect, tip: Size, at: { top: number; left: number }) {
  const x = rect.left + rect.width / 2 - at.left;
  const y = rect.top + rect.height / 2 - at.top;
  const alongY = between(ARROW_FROM_CORNER, tip.height - ARROW_LAST, y - ARROW_HALF);
  const alongX = between(ARROW_FROM_CORNER, tip.width - ARROW_LAST, x - ARROW_HALF);
  switch (side) {
    case "right":
      return { left: -ARROW_HALF, top: alongY };
    case "left":
      return { right: -ARROW_HALF, top: alongY };
    case "bottom":
      return { top: -ARROW_HALF, left: alongX };
    default:
      return { bottom: -ARROW_HALF, left: alongX };
  }
}

/**
 * Right if it fits, else left, else below, else above. Beside the element it is centred on it and
 * kept inside the window; above or below, centred on it and kept inside the window from the sides.
 */
export function tipPlace(rect: Rect, tip: Size, view: Size): TipPlace {
  const side = sideFor(rect, tip, view);
  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;
  let top: number;
  let left: number;
  if (side === "right" || side === "left") {
    left = side === "right" ? right + GAP : rect.left - GAP - tip.width;
    top = between(
      EDGE,
      view.height - tip.height - EDGE,
      rect.top + rect.height / 2 - tip.height / 2,
    );
  } else {
    top = side === "bottom" ? bottom + GAP : rect.top - GAP - tip.height;
    left = between(EDGE, view.width - tip.width - EDGE, rect.left + rect.width / 2 - tip.width / 2);
  }
  return { side, top, left, arrow: arrowFor(side, rect, tip, { top, left }) };
}
