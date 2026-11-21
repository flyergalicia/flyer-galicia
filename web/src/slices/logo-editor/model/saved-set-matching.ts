// Where a saved set goes on the flyer of now. The "drawings" of the whole flyer are detected (logos,
// texts), and it looks for where the same GROUP of boxes appears: the strip with all its logos, the
// grid of supermarkets with its neighbors. A group is much easier to recognize than a logo alone.
import type { FlyerArt } from "@/shared/flyer-engine/index.ts";
import type { FlyerPlace } from "./change.ts";
import {
  backgroundOf,
  detectLogo,
  hasFailed,
  INK_TOLERANCE,
  LOGO_GAP,
  markedPlace,
  type Rgb,
} from "./flyer-pixels.ts";
import type { SavedGroup, SavedItem, SavedSetData, SavedStrip } from "./saved-set.ts";
import { boundsOf, groupsOf } from "./saved-set.ts";
import type { StripBox } from "./strip-types.ts";

const HALF = 2;
const TILE = 40;
const CELL = 2;
const SPECK = 10;
const WIDEST_SHARE = 0.8;
const TALLEST_SHARE = 0.25;
const GRID = 80;
const NEAR_TOLERANCE = 0.3;
const SMALLEST_TOLERANCE = 6;
const SIZE_MIN = 0.5;
const SIZE_MAX = 2;
const SEED_MIN = 0.6;
const SEED_MAX = 1.7;
const SHIFT_STEP = 4;
const SAME_DISTANCE = 2;
const SMALL_GROUP = 3;
const SHARE_TO_TRUST = 0.6;
const STAYED_NEAR = 160;
const LIKE_MIN = 0.6;
const LIKE_MAX = 1.6;
const LIKE_REACH = 0.4;
const UNIT_WIDTH = 1240;

/** Where a thing goes: a box for a strip, a place for the rest. */
export interface ItemPlace {
  /** Sure enough to put it without asking. */
  readonly ok: boolean;
  readonly rect?: StripBox;
  readonly det?: FlyerPlace;
}

function halfSize(art: FlyerArt): { canvas: HTMLCanvasElement; data: Uint8ClampedArray } | null {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(art.width / HALF));
  canvas.height = Math.max(1, Math.round(art.height / HALF));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(art, 0, 0, art.width, art.height, 0, 0, canvas.width, canvas.height);
  return { canvas, data: context.getImageData(0, 0, canvas.width, canvas.height).data };
}

function tileBackgrounds(data: Uint8ClampedArray, width: number, height: number): Rgb[] {
  const [columns, rows] = [Math.ceil(width / TILE), Math.ceil(height / TILE)];
  const backgrounds: Rgb[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const [x0, y0] = [column * TILE, row * TILE];
      const [x1, y1] = [Math.min(width, x0 + TILE), Math.min(height, y0 + TILE)];
      const tile = new Uint8ClampedArray((x1 - x0) * (y1 - y0) * 4);
      let out = 0;
      for (let y = y0; y < y1; y += 1) {
        const start = (y * width + x0) * 4;
        tile.set(data.subarray(start, start + (x1 - x0) * 4), out);
        out += (x1 - x0) * 4;
      }
      backgrounds.push(backgroundOf(tile));
    }
  }
  return backgrounds;
}

interface Cells {
  readonly on: Uint8Array;
  readonly width: number;
  readonly height: number;
}

function inkCells(data: Uint8ClampedArray, width: number, height: number): Cells {
  const backgrounds = tileBackgrounds(data, width, height);
  const columns = Math.ceil(width / TILE);
  const [cellW, cellH] = [Math.ceil(width / CELL), Math.ceil(height / CELL)];
  const on = new Uint8Array(cellW * cellH);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const [r, g, b] = backgrounds[Math.trunc(y / TILE) * columns + Math.trunc(x / TILE)] ?? [
        255, 255, 255,
      ];
      const distance = Math.max(
        Math.abs((data[offset] ?? 0) - r),
        Math.abs((data[offset + 1] ?? 0) - g),
        Math.abs((data[offset + 2] ?? 0) - b),
      );
      if (distance > INK_TOLERANCE) on[Math.trunc(y / CELL) * cellW + Math.trunc(x / CELL)] = 1;
    }
  }
  return { on, width: cellW, height: cellH };
}

