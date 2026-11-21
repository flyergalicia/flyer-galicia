// What is done to several changes at once. Each returns a new list: nothing is changed in place.
import {
  boxOf,
  clampPercent,
  isAdjustable,
  isText,
  percentOf,
  type PlacedChange,
} from "./change.ts";
import { measured } from "./text-measure.ts";

export type Alignment = "top" | "middle" | "bottom";

type List = readonly PlacedChange[];

function mapChosen(
  list: List,
  chosen: readonly number[],
  change: (entry: PlacedChange, index: number) => PlacedChange,
): List {
  const set = new Set(chosen);
  return list.map((entry, index) => (set.has(index) ? change(entry, index) : entry));
}

export function moved(list: List, chosen: readonly number[], dx: number, dy: number): List {
  return mapChosen(list, chosen, (entry) => {
    const { tx, ty } = boxOf(entry);
    return { ...entry, tx: tx + dx, ty: ty + dy };
  });
}

/** One logo resized: from its center, so it does not run away. */
function resized(entry: PlacedChange, percent: number): PlacedChange {
  const size = clampPercent(percent);
  if (isText(entry)) {
    return measured({ ...entry, fs: ((entry.bfs ?? 0) * size) / 100 });
  }
  const { tx, ty, tw, th } = boxOf(entry);
  const [cx, cy] = [tx + tw / 2, ty + th / 2];
  const [width, height] = [((entry.bw ?? 0) * size) / 100, ((entry.bh ?? 0) * size) / 100];
  return { ...entry, tw: width, th: height, tx: cx - width / 2, ty: cy - height / 2 };
}

/** The main one takes that size, and each of the others grows in the same proportion. */
export function resizedTo(list: List, chosen: readonly number[], main: number, percent: number) {
  const reference = list[main];
  if (!reference) return list;
  const size = clampPercent(percent);
  const factor = size / Math.max(1, percentOf(reference));
  return mapChosen(list, chosen, (entry, index) =>
    resized(entry, index === main ? size : percentOf(entry) * factor),
  );
}

/** In the middle of the place of the logo it replaces. */
export function centered(list: List, chosen: readonly number[]): List {
  return mapChosen(list, chosen, (entry) => {
    const { tw, th } = boxOf(entry);
    return {
      ...entry,
      tx: entry.ox + entry.ow / 2 - tw / 2,
      ty: entry.oy + entry.oh / 2 - th / 2,
    };
  });
}

function alignedTop(mode: Alignment, reference: PlacedChange, height: number): number {
  const { ty, th } = boxOf(reference);
  if (mode === "top") return ty;
  if (mode === "middle") return ty + th / 2 - height / 2;
  return ty + th - height;
}

export function aligned(list: List, chosen: readonly number[], main: number, mode: Alignment) {
  const reference = list[main];
  if (!reference || chosen.length < 2) return list;
  return mapChosen(list, chosen, (entry) => ({
    ...entry,
    ty: alignedTop(mode, reference, boxOf(entry).th),
  }));
}

/** The first and the last stay; those in the middle get the same space between one and the other. */
export function spread(list: List, chosen: readonly number[]): List {
  if (chosen.length < 3) return list;
  const middleOf = (index: number) => {
    const entry = list[index];
    if (!entry) return 0;
    const { tx, tw } = boxOf(entry);
    return tx + tw / 2;
  };
  const sorted = chosen.toSorted((one, other) => middleOf(one) - middleOf(other));
  const [first, last] = [list[sorted[0] ?? -1], list[sorted.at(-1) ?? -1]];
  if (!first || !last) return list;
  const widths = sorted.reduce((sum, index) => {
    const entry = list[index];
    return sum + (entry ? boxOf(entry).tw : 0);
  }, 0);
  const lastBox = boxOf(last);
  const start = boxOf(first).tx;
  const gap = (lastBox.tx + lastBox.tw - start - widths) / (sorted.length - 1);
  const positions = new Map<number, number>();
  let x = start;
  for (const index of sorted) {
    const entry = list[index];
    positions.set(index, x);
    x += (entry ? boxOf(entry).tw : 0) + gap;
  }
  return mapChosen(list, chosen, (entry, index) => ({ ...entry, tx: positions.get(index) ?? 0 }));
}

/** The same height as the main one. */
export function sameSize(list: List, chosen: readonly number[], main: number): List {
  const reference = list[main];
  if (!reference || chosen.length < 2) return list;
  const { th: height } = boxOf(reference);
  return mapChosen(list, chosen, (entry, index) => {
    const { th } = boxOf(entry);
    if (index === main || th <= 0) return entry;
    return resized(entry, (percentOf(entry) * height) / th);
  });
}

const NOT_COPIED = [
  "franja",
  "franjaBase",
  "franjaSel",
  "franjaCols",
  "franjaKt",
  "franjaInfo",
  "vacio",
] as const;

/** A copy covers nothing, and its place is where it falls: Centrar leaves it there. */
export function copyOf(entry: PlacedChange, offset: number): PlacedChange {
  const copy: PlacedChange = { ...entry };
  for (const key of NOT_COPIED) Reflect.deleteProperty(copy, key);
  const { tx, ty, tw, th } = boxOf(entry);
  const [x, y] = [tx + offset, ty + offset];
  return { ...copy, tx: x, ty: y, ox: x, oy: y, ow: tw, oh: th, x, y, w: 0, h: 0, dup: true };
}

/** Takes something out of the flyer: what covered something leaves its place empty and covered. */
export function deletedFrom(list: List, chosen: readonly number[]): List {
  const set = new Set(chosen);
  const result: PlacedChange[] = [];
  for (const [index, entry] of list.entries()) {
    if (!set.has(index) || entry.franjaBase) result.push(entry);
    else if (!(entry.dup || entry.franja || !(entry.w > 0 && entry.h > 0))) {
      const { x, y, w, h, bg, ox, oy, ow, oh } = entry;
      result.push({ x, y, w, h, bg, img: "", t: "", ox, oy, ow, oh });
    }
  }
  return result;
}

export function withoutChosen(list: List, chosen: readonly number[]): List {
  const set = new Set(chosen);
  return list.filter((_entry, index) => !set.has(index));
}

/** The changes chosen, those that can be moved. */
export function chosenIn(list: List, selected: number, group: readonly number[]): number[] {
  const inGroup = group.filter((index) => isAdjustable(list[index]));
  if (inGroup.length > 1) return inGroup;
  return selected >= 0 && isAdjustable(list[selected]) ? [selected] : [];
}
