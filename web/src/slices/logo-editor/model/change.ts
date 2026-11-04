// One change of Cambiar logos, as it is kept: these keys travel in `v.logos`, history and Estudio,
// so they stay in Spanish. What it covers is x, y, w, h; what it draws, tx, ty, tw, th; and the place
// it was given, ox, oy, ow, oh.
import type { LogoChange } from "@/shared/flyer-engine/index.ts";
import type { StripInfo, StripPick } from "./strip-types.ts";

export interface PlacedChange extends LogoChange {
  t: string;
  ox: number;
  oy: number;
  ow: number;
  oh: number;
  /** The size it got when it was put, for its percentage. */
  bw?: number;
  bh?: number;
  /** The same for a text. */
  bfs?: number;
  /** A copy made with Ctrl+V covers nothing. */
  dup?: boolean;
  /** The place had nothing under it. */
  vacio?: boolean;
  /** The strip it belongs to. */
  franja?: string;
  /** It is what covers the whole strip, and it keeps all that is needed to edit it again. */
  franjaBase?: boolean;
  franjaSel?: readonly StripPick[];
  franjaCols?: number;
  franjaKt?: number;
  franjaInfo?: StripInfo;
  /** The province it was saved with (Marcas guardadas). */
  prov?: string;
}

/** A place on the flyer: a logo found, or a box marked by hand. In pixels of the picture. */
export interface FlyerPlace {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly bg: string;
  readonly manual?: boolean;
  /** There is nothing to cover: a new thing is added. */
  readonly vacio?: boolean;
  /** The box passes over a drawing, which would be half covered. */
  readonly corta?: boolean;
  /** Opened on a change in particular: that one and no other that overlaps it. */
  readonly indice?: number;
  /** What was read around it, to see how much room a logo has. */
  readonly win?: InkWindow;
}

export interface InkWindow {
  readonly x0: number;
  readonly y0: number;
  readonly cw: number;
  readonly ch: number;
  readonly CS: number;
  readonly on: Uint8Array;
  readonly comp: Uint8Array;
}

export interface DrawnBox {
  readonly tx: number;
  readonly ty: number;
  readonly tw: number;
  readonly th: number;
}

const FROM_FLYER = "orig:";
const UPLOADED = "pc:";
const MIN_PERCENT = 30;
const MAX_PERCENT = 250;

export function isText(change: LogoChange | undefined): boolean {
  return change?.tipo === "txt";
}

/** What can be moved and resized: a logo or a text. A place left empty cannot. */
export function isAdjustable(change: LogoChange | undefined): change is PlacedChange {
  return Boolean(change && (change.tipo === "txt" || change.img));
}

export function isUploaded(key: string | undefined): boolean {
  return (key ?? "").startsWith(UPLOADED);
}

export function isFromFlyer(key: string | undefined): boolean {
  return (key ?? "").startsWith(FROM_FLYER);
}

export function fromFlyerKey({ x, y, w, h }: Pick<FlyerPlace, "x" | "y" | "w" | "h">): string {
  return `${FROM_FLYER}${x},${y},${w},${h}`;
}

/** A name for each box of the list: its place stays when it moves, and two copies there still differ. */
export function boxKeys(list: readonly PlacedChange[]): string[] {
  const seen = new Map<string, number>();
  return list.map((change) => {
    const place = `${change.ox},${change.oy},${change.ow},${change.oh}`;
    const repeated = seen.get(place) ?? 0;
    seen.set(place, repeated + 1);
    return `${place}#${repeated}`;
  });
}

export function boxOf({ tx = 0, ty = 0, tw = 0, th = 0 }: LogoChange): DrawnBox {
  return { tx, ty, tw, th };
}

export function clampPercent(percent: number): number {
  return Math.max(MIN_PERCENT, Math.min(MAX_PERCENT, Math.round(percent)));
}

export function percentOf(change: PlacedChange): number {
  const { fs = 0, bfs = 1, tw = 0, bw = 1 } = change;
  return Math.round(isText(change) ? (fs / bfs) * 100 : (tw / bw) * 100);
}

/** Covers a bit more than the place, and starts drawing nothing. */
export function coverOf(
  { x, y, w, h, bg }: FlyerPlace,
  image: string,
  title: string,
): PlacedChange {
  return {
    x: x - 4,
    y: y - 4,
    w: w + 8,
    h: h + 8,
    bg,
    img: image,
    t: title,
    ox: x,
    oy: y,
    ow: w,
    oh: h,
  };
}

/** The logo of the flyer itself, cut from the picture and now movable like any other. */
export function liftFromFlyer(place: FlyerPlace): PlacedChange {
  const { x, y, w, h } = place;
  return {
    ...coverOf(place, fromFlyerKey(place), "Logo del flyer"),
    tx: x,
    ty: y,
    tw: w,
    th: h,
    bw: w,
    bh: h,
  };
}

/** Is there a change at this point? The last one put wins. */
export function logoAt(list: readonly PlacedChange[], x: number, y: number): number {
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const change = list[index];
    if (isAdjustable(change)) {
      const { tx, ty, tw, th } = boxOf(change);
      if (x >= tx - 4 && x <= tx + tw + 4 && y >= ty - 4 && y <= ty + th + 4) return index;
    }
  }
  return -1;
}

function overlapsHalf(change: PlacedChange, place: FlyerPlace): boolean {
  const width = Math.min(change.ox + change.ow, place.x + place.w) - Math.max(change.ox, place.x);
  const height = Math.min(change.oy + change.oh, place.y + place.h) - Math.max(change.oy, place.y);
  if (width <= 0 || height <= 0) return false;
  return width * height > 0.5 * Math.min(change.ow * change.oh, place.w * place.h);
}

/** Does this place already have a change? It is compared against the place it was given. */
export function indexOfPlace(list: readonly PlacedChange[], place: FlyerPlace): number {
  const { indice } = place;
  if (indice !== undefined) {
    const chosen = list[indice];
    if (chosen && !chosen.franjaBase) return indice;
    if (indice === -1) return -1;
  }
  return list.findIndex((change) => !change.franjaBase && overlapsHalf(change, place));
}

/** The place of a strip already built covers what is printed under it. */
export function isUnderStrip(list: readonly PlacedChange[], place: FlyerPlace): boolean {
  const x = place.x + place.w / 2;
  const y = place.y + place.h / 2;
  return list.some(
    (change) =>
      change.franjaBase &&
      x >= change.x &&
      x <= change.x + change.w &&
      y >= change.y &&
      y <= change.y + change.h,
  );
}

/** Put in a list: a change that has a place replaces it. */
export function withChange(
  list: readonly PlacedChange[],
  index: number,
  change: PlacedChange,
): { readonly list: readonly PlacedChange[]; readonly index: number } {
  if (index >= 0) return { list: list.with(index, change), index };
  return { list: [...list, change], index: list.length };
}