function growBox({ on, width, height }: Cells, seen: Uint8Array, seed: number, reach: number) {
  const pending = [seed];
  seen[seed] = 1;
  let [x0, y0, x1, y1] = [width, height, -1, -1];
  while (pending.length > 0) {
    const cell = pending.pop() ?? 0;
    const [cx, cy] = [cell % width, Math.trunc(cell / width)];
    [x0, x1] = [Math.min(x0, cx), Math.max(x1, cx)];
    [y0, y1] = [Math.min(y0, cy), Math.max(y1, cy)];
    for (let ny = Math.max(0, cy - reach); ny <= Math.min(height - 1, cy + reach); ny += 1) {
      for (let nx = Math.max(0, cx - reach); nx <= Math.min(width - 1, cx + reach); nx += 1) {
        const next = ny * width + nx;
        if (on[next] && !seen[next]) {
          seen[next] = 1;
          pending.push(next);
        }
      }
    }
  }
  return { x0, y0, x1, y1 };
}

/** The drawings of the flyer. It goes at half size, with the background of each piece of it. */
export function drawingsOf(art: FlyerArt): StripBox[] {
  const half = art.width > 0 ? halfSize(art) : null;
  if (!half) return [];
  const { canvas, data } = half;
  const cells = inkCells(data, canvas.width, canvas.height);
  const reach = Math.max(1, Math.ceil(LOGO_GAP / HALF / CELL));
  const seen = new Uint8Array(cells.on.length);
  const found: StripBox[] = [];
  for (let seed = 0; seed < cells.on.length; seed += 1) {
    if (cells.on[seed] && !seen[seed]) {
      const { x0, y0, x1, y1 } = growBox(cells, seen, seed, reach);
      const w = (x1 - x0 + 1) * CELL * HALF;
      const h = (y1 - y0 + 1) * CELL * HALF;
      const isDrawing =
        (w >= SPECK || h >= SPECK) &&
        w <= art.width * WIDEST_SHARE &&
        h <= art.height * TALLEST_SHARE;
      if (isDrawing) found.push({ x: x0 * CELL * HALF, y: y0 * CELL * HALF, w, h });
    }
  }
  return found;
}

const drawingsKnown = new WeakMap<object, StripBox[]>();

/** Once per picture: it takes about 130 ms. */
export function drawingsOnce(art: FlyerArt): StripBox[] {
  const known = drawingsKnown.get(art);
  if (known) return known;
  const found = drawingsOf(art);
  drawingsKnown.set(art, found);
  return found;
}

export interface GroupMatch {
  readonly n: number;
  readonly err: number;
  readonly far: number;
  readonly dx: number;
  readonly dy: number;
  readonly total: number;
}

function gridOf(boxes: readonly StripBox[]): Map<string, StripBox[]> {
  const grid = new Map<string, StripBox[]>();
  for (const box of boxes) {
    const key = `${String(Math.floor((box.x + box.w / 2) / GRID))},${String(Math.floor((box.y + box.h / 2) / GRID))}`;
    grid.set(key, [...(grid.get(key) ?? []), box]);
  }
  return grid;
}

function ratioFits(found: StripBox, wanted: StripBox, low: number, high: number): boolean {
  const [rw, rh] = [found.w / Math.max(1, wanted.w), found.h / Math.max(1, wanted.h)];
  return rw >= low && rw <= high && rh >= low && rh <= high;
}

function nearestIn(grid: Map<string, StripBox[]>, cx: number, cy: number, wanted: StripBox) {
  const tolerance = Math.max(SMALLEST_TOLERANCE, Math.min(wanted.w, wanted.h) * NEAR_TOLERANCE);
  const [gx, gy] = [Math.floor(cx / GRID), Math.floor(cy / GRID)];
  let best: { box: StripBox; distance: number } | null = null;
  for (let a = gx - 1; a <= gx + 1; a += 1) {
    for (let b = gy - 1; b <= gy + 1; b += 1) {
      for (const box of grid.get(`${String(a)},${String(b)}`) ?? []) {
        const [dx, dy] = [Math.abs(box.x + box.w / 2 - cx), Math.abs(box.y + box.h / 2 - cy)];
        const fits =
          dx <= tolerance && dy <= tolerance && ratioFits(box, wanted, SIZE_MIN, SIZE_MAX);
        if (fits && (!best || dx + dy < best.distance)) best = { box, distance: dx + dy };
      }
    }
  }
  return best;
}

