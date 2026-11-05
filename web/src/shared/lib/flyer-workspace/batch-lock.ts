// A batch is running, or waiting for its libraries: meanwhile nothing can take its rows away or change
// the flyer under it. Each one holds it while it runs, and whoever holds it lets go of it.

export interface BatchLock {
  readonly isRunning: () => boolean;
  readonly subscribe: (listener: () => void) => () => void;
  /** It gives what lets go of it: however many times it is called, it counts as once. */
  readonly hold: () => () => void;
}

export const BATCH_RUNNING_NOTICE = "Esperá a que termine de generar el ZIP.";

export function createBatchLock(): BatchLock {
  let holders = 0;
  const listeners = new Set<() => void>();
  const tell = () => {
    for (const listener of listeners) listener();
  };
  return {
    isRunning: () => holders > 0,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    hold: () => {
      holders += 1;
      tell();
      let held = true;
      return () => {
        if (!held) return;
        held = false;
        holders -= 1;
        tell();
      };
    },
  };
}
