// The small picture of a design or of a saved set: the piece of the flyer with the MOST changes, drawn,
// with the shape of the card of Estudio. A piece that takes them all in would be tall when they are far
// apart, and the card would show what is in the middle, which did not change.
import {
  type Cut,
  type FlyerArt,
  type LogoSource,
  paintLogoChanges,
} from "@/shared/flyer-engine/index.ts";
import type { PlacedChange } from "./change.ts";

const WIDTH = 520;
const HEIGHT = 200;

function centerOf({ ty, th = 0, y, h }: PlacedChange): number {
  return ty !== undefined && !Number.isNaN(ty) ? ty + th / 2 : y + h / 2;
}

function busiestRow(heights: readonly number[], tall: number): number {
  let [best, most] = [heights[0] ?? 0, 0];
  for (const candidate of heights) {
    const near = heights.filter((height) => Math.abs(height - candidate) <= tall / 2).length;
    if (near > most) [best, most] = [candidate, near];
  }
  return best;
}

export interface DesignThumbnailInput {
  readonly art: FlyerArt;
  readonly artKey: string;
  readonly list: readonly PlacedChange[];
  readonly cuts: readonly Cut[];
  readonly logos: LogoSource;
}

export function designThumbnail({ art, artKey, list, cuts, logos }: DesignThumbnailInput): string {
  if (list.length === 0 && cuts.length === 0) return "";
  const { width, height } = art;
  const tall = Math.round((width * HEIGHT) / WIDTH);
  // With only a crop, what is shown is the seam.
  const heights = list.length > 0 ? list.map(centerOf) : [cuts[0]?.y ?? 0];
  const best = busiestRow(heights, tall);
  const near = heights.filter((row) => Math.abs(row - best) <= tall / 2);
  const middle = (Math.min(...near) + Math.max(...near)) / 2;
  const top = Math.max(0, Math.min(height - tall, Math.round(middle - tall / 2)));
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) return "";
  const factor = WIDTH / width;
  context.scale(factor, factor);
  context.translate(0, -top);
  context.drawImage(art, 0, 0);
  paintLogoChanges(
    { ctx: context, scale: 1, art, artKey, cutAt: Number.POSITIVE_INFINITY, extra: 0 },
    list,
    logos,
  );
  try {
    return canvas.toDataURL("image/jpeg", 0.82);
  } catch {
    return "";
  }
}
