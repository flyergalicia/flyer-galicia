// Deshacer and Rehacer: each step is a copy of the list. No step is marked by hand: the list is
// compared with the current step a moment after the last touch, so a drag or a run of + are one step,
// and the name of a step comes out of comparing the two copies. Its key is the picture.
import type { Cut } from "@/shared/flyer-engine/index.ts";
import type { PlacedChange } from "./change.ts";

const MAX_STEPS = 60;

export interface HistoryStep {
  /** The copy: logos and cuts, as JSON. */
  readonly list: string;
  readonly label: string;
}

export interface LogoHistory {
  readonly steps: readonly HistoryStep[];
  readonly index: number;
  readonly art: string;
}

export function emptyPhoto(): string {
  return JSON.stringify({ L: [], R: [] });
}

/** Each step has the logos and the cuts: Deshacer also undoes a crop. */
export function photoOf(list: readonly PlacedChange[], cuts: readonly Cut[] = []): string {
  return JSON.stringify({ L: list, R: cuts });
}

export function listIn(photo: string): readonly PlacedChange[] {
  const read: unknown = JSON.parse(photo);
  if (typeof read !== "object" || read === null || !("L" in read) || !Array.isArray(read.L)) {
    return [];
  }
  return read.L;
}

export function cutsIn(photo: string): readonly Cut[] {
  const read: unknown = JSON.parse(photo);
  if (typeof read !== "object" || read === null || !("R" in read) || !Array.isArray(read.R)) {
    return [];
  }
  return read.R;
}

export function startHistory(photo: string, art: string): LogoHistory {
  return { steps: [{ list: photo, label: "" }], index: 0, art };
}

function nameOf(change: PlacedChange): string {
  if (change.tipo === "txt") return `el texto «${change.t}»`;
  return change.t && change.t !== "Logo del flyer" ? change.t : "el logo";
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

function isSameLook(one: PlacedChange, other: PlacedChange): boolean {
  return (
    one.img === other.img &&
    one.tipo === other.tipo &&
    one.texto === other.texto &&
    one.color === other.color &&
    one.peso === other.peso
  );
}

function labelOfNew(change: PlacedChange): string {
  if (change.dup) return `Duplicar ${nameOf(change)}`;
  if (change.tipo === "txt" || change.img) return `Poner ${nameOf(change)}`;
  return "Dejar un lugar vacío";
}

function hasNewSize(one: PlacedChange, other: PlacedChange): boolean {
  return one.tw !== other.tw || one.th !== other.th || one.fs !== other.fs;
}

function labelOfOne(before: PlacedChange | undefined, after: PlacedChange): string {
  if (after.franjaBase) return "Armar franja";
  if (!before) return labelOfNew(after);
  if (!isSameLook(before, after)) {
    if (after.tipo === "txt") return `Cambiar ${nameOf(after)}`;
    return after.img ? `Cambiar ${nameOf(before)} por ${nameOf(after)}` : "Dejar vacío";
  }
  return `${hasNewSize(before, after) ? "Tamaño de" : "Mover"} ${nameOf(after)}`;
}

function ofStrips(list: readonly PlacedChange[]): string {
  return json(list.filter(({ franja }) => franja));
}

function basesOf(list: readonly PlacedChange[]): readonly PlacedChange[] {
  return list.filter(({ franjaBase }) => franjaBase);
}

function stripLabel(
  before: readonly PlacedChange[],
  after: readonly PlacedChange[],
): string | null {
  if (ofStrips(before) === ofStrips(after)) return null;
  if (basesOf(after).length < basesOf(before).length) return "Volver la franja al original";
  const logos = after.filter(({ franja, franjaBase }) => franja && !franjaBase).length;
  return `Armar franja (${logos}${logos === 1 ? " logo)" : " logos)"}`;
}

function labelOfRemoved(before: readonly PlacedChange[], after: readonly PlacedChange[]): string {
  const left = new Set(after.map(json));
  const gone = before.find((entry) => !left.has(json(entry)));
  return gone ? `Volver ${nameOf(gone)} al original` : "Volver un cambio al original";
}

function changedIndexes(before: readonly PlacedChange[], after: readonly PlacedChange[]): number[] {
  const changed: number[] = [];
  const length = Math.max(before.length, after.length);
  for (let index = 0; index < length; index += 1) {
    if (json(before[index]) !== json(after[index])) changed.push(index);
  }
  return changed;
}

function labelOfSeveral(
  before: readonly PlacedChange[],
  after: readonly PlacedChange[],
  changed: readonly number[],
): string {
  const added = after.slice(before.length);
  if (added.length > 0 && added.every(({ dup }) => dup)) return `Duplicar ${added.length}`;
  if (before.length === after.length) {
    const pairs = changed.map((index) => [before[index], after[index]] as const);
    const sameThings = pairs.every(
      ([one, other]) =>
        one?.img === other?.img && one?.tipo === other?.tipo && one?.texto === other?.texto,
    );
    if (sameThings) {
      const resizedAny = pairs.some(([one, other]) => one && other && hasNewSize(one, other));
      return `${resizedAny ? "Tamaño de" : "Mover"} ${changed.length} logos`;
    }
  }
  return `${changed.length} cambios`;
}

/** What the step did, in the words of its button. */
export function stepLabel(before: readonly PlacedChange[], after: readonly PlacedChange[]): string {
  if (after.length === 0) return "Volver todo al original";
  const changed = changedIndexes(before, after);
  const [only = -1] = changed;
  const single = after[only];
  if (changed.length === 1 && after.length >= before.length && single) {
    return labelOfOne(before[only], single);
  }
  const strip = stripLabel(before, after);
  if (strip) return strip;
  if (after.length < before.length) return labelOfRemoved(before, after);
  return labelOfSeveral(before, after, changed);
}

function labelBetween(before: string, after: string): string {
  const [cutsBefore, cutsAfter] = [cutsIn(before), cutsIn(after)];
  if (json(cutsBefore) === json(cutsAfter)) return stepLabel(listIn(before), listIn(after));
  return cutsAfter.length > cutsBefore.length
    ? "Recortar una parte"
    : "Volver a como estaba (recorte)";
}

/** A step more if the list changed, and what could be redone goes away. */
export function noteStep(history: LogoHistory, photo: string, art: string): LogoHistory {
  // Another flyer: the base is the flyer as it comes.
  const base = history.art === art ? history : startHistory(emptyPhoto(), art);
  const current = base.steps[base.index];
  if (!current || current.list === photo) return base;
  const label = labelBetween(current.list, photo) || "el último cambio";
  const steps = [...base.steps.slice(0, base.index + 1), { list: photo, label }];
  const kept = steps.length > MAX_STEPS + 1 ? steps.slice(1) : steps;
  return { steps: kept, index: kept.length - 1, art };
}

export function canUndo({ index, art }: LogoHistory, current: string): boolean {
  return art === current && index > 0;
}

export function canRedo({ index, steps, art }: LogoHistory, current: string): boolean {
  return art === current && index < steps.length - 1;
}
