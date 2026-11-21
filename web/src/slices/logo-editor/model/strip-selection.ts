// What is done to the selection of a strip, with no screen. Each thing returns the new state.
import { STRIP_MAX } from "./strip-layout.ts";
import type { StripPick } from "./strip-types.ts";

const SMALLEST = 0.4;
const BIGGEST = 2.5;
const SMALLEST_ALL = 0.6;
const BIGGEST_ALL = 1.5;

export interface StripChoice {
  readonly selection: readonly StripPick[];
  /** The logo marked on the preview; -1 with none. */
  readonly marked: number;
  /** Those chosen with Shift, when they are more than one. */
  readonly group: readonly number[];
  readonly sizeOfAll: number;
}

function hundredths(value: number): number {
  return Math.round(value * 100) / 100;
}

function clampSize(size: number): number {
  return Math.max(SMALLEST, Math.min(BIGGEST, hundredths(size)));
}

/** What is chosen on the preview: with Shift, several; if not, the one marked. */
export function chosenOf({
  selection,
  marked,
  group,
}: Pick<StripChoice, "selection" | "marked" | "group">): number[] {
  const inGroup = group.filter((index) => index >= 0 && index < selection.length);
  if (inGroup.length > 1) return [...inGroup];
  return marked >= 0 && marked < selection.length ? [marked] : [];
}

export function indexOfLogo(selection: readonly StripPick[], logo: string): number {
  return selection.findIndex(({ img }) => img === logo);
}

export function isFull(selection: readonly StripPick[]): boolean {
  return selection.length >= STRIP_MAX;
}

function mapChosen(
  choice: StripChoice,
  change: (pick: StripPick, index: number) => StripPick,
): readonly StripPick[] {
  const chosen = new Set(chosenOf(choice));
  return choice.selection.map((pick, index) => (chosen.has(index) ? change(pick, index) : pick));
}

/** Takes a brand of the list out: the one marked stays the same logo. */
export function withoutAt(choice: StripChoice, index: number): StripChoice {
  const { marked } = choice;
  let next = marked;
  if (marked === index) next = -1;
  else if (marked > index) next = marked - 1;
  return { ...choice, selection: choice.selection.toSpliced(index, 1), group: [], marked: next };
}

/** The arrows of a row: the one that moved stays marked, so that it can be seen where it went. */
export function movedBy(choice: StripChoice, index: number, by: -1 | 1): StripChoice {
  const { selection } = choice;
  const [moving, other] = [selection[index], selection[index + by]];
  if (!moving || !other) return { ...choice, group: [] };
  const swapped = selection.with(index, other).with(index + by, moving);
  return { ...choice, selection: swapped, group: [], marked: index + by };
}

/** The × of a row: the logo marked stays marked where it is now. */
export function removedAt(choice: StripChoice, index: number): StripChoice {
  const { selection, marked } = choice;
  const current = selection[marked];
  const left = selection.toSpliced(index, 1);
  return { ...choice, selection: left, group: [], marked: current ? left.indexOf(current) : -1 };
}

/** The row goes before the one in that position; it stays marked. */
export function droppedAt(choice: StripChoice, from: number, to: number): StripChoice {
  const { selection } = choice;
  const moving = selection[from];
  if (!moving || to === from || to === from + 1) return choice;
  const target = to > from ? to - 1 : to;
  const moved = selection.toSpliced(from, 1).toSpliced(target, 0, moving);
  return { ...choice, selection: moved, marked: target, group: [] };
}

/** Shift adds it to those chosen, or takes it out. */
export function toggledInGroup(choice: StripChoice, index: number): StripChoice {
  const chosen = chosenOf(choice);
  const group = chosen.includes(index)
    ? chosen.filter((other) => other !== index)
    : [...chosen, index];
  return { ...choice, group, marked: group.at(-1) ?? -1 };
}

/** A row touched marks its logo; touched again, it lets it go. */
export function rowTouched(choice: StripChoice, index: number): StripChoice {
  return { ...choice, group: [], marked: choice.marked === index ? -1 : index };
}

/** On the preview: what is chosen moves together. */
export function movedAll(
  choice: StripChoice,
  from: readonly { readonly index: number; readonly dx: number; readonly dy: number }[],
  byX: number,
  byY: number,
): StripChoice {
  const selection = from.reduce<readonly StripPick[]>((picks, { index, dx, dy }) => {
    const pick = picks[index];
    return pick
      ? picks.with(index, { ...pick, dx: Math.round(dx + byX), dy: Math.round(dy + byY) })
      : picks;
  }, choice.selection);
  return { ...choice, selection };
}

/** The slider of the marked one, in percent: the others chosen go in the same proportion. */
export function sizedChosen(choice: StripChoice, percent: number): StripChoice {
  const main = choice.selection[choice.marked];
  if (!main) return choice;
  const size = (percent || 100) / 100;
  const factor = size / (main.k ?? 1);
  const selection = mapChosen(choice, (pick, index) => ({
    ...pick,
    k: index === choice.marked ? size : clampSize((pick.k ?? 1) * factor),
  }));
  return { ...choice, selection };
}

/** The buttons and the keys: what is chosen; with nothing chosen, the size of all. */
export function grown(choice: StripChoice, step: number): StripChoice {
  if (chosenOf(choice).length > 0) {
    const selection = mapChosen(choice, (pick) => ({
      ...pick,
      k: clampSize((pick.k ?? 1) + step),
    }));
    return { ...choice, selection };
  }
  const size = hundredths(choice.sizeOfAll + step / 2);
  return { ...choice, sizeOfAll: Math.max(SMALLEST_ALL, Math.min(BIGGEST_ALL, size)) };
}

/** "Volver a su lugar": where it was given, and with its size. */
export function backToPlace(choice: StripChoice): StripChoice {
  const selection = mapChosen(choice, (pick) => ({ ...pick, dx: 0, dy: 0, k: 1 }));
  return { ...choice, selection };
}

/** What "Sugerir marcas" brought, up to the places the strip has and with no brand twice. */
export function withSuggested(
  selection: readonly StripPick[],
  brought: readonly (Pick<StripPick, "img" | "t"> | null)[],
  limit: number,
): { readonly selection: readonly StripPick[]; readonly added: number } {
  const picks = [...selection];
  for (const pick of brought) {
    if (pick && picks.length < limit && indexOfLogo(picks, pick.img) < 0) {
      picks.push({ ...pick, sug: true });
    }
  }
  return { selection: picks, added: picks.length - selection.length };
}

export function withoutSuggested(choice: StripChoice): StripChoice {
  return {
    ...choice,
    selection: choice.selection.filter(({ sug }) => !sug),
    marked: -1,
    group: [],
  };
}
