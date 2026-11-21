// What floats over the page (the menu of the name, the list of the magnifying glass, the saved
// advisors, the provinces, «Otros» of the bar of flyers) and has to close when something opens over
// everything: the search of screens closes them on opening, as `fgCmdK` does today. It is a closing on
// purpose: nothing changes in how each one closes by itself.
import { useEffect, useLayoutEffect, useRef } from "react";

const closers = new Set<() => void>();

/** Closes whatever floats now. */
export function closeFloating(): void {
  for (const close of closers) close();
}

/** While it is open, a floating list closes with the others: `close` is how it closes itself. */
export function useCloseWithFloating(close: () => void, isOpen = true): void {
  const latest = useRef(close);
  useLayoutEffect(() => {
    latest.current = close;
  });
  useEffect(() => {
    if (!isOpen) return undefined;
    const closer = () => {
      latest.current();
    };
    closers.add(closer);
    return () => {
      closers.delete(closer);
    };
  }, [isOpen]);
}
