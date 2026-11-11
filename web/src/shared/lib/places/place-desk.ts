// How one gets to a place inside a screen or a window from outside it: Masivo of the flyer editor,
// Activas of Promociones, a view of Benchmark, a sheet of the panel. The search of screens asks, and
// the screen or the window takes it when it is on the page, now or when it arrives. A screen does not
// know who asks: `app` puts the desk around the shell.
import { createContext, useContext, useLayoutEffect, useRef } from "react";

/** Who holds places: each one answers for its own. */
export type PlaceHolder =
  | "flyer-editor"
  | "flyer-others"
  | "hunter-others"
  | "user-menu"
  | "promotions"
  | "commercial-actions"
  | "benchmark"
  | "admin"
  | "database";

/** How a menu that hangs from a button is left, asked from outside: the tutorial opens and closes them. */
export const MENU_OPEN = "open";
export const MENU_CLOSED = "closed";

/** What a window does before going elsewhere: asks about what would be lost, closes, and goes on. */
export type Leave = (then: () => void) => void;

export interface PlaceDesk {
  /** Asks for that place; the last one asked wins. */
  readonly ask: (holder: PlaceHolder, place: string) => void;
  /** What was asked for that holder and nobody took yet. */
  readonly take: (holder: PlaceHolder) => string | null;
  readonly subscribe: (listener: () => void) => () => void;
  /** Lets that window close as its own button does, then goes on; without the window, it goes on. */
  readonly leave: (holder: PlaceHolder, then: () => void) => void;
  /** A window says how it is left while it is open. */
  readonly onLeave: (holder: PlaceHolder, leave: Leave) => () => void;
}

export function createPlaceDesk(): PlaceDesk {
  const asked = new Map<PlaceHolder, string>();
  const leaving = new Map<PlaceHolder, Leave>();
  const listeners = new Set<() => void>();
  return {
    ask: (holder, place) => {
      asked.set(holder, place);
      for (const listener of listeners) listener();
    },
    take: (holder) => {
      const place = asked.get(holder) ?? null;
      asked.delete(holder);
      return place;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    leave: (holder, then) => {
      const leave = leaving.get(holder);
      if (leave) leave(then);
      else then();
    },
    onLeave: (holder, leave) => {
      leaving.set(holder, leave);
      return () => {
        if (leaving.get(holder) === leave) leaving.delete(holder);
      };
    },
  };
}

export const PlaceDeskContext = createContext<PlaceDesk | null>(null);

/** Null where nobody put the desk: a screen on its own, in a test. */
export function usePlaceDesk(): PlaceDesk | null {
  return useContext(PlaceDeskContext);
}

/**
 * A screen or a window says what it does with a place asked for it. What was asked before it arrived
 * is taken before the first paint: it does not show its first place and then jump.
 */
export function usePlaceRequests(holder: PlaceHolder, onPlace: (place: string) => void): void {
  const desk = usePlaceDesk();
  const latest = useRef(onPlace);
  useLayoutEffect(() => {
    latest.current = onPlace;
  });
  useLayoutEffect(() => {
    if (!desk) return undefined;
    const look = () => {
      const place = desk.take(holder);
      if (place !== null) latest.current(place);
    };
    look();
    return desk.subscribe(look);
  }, [desk, holder]);
}

/** A window says how it is left while it is open: with the same question its X asks. */
export function useLeaveRequests(holder: PlaceHolder, leave: Leave): void {
  const desk = usePlaceDesk();
  const latest = useRef(leave);
  useLayoutEffect(() => {
    latest.current = leave;
  });
  useLayoutEffect(() => {
    if (!desk) return undefined;
    const current: Leave = (then) => {
      latest.current(then);
    };
    return desk.onLeave(holder, current);
  }, [desk, holder]);
}
