// The days of discount of the supermarkets in a strip. With the tick, the place of each supermarket
// with days is shared: the logo above and the days below. The letter is the same for the whole strip,
// the one that fits in the tightest place, so that they come out even.
import type { FlyerArt } from "@/shared/flyer-engine/index.ts";
import { STRIP_LINE_HEIGHT, type StripPlace } from "./strip-layout.ts";
import { unitOf } from "./supermarket-days.ts";
import type { StripInfo, StripPick } from "./strip-types.ts";
import { widthOfLines } from "./text-measure.ts";

const DAYS_WEIGHT = 500;
const DAYS_COLOR = "#1A1A1A";
const SHARE_OF_LOGO = 0.66;
const LOGO_GOES_UP = 0.17;
const DAYS_GO_DOWN = 0.33;
const ROOM_OF_TEXT = 0.96;
const FONT_OF_PRINTED_LINE = 0.75;
const FONT_OF_PLACE = 0.2;
const SMALLEST_FONT = 12;
const BIGGEST_FONT = 26;
const LAST_RESORT_FONT = 10;
const AIR_OF_LINE = 0.35;
const TWO_LINES_GO_UP = 0.3;

export interface StripDay {
  readonly text: string;
  /** Where the logo goes now. */
  readonly logo: StripPlace;
  /** The height of the center of the days. */
  readonly y: number;
}

export interface StripDays {
  readonly byIndex: readonly (StripDay | null)[];
  readonly fontSize: number;
  readonly color: string;
  readonly weight: number;
}

const NO_DAYS: StripDays = { byIndex: [], fontSize: 0, color: DAYS_COLOR, weight: DAYS_WEIGHT };

interface Writing {
  readonly text: string;
  readonly place: StripPlace;
}

function brokenInTwo(text: string, font: number, room: number): string {
  if (widthOfLines(text, DAYS_WEIGHT, font) <= room || text.indexOf(" y ") <= 0) return text;
  const at = text.lastIndexOf(" y ");
  return `${text.slice(0, at + 2)}\n${text.slice(at + 3)}`;
}

/** If some text does not fit across, it goes in two lines; if it still does not, smaller for all. */
function fitted(writings: readonly (Writing | null)[], start: number, unit: number) {
  let font = start;
  const texts = writings.map((writing) => {
    if (!writing) return null;
    const room = writing.place.w * ROOM_OF_TEXT;
    const text = brokenInTwo(writing.text, font, room);
    const wide = widthOfLines(text, DAYS_WEIGHT, font);
    if (wide > room) font = Math.max(LAST_RESORT_FONT * unit, (font * room) / wide);
    return text;
  });
  return { texts, fontSize: Math.round(font) };
}

function firstFont(info: StripInfo, places: readonly StripPlace[], unit: number): number {
  const wanted =
    info.conTexto && info.txtH
      ? info.txtH / FONT_OF_PRINTED_LINE
      : (places[0]?.h ?? 0) * FONT_OF_PLACE;
  return Math.max(SMALLEST_FONT * unit, Math.min(BIGGEST_FONT * unit, wanted));
}

/** A grid that had days: the logo stays on its place, and the days go under it. */
function dayIn(place: StripPlace, text: string, fontSize: number, hadText: boolean): StripDay {
  const lines = text.split("\n").length;
  const tall = lines * fontSize * STRIP_LINE_HEIGHT;
  if (hadText) {
    const y = place.cy + place.h / 2 + fontSize * AIR_OF_LINE + tall / 2;
    return { text, logo: place, y };
  }
  const usual = place.cy + place.h * DAYS_GO_DOWN;
  return {
    text,
    logo: { ...place, cy: place.cy - place.h * LOGO_GOES_UP, h: place.h * SHARE_OF_LOGO },
    y: lines > 1 ? usual - fontSize * STRIP_LINE_HEIGHT * TWO_LINES_GO_UP : usual,
  };
}

export interface StripDaysInput {
  readonly art: FlyerArt;
  readonly info: StripInfo;
  readonly selection: readonly StripPick[];
  readonly places: readonly StripPlace[];
  /** The tick of the window. */
  readonly withDays: boolean;
  /** What goes on the flyer for that logo; "" if it is not a supermarket with days. */
  readonly daysOf: (logo: string) => string;
}

export function stripDays(input: StripDaysInput): StripDays {
  const { art, info, selection, places, withDays, daysOf } = input;
  if (!withDays) return NO_DAYS;
  const writings = selection.map(({ img }, index) => {
    const [text, place] = [daysOf(img), places[index]];
    return text && place ? { text, place } : null;
  });
  if (!writings.some(Boolean)) return { ...NO_DAYS, byIndex: writings.map(() => null) };
  const unit = unitOf(art);
  const { texts, fontSize } = fitted(writings, firstFont(info, places, unit), unit);
  const byIndex = writings.map((writing, index) => {
    const text = texts[index];
    return writing && text ? dayIn(writing.place, text, fontSize, info.conTexto) : null;
  });
  return { ...NO_DAYS, byIndex, fontSize };
}
