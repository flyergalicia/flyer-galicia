// Config → Flyer activates, deactivates or calibrates the flyer of an option: whoever has it in memory
// forgets it and, if it is on screen, brings it again (`_fgInvalidateOpt`). The panel does not know the
// editor, and the editor may not be on the page: the panel only says which option changed.
import { createContext, useContext } from "react";

export interface FlyerChanges {
  readonly announce: (option: number) => void;
  /** Hears every option that changes from now on; what it returns stops hearing. */
  readonly listen: (listener: (option: number) => void) => () => void;
}

export function createFlyerChanges(): FlyerChanges {
  const listeners = new Set<(option: number) => void>();
  return {
    announce: (option) => {
      for (const listener of listeners) listener(option);
    },
    listen: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const FlyerChangesContext = createContext<FlyerChanges | null>(null);

export function useFlyerChanges(): FlyerChanges {
  const changes = useContext(FlyerChangesContext);
  if (!changes) throw new Error("useFlyerChanges needs a FlyerChangesProvider above it");
  return changes;
}
