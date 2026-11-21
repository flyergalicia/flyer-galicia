// What a cut does to the changes of the logos: y and h are pixels of the picture as the steps before
// left it, so what is below goes up or down with the flyer, and what falls inside goes away.
import type { Cut, FlyerArt } from "@/shared/flyer-engine/index.ts";
import type { PlacedChange } from "./change.ts";
import { pixelsOf } from "./flyer-pixels.ts";

const SEAM_REACH = 25;
const SEAM_STEP = 4;
const SEAM_SMALLEST_BAND = 10;
const PREFER_WHAT_WAS_MARKED = 0.02;
const SMALLEST_BAND = 12;
const LARGEST_SHARE = 0.6;

function isNumber(value: number | undefined): value is number {
  return value !== undefined && !Number.isNaN(value);
}

/** The height of its center, where it is drawn; if it draws nothing, of what it covers. */
function centerOf({ ty, th = 0, y, h }: PlacedChange): number {
  return isNumber(ty) ? ty + th / 2 : y + h / 2;
}

function shifted(change: PlacedChange, by: number): PlacedChange {
  return {
    ...change,
    y: change.y + by,
    oy: change.oy + by,
    ...(change.ty === undefined ? {} : { ty: change.ty + by }),
  };
}

/** A band goes away: what is inside goes with it, what is below goes up. */
export function listAfterTrim(
  list: readonly PlacedChange[],
  y: number,
  h: number,
): { readonly list: readonly PlacedChange[]; readonly lost: number } {
  const kept = list.filter((change) => {
    const center = centerOf(change);
    return center < y || center >= y + h;
  });
  return {
    list: kept.map((change) => (centerOf(change) >= y + h ? shifted(change, -h) : change)),
    lost: list.length - kept.length,
  };
}

/** A section goes in: what is below goes down. */
export function listAfterInsert(
  list: readonly PlacedChange[],
  y: number,
  h: number,
): readonly PlacedChange[] {
  return list.map((change) => (centerOf(change) >= y ? shifted(change, h) : change));
}

/** Back to the whole flyer: what was changed inside a section goes with it, the rest to its place. */
export function listOnWholeFlyer(
  list: readonly PlacedChange[],
  cuts: readonly Cut[],
): readonly PlacedChange[] {
  let result = list;
  for (const { y, h, ins } of cuts.toReversed()) {
    if (ins) result = result.filter((change) => !isInBand(change, y, h));
    const from = ins ? y + h : y;
    const by = ins ? -h : h;
    result = result.map((change) => (centerOf(change) >= from ? shifted(change, by) : change));
  }
  return result;
}

function isInBand(change: PlacedChange, y: number, h: number): boolean {
  const center = centerOf(change);
  return center >= y && center < y + h;
}

/** "Recortado: 1 parte · Insertado: 1 sección". */
export function cutsSign(cuts: readonly Cut[]): string {
  const inserted = cuts.filter(({ ins }) => ins).length;
  const trimmed = cuts.length - inserted;
  const parts = [
    trimmed ? `Recortado: ${String(trimmed)}${trimmed === 1 ? " parte" : " partes"}` : "",
    inserted ? `Insertado: ${String(inserted)}${inserted === 1 ? " sección" : " secciones"}` : "",
  ];
  return parts.filter(Boolean).join(" · ");
}

export type BandProblem = "officers" | "thin" | "large";

export const BAND_PROBLEM_TEXT: Readonly<Record<BandProblem, string>> = {
  officers: "Esa zona cae en el espacio de los oficiales. Marcá la parte un poco más arriba.",
  thin: "Esa parte es muy finita. Arrastrá de arriba hacia abajo sobre lo que querés quitar.",
  large: "Es demasiado para quitar de una vez. Marcá una parte más chica.",
};

/** What was dragged, in pixels of the picture; a problem if it cannot be taken out. */
export function bandProblem(top: number, bottom: number, height: number): BandProblem | null {
  if (bottom - top < SMALLEST_BAND) return "thin";
  return bottom - top > height * LARGEST_SHARE ? "large" : null;
}

function rowDistance(
  above: Uint8ClampedArray,
  aboveAt: number,
  below: Uint8ClampedArray,
  belowAt: number,
  width: number,
): number {
  let [total, samples] = [0, 0];
  for (let x = 0; x < width; x += SEAM_STEP) {
    const offset = x * 4;
    for (const channel of [0, 1, 2]) {
      total += Math.abs(
        (above[aboveAt + offset + channel] ?? 0) - (below[belowAt + offset + channel] ?? 0),
      );
    }
    samples += 1;
  }
  return total / samples;
}

/**
 * The edges go up to 25 pixels away, to the two rows that look the most alike: above and below the
 * cut they end up together, and the seam does not show.
 */
export function bestSeam(art: FlyerArt, top: number, bottom: number): Cut {
  const { width, height } = art;
  const [a0, a1] = [Math.max(1, top - SEAM_REACH), Math.min(height - 2, top + SEAM_REACH)];
  const [b0, b1] = [Math.max(1, bottom - SEAM_REACH), Math.min(height - 1, bottom + SEAM_REACH)];
  try {
    const above = pixelsOf(art, 0, a0 - 1, width, a1 - a0 + 2);
    const below = pixelsOf(art, 0, b0, width, b1 - b0 + 1);
    let best = { distance: Number.POSITIVE_INFINITY, y: top, h: bottom - top };
    for (let a = a0; a <= a1; a += 1) {
      for (let b = Math.max(b0, a + SEAM_SMALLEST_BAND); b <= b1; b += 1) {
        const distance =
          rowDistance(above, (a - a0) * width * 4, below, (b - b0) * width * 4, width) +
          Math.abs(b - a - (bottom - top)) * PREFER_WHAT_WAS_MARKED;
        if (distance < best.distance) best = { distance, y: a, h: b - a };
      }
    }
    return { y: best.y, h: best.h };
  } catch {
    return { y: top, h: bottom - top };
  }
}
