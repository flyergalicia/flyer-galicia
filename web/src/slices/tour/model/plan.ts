// The chapters and steps of the tutorial, and how one moves along them (`_tourPlan`, `_tourNext`,
// `_tourPrev`, `_tourSaltarCap`, `_tourIrCap`). Pure: the screen decides what is shown.
import type { Prepare } from "./prepare.ts";
import type { TargetKey } from "./targets.ts";

export type ChapterId =
  | "flyer"
  | "masivo"
  | "historial"
  | "menu"
  | "hunter"
  | "promos"
  | "gestiones"
  | "opciones"
  | "rubros";

export interface TourStep<Text = unknown> {
  readonly title: string;
  readonly text: Text;
  readonly target: TargetKey;
  /** What leaves the screen ready for the element to be seen. */
  readonly prepare: Prepare;
  /** False: it does not apply to this profile. */
  readonly applies?: boolean;
}

export interface TourChapter<Text = unknown> {
  readonly id: ChapterId;
  readonly title: string;
  readonly applies?: boolean;
  readonly steps: readonly TourStep<Text>[];
}

export interface PlannedStep<Text = unknown> extends TourStep<Text> {
  readonly chapter: ChapterId;
}

export interface TourPlan<Text = unknown> {
  /** The chips on top: the chapters that have something to show. */
  readonly chapters: readonly Pick<TourChapter, "id" | "title">[];
  readonly steps: readonly PlannedStep<Text>[];
}

/** A flat list of what applies to the profile; a chapter left with nothing has no chip. */
export function planOf<Text>(chapters: readonly TourChapter<Text>[]): TourPlan<Text> {
  const applying = chapters.filter(({ applies }) => applies !== false);
  const steps = applying.flatMap(({ id, steps: own }) =>
    own
      .filter(({ applies }) => applies !== false)
      .map((step): PlannedStep<Text> => Object.assign({ chapter: id }, step)),
  );
  return {
    chapters: applying
      .filter(({ id }) => steps.some(({ chapter }) => chapter === id))
      .map(({ id, title }) => ({ id, title })),
    steps,
  };
}

/** Where "Siguiente" goes: null at the last step, which ends it. */
export function nextIndex(index: number, total: number): number | null {
  return index >= total - 1 ? null : index + 1;
}

/** Where "Anterior" goes: nowhere from the first step. */
export function previousIndex(index: number): number | null {
  return index <= 0 ? null : index - 1;
}

/** "Omitir capítulo": the first step of the next chapter; null after the last one, which ends it. */
export function nextChapterIndex(steps: readonly PlannedStep[], index: number): number | null {
  const chapter = steps[index]?.chapter;
  const found = steps.findIndex((step, position) => position > index && step.chapter !== chapter);
  return found === -1 ? null : found;
}

/** A chip: the first step of that chapter, if it still has one. */
export function chapterIndex(steps: readonly PlannedStep[], chapter: ChapterId): number | null {
  const found = steps.findIndex((step) => step.chapter === chapter);
  return found === -1 ? null : found;
}

/**
 * A step whose element is not seen after preparing the screen goes away, and the one that took its
 * place is shown (`_tourGo`). Null when nothing is left.
 */
export function withoutStep<Text>(
  steps: readonly PlannedStep<Text>[],
  index: number,
): { readonly steps: readonly PlannedStep<Text>[]; readonly index: number } | null {
  const left = steps.filter((_, position) => position !== index);
  if (left.length === 0) return null;
  return { steps: left, index: Math.min(index, left.length - 1) };
}
