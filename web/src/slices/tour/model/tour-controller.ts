// How the tutorial moves from step to step (`_tourGo`): it prepares the screen and, when the element
// is in sight, shows the step. Today the screen changes at once; here it paints a moment later, so it
// waits for the element to be in sight and still for one frame (a menu that opens grows it), a little
// longer while the code of a screen is still coming; one that does not appear is taken off the list,
// as today. The step is changed after the click that asks for it: a menu that opens for the step
// would otherwise hear that same click as one outside it.
import {
  chapterIndex,
  type ChapterId,
  nextChapterIndex,
  nextIndex,
  type PlannedStep,
  previousIndex,
  type TourPlan,
  withoutStep,
} from "./plan.ts";
import type { TargetKey } from "./targets.ts";

/** How long an element may take to paint once its screen is there. */
export const STEP_WAIT_MS = 1500;
/** How long the code of a screen may take to come down. */
export const SCREEN_WAIT_MS = 15_000;

export interface TourView<Text> {
  readonly step: PlannedStep<Text>;
  readonly index: number;
  readonly total: number;
  readonly chapters: TourPlan<Text>["chapters"];
}

/** What it needs of an element of the page. */
export interface TourTarget {
  readonly getBoundingClientRect: () => {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
  };
  readonly scrollIntoView: (options: ScrollIntoViewOptions) => void;
}

export interface TourDeps<Text> {
  readonly plan: TourPlan<Text>;
  readonly prepare: (step: PlannedStep<Text>) => void;
  /** The element of a step, only if it is seen. */
  readonly find: (target: TargetKey) => TourTarget | null;
  /** The code of the screen on top is still coming down. */
  readonly screenLoading: () => boolean;
  readonly show: (view: TourView<Text>) => void;
  /** It ended by itself or by the person: everything goes back as it was. */
  readonly finish: () => void;
  readonly later: (run: () => void) => () => void;
  readonly nextFrame: (run: () => void) => () => void;
  readonly now: () => number;
}

export interface TourController {
  readonly start: () => void;
  readonly next: () => void;
  readonly previous: () => void;
  readonly skipChapter: () => void;
  readonly goToChapter: (chapter: ChapterId) => void;
  /** Leaves: the cross, Escape. */
  readonly close: () => void;
  /** It is gone without ending: what was pending stops. */
  readonly dispose: () => void;
}

/** Where an element is now: the same on two frames means it stopped moving. */
function placeOf(element: TourTarget): string {
  const { left, top, width, height } = element.getBoundingClientRect();
  return [left, top, width, height].join(",");
}

export function createTourController<Text>(deps: TourDeps<Text>): TourController {
  let steps = deps.plan.steps;
  let index = 0;
  let turn = 0;
  let cancel: (() => void) | null = null;
  let isOver = false;

  const stop = () => {
    cancel?.();
    cancel = null;
  };
  const finish = () => {
    if (isOver) return;
    isOver = true;
    stop();
    deps.finish();
  };

  const showStep = (step: PlannedStep<Text>, element: TourTarget) => {
    try {
      element.scrollIntoView({ block: "center", inline: "nearest" });
    } catch {
      // An element that cannot scroll is shown where it is.
    }
    deps.show({ step, index, total: steps.length, chapters: deps.plan.chapters });
  };

  function go(wanted: number): void {
    if (isOver) return;
    stop();
    turn += 1;
    const mine = turn;
    const step = steps[wanted];
    if (!step) {
      finish();
      return;
    }
    index = wanted;
    cancel = deps.later(() => {
      deps.prepare(step);
      const started = deps.now();
      let last: string | null = null;
      const look = () => {
        if (mine !== turn) return;
        const element = deps.find(step.target);
        const place = element ? placeOf(element) : null;
        const waited = deps.now() - started;
        const mayWait = waited < STEP_WAIT_MS || (deps.screenLoading() && waited < SCREEN_WAIT_MS);
        // Something that never stops moving is shown anyway when the wait is over.
        if (element && (place === last || !mayWait)) {
          cancel = null;
          showStep(step, element);
          return;
        }
        last = place;
        if (mayWait) {
          cancel = deps.nextFrame(look);
          return;
        }
        const left = withoutStep(steps, wanted);
        if (!left) {
          finish();
          return;
        }
        steps = left.steps;
        go(left.index);
      };
      cancel = deps.nextFrame(look);
    });
  }

  const goOrFinish = (wanted: number | null) => {
    if (wanted === null) finish();
    else go(wanted);
  };

  return {
    start: () => {
      go(0);
    },
    next: () => {
      goOrFinish(nextIndex(index, steps.length));
    },
    previous: () => {
      const wanted = previousIndex(index);
      if (wanted !== null) go(wanted);
    },
    skipChapter: () => {
      goOrFinish(nextChapterIndex(steps, index));
    },
    goToChapter: (chapter) => {
      const wanted = chapterIndex(steps, chapter);
      if (wanted !== null) go(wanted);
    },
    close: finish,
    dispose: () => {
      isOver = true;
      stop();
    },
  };
}