function scored(
  saved: readonly StripBox[],
  grid: Map<string, StripBox[]>,
  dx: number,
  dy: number,
): Pick<GroupMatch, "n" | "err" | "dx" | "dy"> {
  let [n, err, sumX, sumY] = [0, 0, 0, 0];
  for (const box of saved) {
    const [cx, cy] = [box.x + box.w / 2, box.y + box.h / 2];
    const hit = nearestIn(grid, cx + dx, cy + dy, box);
    if (hit) {
      n += 1;
      err += hit.distance;
      sumX += hit.box.x + hit.box.w / 2 - cx;
      sumY += hit.box.y + hit.box.h / 2 - cy;
    }
  }
  return { n, err, dx: n ? sumX / n : dx, dy: n ? sumY / n : dy };
}

function beats(found: Omit<GroupMatch, "total">, best: Omit<GroupMatch, "total"> | null): boolean {
  if (!best || found.n > best.n) return true;
  if (found.n < best.n) return false;
  if (found.far < best.far - SAME_DISTANCE) return true;
  return Math.abs(found.far - best.far) <= SAME_DISTANCE && found.err < best.err;
}

/**
 * Where does the group of boxes appear on the flyer of now? Each pair of a similar size proposes a
 * shift: the one that makes the most boxes coincide wins and, among those, the one that stays closest,
 * or the one that leaves the group over the point touched.
 */
export function matchGroup(
  saved: readonly StripBox[],
  drawings: readonly StripBox[],
  touched: { readonly x: number; readonly y: number } | null = null,
): GroupMatch | null {
  const bounds = boundsOf(saved);
  if (!bounds || drawings.length === 0) return null;
  const grid = gridOf(drawings);
  const tried = new Set<string>();
  let best: Omit<GroupMatch, "total"> | null = null;
  for (const box of saved) {
    for (const drawing of drawings) {
      if (ratioFits(drawing, box, SEED_MIN, SEED_MAX)) {
        const dx = drawing.x + drawing.w / 2 - (box.x + box.w / 2);
        const dy = drawing.y + drawing.h / 2 - (box.y + box.h / 2);
        const key = `${String(Math.round(dx / SHIFT_STEP))},${String(Math.round(dy / SHIFT_STEP))}`;
        const isOver =
          !touched ||
          (touched.x >= bounds.x + dx &&
            touched.x <= bounds.x + bounds.w + dx &&
            touched.y >= bounds.y + dy &&
            touched.y <= bounds.y + bounds.h + dy);
        if (!tried.has(key) && isOver) {
          tried.add(key);
          const found = { ...scored(saved, grid, dx, dy), far: Math.abs(dx) + Math.abs(dy) };
          if (beats(found, best)) best = found;
        }
      }
    }
  }
  return best && { ...best, total: saved.length };
}

/** Is the coincidence enough? With small groups, it must also have stayed near where it was. */
export function isTrustworthy(match: GroupMatch | null, unit: number): boolean {
  if (!match?.total) return false;
  if (match.total >= SMALL_GROUP) {
    return match.n >= Math.max(SMALL_GROUP, Math.ceil(match.total * SHARE_TO_TRUST));
  }
  return match.n === match.total && Math.abs(match.dx) + Math.abs(match.dy) < STAYED_NEAR * unit;
}

export function clipped(art: FlyerArt, { x, y, w, h }: StripBox): StripBox {
  const left = Math.max(0, Math.min(art.width - SPECK, x));
  const top = Math.max(0, Math.min(art.height - SPECK, y));
  return {
    x: left,
    y: top,
    w: Math.max(SPECK, Math.min(art.width - left, w)),
    h: Math.max(SPECK, Math.min(art.height - top, h)),
  };
}

function scaledBox(scale: number) {
  return ({ x, y, w, h }: StripBox): StripBox => ({
    x: x * scale,
    y: y * scale,
    w: w * scale,
    h: h * scale,
  });
}

interface LocatingContext {
  readonly art: FlyerArt;
  readonly scale: number;
  readonly drawings: readonly StripBox[];
}

function byHand(art: FlyerArt, wanted: StripBox): FlyerPlace {
  const box = clipped(art, wanted);
  return markedPlace(art, box.x, box.y, box.w, box.h) ?? { ...box, bg: "rgb(255,255,255)" };
}

function looksLike(found: StripBox, wanted: StripBox): boolean {
  const reach = Math.max(wanted.w, wanted.h) * LIKE_REACH;
  const [cx, cy] = [wanted.x + wanted.w / 2, wanted.y + wanted.h / 2];
  const [rw, rh] = [found.w / Math.max(1, wanted.w), found.h / Math.max(1, wanted.h)];
  return (
    rw > LIKE_MIN &&
    rw < LIKE_MAX &&
    rh > LIKE_MIN &&
    rh < LIKE_MAX &&
    Math.abs(found.x + found.w / 2 - cx) <= reach &&
    Math.abs(found.y + found.h / 2 - cy) <= reach
  );
}

