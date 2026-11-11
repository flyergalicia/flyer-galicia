// One strip being armed. It lives out of the state of React, like the canvas: a drag changes it on
// every move of the mouse. It outlives its window, which goes away while brands are chosen on
// Promociones at full screen.
import type { DrawnBox, PlacedChange } from "./change.ts";
import type { BrandFilters } from "./brand-filter.ts";
import {
  canGoBy,
  noteStripStep,
  photoOfStrip,
  photoRead,
  startStripHistory,
  type StripHistory,
} from "./strip-history.ts";
import { type StripChoice } from "./strip-selection.ts";
import type { StripInfo, StripPick, StripRect } from "./strip-types.ts";

const STEP_WAIT_MS = 450;

/** What is left chosen for a new strip when the flyer changed while choosing brands. */
export interface PendingStrip {
  readonly selection: readonly StripPick[];
  readonly perRow: number;
  readonly filters: BrandFilters;
}

export interface StripStart {
  readonly id: string;
  readonly rect: StripRect;
  readonly info: StripInfo;
  /** What covers the strip already built, when it is resumed. */
  readonly base: PlacedChange | null;
  /** The picture it is armed on. */
  readonly art: string;
  readonly selection: readonly StripPick[];
  readonly perRow: number;
  readonly sizeOfAll: number;
  /** The filters of its window; null to start from those of Promociones. */
  readonly filters: BrandFilters | null;
}

export interface StripSessionState extends StripChoice {
  readonly perRow: number;
  readonly history: StripHistory;
  readonly isPutting: boolean;
  readonly isLarge: boolean;
  /** One more every time a logo arrives: the preview draws it. */
  readonly logosArrived: number;
}

/** What the preview drew, in pixels of the flyer. */
export interface StripDrawing {
  readonly x0: number;
  readonly y0: number;
  readonly width: number;
  readonly boxes: readonly (DrawnBox | null)[];
}

const NO_DRAWING: StripDrawing = { x0: 0, y0: 0, width: 0, boxes: [] };

interface SessionPlace {
  readonly rect: StripRect;
  readonly info: StripInfo;
  readonly base: PlacedChange | null;
  /** The picture it is armed on. */
  readonly art: string;
  /** What the strip has today, when it is resumed. */
  readonly selection: readonly StripPick[];
}

export type StripSession = ReturnType<typeof createStripSession>;

/** A strip on a place. What was left chosen for a new strip, if there is anything, goes in it. */
export function stripSessionOn(place: SessionPlace, pending: PendingStrip | null): StripSession {
  const { rect, info, base, art, selection } = place;
  return createStripSession({
    id: base?.franja ?? `fr${String(Date.now())}`,
    rect,
    info,
    base,
    art,
    selection: pending?.selection ?? selection,
    perRow: pending?.perRow ?? base?.franjaCols ?? 0,
    sizeOfAll: base?.franjaKt ?? 1,
    filters: pending?.filters ?? null,
  });
}

export function createStripSession(start: StripStart) {
  const { id, rect, info, base, art } = start;
  let state: StripSessionState = {
    selection: start.selection,
    marked: -1,
    group: [],
    sizeOfAll: start.sizeOfAll,
    perRow: start.perRow,
    history: startStripHistory(
      photoOfStrip({
        selection: start.selection,
        perRow: start.perRow,
        sizeOfAll: start.sizeOfAll,
      }),
    ),
    isPutting: false,
    isLarge: false,
    logosArrived: 0,
  };
  let filters = start.filters;
  let isAlive = true;
  let hasComeBack = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let drawing = NO_DRAWING;
  const listeners = new Set<() => void>();

  const publish = () => {
    for (const listener of listeners) listener();
  };

  const noteNow = () => {
    clearTimeout(timer);
    timer = undefined;
    const photo = photoOfStrip(state);
    const history = noteStripStep(state.history, photo);
    if (history === state.history) return;
    state = { ...state, history };
    publish();
  };

  /** Two seconds of ticks are one step: it is written down a moment after the last touch. */
  const noteSoon = () => {
    clearTimeout(timer);
    timer = setTimeout(noteNow, STEP_WAIT_MS);
  };

  const set = (next: Partial<StripSessionState>) => {
    state = { ...state, ...next };
    noteSoon();
    publish();
  };

  const goBy = (by: -1 | 1) => {
    noteNow(); // What was just done and is not written down yet counts.
    const { history } = state;
    if (!canGoBy(history, by)) return;
    const index = history.index + by;
    const photo = history.steps[index] ?? "";
    state = {
      ...state,
      ...photoRead(photo),
      history: { ...history, index },
      marked: -1,
      group: [],
    };
    publish();
  };

  return {
    id,
    rect,
    info,
    base,
    art,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getState: () => state,
    isAlive: () => isAlive,
    /** It came back from choosing on Promociones: the window starts on the second step. */
    hasComeBack: () => hasComeBack,
    filters: () => filters,
    keepFilters: (kept: BrandFilters) => {
      filters = kept;
    },
    change: (make: (choice: StripSessionState) => StripChoice) => {
      set(make(state));
    },
    setPerRow: (perRow: number) => {
      set({ perRow });
    },
    setSizeOfAll: (percent: number) => {
      set({ sizeOfAll: (percent || 100) / 100 });
    },
    toggleLarge: () => {
      state = { ...state, isLarge: !state.isLarge };
      publish();
    },
    setPutting: (isPutting: boolean) => {
      state = { ...state, isPutting };
      publish();
    },
    /** Not a change of the selection: Deshacer does not count it. */
    logoArrived: () => {
      state = { ...state, logosArrived: state.logosArrived + 1 };
      publish();
    },
    undo: () => {
      goBy(-1);
    },
    redo: () => {
      goBy(1);
    },
    canUndo: () => canGoBy(state.history, -1),
    canRedo: () => canGoBy(state.history, 1),
    isSettled: () => timer === undefined,
    comeBack: (
      picked: readonly { readonly logo: string; readonly title: string }[],
      left: BrandFilters,
    ) => {
      filters = left;
      hasComeBack = true;
      set({
        selection: picked.map(
          ({ logo, title }) =>
            state.selection.find(({ img }) => img === logo) ?? { img: logo, t: title },
        ),
      });
    },
    noteDrawing: (drawn: StripDrawing) => {
      drawing = drawn;
    },
    drawing: () => drawing,
    close: () => {
      isAlive = false;
      clearTimeout(timer);
      timer = undefined;
    },
  };
}
