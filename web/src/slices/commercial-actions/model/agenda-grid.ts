// The calendar by hours. The band goes from 8 to 18 and stretches by itself, so nothing is left out,
// and what overlaps is shared out in columns so that nothing covers anything else.
import { minutesOf } from "./formatting.ts";

export const HOUR_HEIGHT = 46;
const FIRST_HOUR = 8;
const LAST_HOUR = 18;
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 1440;
const HALF_HOUR = 30;
const HOURS_PER_DAY = 24;
const MIN_BLOCK_HEIGHT = 20;
const TWO_DIGITS = 2;
const LAST_MINUTE = 1439;

interface Timed {
  readonly hora_desde: string | null;
  readonly hora_hasta?: string | null;
}

function endOf(start: number, end: string | null | undefined): number {
  const minutes = minutesOf(end);
  return minutes === null || minutes <= start ? start + MINUTES_PER_HOUR : minutes;
}

export interface HourBand {
  readonly first: number;
  readonly last: number;
}

export function hourBand(items: readonly Timed[]): HourBand {
  let first = FIRST_HOUR;
  let last = LAST_HOUR;
  for (const { hora_desde: from, hora_hasta: to } of items) {
    const start = minutesOf(from);
    if (start !== null) {
      const end = Math.min(endOf(start, to), MINUTES_PER_DAY);
      first = Math.min(first, Math.floor(start / MINUTES_PER_HOUR));
      last = Math.max(last, Math.ceil(end / MINUTES_PER_HOUR));
    }
  }
  if (last <= first) last = first + 1;
  return { first: Math.max(0, first), last: Math.min(HOURS_PER_DAY, last) };
}

export interface PlacedBlock<Item> {
  readonly item: Item;
  readonly start: number;
  readonly end: number;
  readonly column: number;
  /** How many columns its group of overlaps has. */
  readonly columns: number;
}

type OpenBlock<Item> = Omit<PlacedBlock<Item>, "columns">;

/** The columns are counted by group of overlaps: an action alone takes the whole width. */
export function placedBlocks<Item extends Timed>(items: readonly Item[]): PlacedBlock<Item>[] {
  const timed = items.flatMap((item) => {
    const start = minutesOf(item.hora_desde);
    return start === null ? [] : [{ item, start, end: endOf(start, item.hora_hasta) }];
  });
  const sorted = timed.toSorted((a, b) => a.start - b.start || a.end - b.end);
  const placed: PlacedBlock<Item>[] = [];
  let group: OpenBlock<Item>[] = [];
  let ends: number[] = [];
  let groupEnd = 0;
  const close = () => {
    for (const block of group) placed.push({ ...block, columns: Math.max(1, ends.length) });
    group = [];
    ends = [];
  };
  for (const { item, start, end } of sorted) {
    if (group.length > 0 && start >= groupEnd) close();
    const taken = ends.findIndex((columnEnd) => !(columnEnd > start));
    const column = taken === -1 ? ends.length : taken;
    ends[column] = end;
    group.push({ item, start, end, column });
    groupEnd = group.length === 1 ? end : Math.max(groupEnd, end);
  }
  close();
  return placed;
}

export interface BlockFrame {
  readonly top: number;
  readonly height: number;
  readonly left: number;
  readonly width: number;
}

export function frameOf<Item>(block: PlacedBlock<Item>, firstHour: number): BlockFrame {
  const width = 100 / block.columns;
  return {
    top: ((block.start - firstHour * MINUTES_PER_HOUR) * HOUR_HEIGHT) / MINUTES_PER_HOUR,
    height: Math.max(
      MIN_BLOCK_HEIGHT,
      ((block.end - block.start) * HOUR_HEIGHT) / MINUTES_PER_HOUR,
    ),
    left: width * block.column,
    width,
  };
}

export function hourLabel(hour: number): string {
  return `${String(hour).padStart(TWO_DIGITS, "0")}:00`;
}

export function timeFromMinutes(minutes: number): string {
  const hours = String(Math.floor(minutes / MINUTES_PER_HOUR)).padStart(TWO_DIGITS, "0");
  const rest = String(minutes % MINUTES_PER_HOUR).padStart(TWO_DIGITS, "0");
  return `${hours}:${rest}`;
}

/** Where it was touched, rounded down to the half hour. */
export function minutesAtTouch(pixels: number, height: number, firstHour: number): number {
  const place = Math.max(0, Math.min(height - 1, pixels));
  const minutes =
    firstHour * MINUTES_PER_HOUR + Math.floor((place / HOUR_HEIGHT) * MINUTES_PER_HOUR);
  return Math.floor(minutes / HALF_HOUR) * HALF_HOUR;
}

/** An hour after that time, within the day. */
export function anHourLater(time: string): string {
  const start = minutesOf(time) ?? 0;
  return timeFromMinutes(Math.min(LAST_MINUTE, start + MINUTES_PER_HOUR));
}

export type TeamCell<Item> =
  | { readonly kind: "free"; readonly hour: number }
  | { readonly kind: "taken"; readonly item: Item; readonly span: number };

function occupying<Item extends Timed>(items: readonly Item[], hour: number): Item | null {
  const from = hour * MINUTES_PER_HOUR;
  const to = from + MINUTES_PER_HOUR;
  return (
    items.find(({ hora_desde: start, hora_hasta: end }) => {
      const begins = minutesOf(start);
      return begins !== null && begins < to && endOf(begins, end) > from;
    }) ?? null
  );
}

/** A row of the day of the team: hours in a row of the same thing are one place, with its name once. */
export function teamCells<Item extends Timed & { readonly id: string }>(
  items: readonly Item[],
  { first, last }: HourBand,
): TeamCell<Item>[] {
  const cells: TeamCell<Item>[] = [];
  for (let hour = first; hour < last; hour += 1) {
    const item = occupying(items, hour);
    const before = cells.at(-1);
    if (!item) cells.push({ kind: "free", hour });
    else if (before?.kind === "taken" && before.item.id === item.id) {
      cells[cells.length - 1] = { ...before, span: before.span + 1 };
    } else cells.push({ kind: "taken", item, span: 1 });
  }
  return cells;
}