/** A logo, an empty place or a text: its place moved with its group, stuck on what is there. */
function placeOfItem(
  item: Exclude<SavedItem, { tipo: "franja" }>,
  shift: { readonly dx: number; readonly dy: number; readonly groupOk: boolean },
  { art, scale, drawings }: LocatingContext,
): ItemPlace {
  const { lugar } = item;
  const wanted = scaledBox(scale)(lugar);
  const at = { ...wanted, x: wanted.x + shift.dx, y: wanted.y + shift.dy };
  if (item.tipo === "texto") {
    const det = byHand(art, at);
    return { ok: shift.groupOk, det: item.vacio ? { ...det, vacio: true } : det };
  }
  if (item.tipo === "logo" && item.dup) return { ok: true, det: byHand(art, at) };
  const [cx, cy] = [at.x + at.w / 2, at.y + at.h / 2];
  const nearest = drawings
    .filter((box) => looksLike(box, at))
    .toSorted(
      (one, other) =>
        Math.abs(one.x + one.w / 2 - cx) +
        Math.abs(one.y + one.h / 2 - cy) -
        (Math.abs(other.x + other.w / 2 - cx) + Math.abs(other.y + other.h / 2 - cy)),
    )[0];
  const points = nearest
    ? [
        [nearest.x + nearest.w / 2, nearest.y + nearest.h / 2],
        [cx, cy],
      ]
    : [[cx, cy]];
  for (const [px = 0, py = 0] of points) {
    const found = safeDetection(art, Math.round(px), Math.round(py));
    if (found && looksLike(found, at)) {
      return { ok: shift.groupOk || Math.abs(shift.dx) + Math.abs(shift.dy) < 1, det: found };
    }
  }
  return { ok: false, det: byHand(art, at) };
}

function safeDetection(art: FlyerArt, x: number, y: number): FlyerPlace | null {
  try {
    const found = detectLogo(art, x, y);
    return hasFailed(found) ? null : found;
  } catch {
    return null;
  }
}

function placeOfStrip(item: SavedStrip, { art, scale, drawings }: LocatingContext): ItemPlace {
  const scaleBox = scaledBox(scale);
  const rect = scaleBox(item.rect);
  const saved = (item.ctx.length > 0 ? item.ctx : item.cajas).map(scaleBox);
  const match = saved.length > 0 ? matchGroup(saved, drawings) : null;
  const moves = match && match.n >= 2;
  return {
    ok: isTrustworthy(match, unitOf(art)),
    rect: clipped(art, {
      x: rect.x + (moves ? match.dx : 0),
      y: rect.y + (moves ? match.dy : 0),
      w: rect.w,
      h: rect.h,
    }),
  };
}

function unitOf(art: FlyerArt): number {
  return Math.max(0.5, art.width / UNIT_WIDTH);
}

function placesOfGroup(
  { items, ctx }: SavedGroup,
  data: SavedSetData,
  context: LocatingContext,
): readonly (readonly [number, ItemPlace])[] {
  const members = items.flatMap((index) => {
    const item = data.items[index];
    return item && item.tipo !== "franja" ? [{ index, item }] : [];
  });
  const boxes = ctx && ctx.length > 0 ? ctx : members.map(({ item }) => item.lugar);
  const match = matchGroup(boxes.map(scaledBox(context.scale)), context.drawings);
  const groupOk = isTrustworthy(match, unitOf(context.art));
  const moves = match && (groupOk || match.n >= 2);
  const shift = { dx: moves ? match.dx : 0, dy: moves ? match.dy : 0, groupOk };
  return members.map(({ index, item }) => [index, placeOfItem(item, shift, context)]);
}

/** Where each thing of the set goes on this flyer. */
export function locateItems(
  data: SavedSetData,
  art: FlyerArt,
  drawings: readonly StripBox[],
): ItemPlace[] {
  const scale = art.width / Math.max(1, data.ancho || art.width);
  const context = { art, scale, drawings };
  const groups =
    data.grupos.length > 0
      ? data.grupos
      : groupsOf(data.items).map((items) => ({ items, ctx: null }));
  const inGroups = new Map(groups.flatMap((group) => placesOfGroup(group, data, context)));
  return data.items.map((item, index) => {
    if (item.tipo === "franja") return placeOfStrip(item, context);
    return inGroups.get(index) ?? placeOfItem(item, { dx: 0, dy: 0, groupOk: false }, context);
  });
}
