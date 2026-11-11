// What a strip leaves on the flyer: it covers the whole strip and puts the logos. What was there
// before is replaced, and what belongs to ANOTHER strip is never touched.
import type { DrawnBox, PlacedChange } from "./change.ts";
import type { StripDay, StripDays } from "./strip-days.ts";
import { adjusted, fitLogo, type StripPlace, stripPlaces } from "./strip-layout.ts";
import type { StripInfo, StripPick, StripRect } from "./strip-types.ts";
import { measured } from "./text-measure.ts";

export interface BuiltStripInput {
  readonly id: string;
  readonly rect: StripRect;
  readonly info: StripInfo;
  readonly selection: readonly StripPick[];
  readonly perRow: number;
  readonly sizeOfAll: number;
  /** Width over height of each logo, in the order of the selection. */
  readonly aspects: readonly number[];
  readonly days: (places: readonly StripPlace[]) => StripDays;
}

function holds(rect: StripRect, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

function isReplaced(entry: PlacedChange, id: string, rect: StripRect): boolean {
  if (entry.franja) return entry.franja === id;
  if (holds(rect, entry.ox + entry.ow / 2, entry.oy + entry.oh / 2)) return true;
  const { tx, ty, tw, th } = entry;
  return (
    tx !== undefined &&
    ty !== undefined &&
    tw !== undefined &&
    th !== undefined &&
    !Number.isNaN(tx) &&
    holds(rect, tx + tw / 2, ty + th / 2)
  );
}

function coverOfStrip(input: BuiltStripInput): PlacedChange {
  const { id, rect, info, selection, perRow, sizeOfAll } = input;
  return {
    x: rect.x - 2,
    y: rect.y - 2,
    w: rect.w + 4,
    h: rect.h + 4,
    bg: info.bg,
    img: "",
    t: "Franja",
    ox: rect.x,
    oy: rect.y,
    ow: rect.w,
    oh: rect.h,
    franja: id,
    franjaBase: true,
    franjaSel: selection,
    franjaCols: perRow,
    franjaKt: sizeOfAll,
    franjaInfo: info,
  };
}

/** With no cover of its own: the one of the strip takes care of it. */
function logoOfStrip(input: BuiltStripInput, pick: StripPick, box: DrawnBox): PlacedChange {
  const { tx, ty, tw, th } = box;
  return {
    x: tx,
    y: ty,
    w: 0,
    h: 0,
    bg: input.info.bg,
    img: pick.img,
    t: pick.t,
    ox: tx,
    oy: ty,
    ow: tw,
    oh: th,
    tx,
    ty,
    tw,
    th,
    bw: tw,
    bh: th,
    franja: input.id,
  };
}

/** The days below, centered on the logo: they follow it if it was moved on the preview. */
function daysOfStrip(
  input: BuiltStripInput,
  day: StripDay,
  box: DrawnBox,
  { fontSize, color, weight }: StripDays,
): PlacedChange {
  const seed: PlacedChange = {
    tipo: "txt",
    texto: day.text,
    color,
    peso: weight,
    fs: fontSize,
    bfs: fontSize,
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    bg: input.info.bg,
    t: day.text.replaceAll("\n", " "),
    ox: 0,
    oy: 0,
    ow: 0,
    oh: 0,
    franja: input.id,
  };
  const center = box.tx + box.tw / 2;
  const { tw = 0, th = 0 } = measured(seed, { x: center, y: day.y });
  const [tx, ty] = [center - tw / 2, day.y - th / 2];
  return { ...seed, tx, ty, tw, th, ox: tx, oy: ty, ow: tw, oh: th };
}

export function builtStrip(list: readonly PlacedChange[], input: BuiltStripInput): PlacedChange[] {
  const { rect, id, selection, perRow, sizeOfAll, info, aspects } = input;
  const places = stripPlaces(rect, info, perRow, selection.length);
  const days = input.days(places);
  const result = list.filter((entry) => !isReplaced(entry, id, rect));
  result.push(coverOfStrip(input));
  for (const [index, pick] of selection.entries()) {
    const place = places[index];
    if (place) {
      const day = days.byIndex[index];
      const box = adjusted(pick, sizeOfAll, fitLogo(day?.logo ?? place, aspects[index] ?? 1));
      result.push(logoOfStrip(input, pick, box));
      if (day) result.push(daysOfStrip(input, day, box, days));
    }
  }
  return result;
}
