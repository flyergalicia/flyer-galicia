import {
  type MouseEvent,
  type PointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/** How long an item has to be held for it to lift, so that a press is never a move by accident. */
export const HOLD_TO_LIFT_MS = 4000;
const MOVED_TOO_MUCH_PX = 8;
const CLICK_AFTER_DROP_MS = 500;

export type DropSide = "before" | "after";

export interface HoldReorderOptions {
  /** Whoever cannot move them holds them in vain. */
  readonly enabled: boolean;
  readonly container: RefObject<HTMLElement | null>;
  readonly itemSelector: string;
  readonly idOf: (item: HTMLElement) => string;
  readonly onLift: () => void;
  readonly onMove: (lifted: string, over: string, side: DropSide) => void;
  readonly onDrop: () => void;
}

export interface HoldReorder {
  readonly holdingId: string | null;
  readonly liftedId: string | null;
  readonly handlers: {
    readonly onPointerDown: (event: PointerEvent<HTMLElement>) => void;
    readonly onPointerMove: (event: PointerEvent<HTMLElement>) => void;
    readonly onPointerUp: () => void;
    readonly onPointerCancel: () => void;
    readonly onPointerLeave: () => void;
    readonly onContextMenu: (event: MouseEvent<HTMLElement>) => void;
    /** The click that ends a drag does not count as a press on what is under it. */
    readonly onClickCapture: (event: MouseEvent<HTMLElement>) => void;
  };
}

interface Press {
  readonly x: number;
  readonly y: number;
  readonly timer: ReturnType<typeof setTimeout>;
}

function itemUnder(
  items: readonly HTMLElement[],
  x: number,
): { readonly item: HTMLElement; readonly side: DropSide } | null {
  for (const item of items) {
    const box = item.getBoundingClientRect();
    if (x >= box.left && x <= box.right) {
      return { item, side: x < box.left + box.width / 2 ? "before" : "after" };
    }
  }
  return null;
}

function otherItems(
  container: HTMLElement,
  selector: string,
  lifted: string,
  idOf: (item: HTMLElement) => string,
) {
  // One that cannot be seen has no width, and the pointer never falls on it.
  return [...container.querySelectorAll<HTMLElement>(selector)].filter(
    (item) => idOf(item) !== lifted && item.offsetWidth > 0,
  );
}

function capturePointer(element: HTMLElement | null, pointerId: number): void {
  try {
    element?.setPointerCapture(pointerId);
  } catch {
    // The pointer is gone by now: the item stays lifted until it is released.
  }
}

/** Hold an item, then drag it: the order lives in whoever uses this. */
export function useHoldReorder(options: HoldReorderOptions): HoldReorder {
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  const press = useRef<Press | null>(null);
  const lifted = useRef<string | null>(null);
  const droppedAt = useRef(0);
  const [holdingId, setHoldingId] = useState<string | null>(null);
  const [liftedId, setLiftedId] = useState<string | null>(null);

  const stopHolding = useCallback(() => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
    setHoldingId(null);
  }, []);

  const release = useCallback(() => {
    stopHolding();
    if (lifted.current === null) return;
    lifted.current = null;
    setLiftedId(null);
    droppedAt.current = Date.now();
    latest.current.onDrop();
  }, [stopHolding]);

  useEffect(() => stopHolding, [stopHolding]);

  const handlers = useMemo<HoldReorder["handlers"]>(
    () => ({
      onPointerDown: (event) => {
        const { container, enabled, idOf, itemSelector, onLift } = latest.current;
        const { clientX, clientY, pointerId, pointerType, button, target } = event;
        if (!enabled || !(target instanceof Element)) return;
        const item = target.closest<HTMLElement>(itemSelector);
        if (!item || item.querySelector("input") || (pointerType === "mouse" && button !== 0))
          return;
        const id = idOf(item);
        stopHolding();
        setHoldingId(id);
        press.current = {
          x: clientX,
          y: clientY,
          timer: setTimeout(() => {
            press.current = null;
            setHoldingId(null);
            lifted.current = id;
            setLiftedId(id);
            capturePointer(container.current, pointerId);
            onLift();
          }, HOLD_TO_LIFT_MS),
        };
      },
      onPointerMove: ({ clientX, clientY }) => {
        const started = press.current;
        if (started) {
          const moved = Math.max(Math.abs(clientX - started.x), Math.abs(clientY - started.y));
          if (moved > MOVED_TOO_MUCH_PX) stopHolding();
        }
        const { container, idOf, itemSelector, onMove } = latest.current;
        if (lifted.current === null || !container.current) return;
        const others = otherItems(container.current, itemSelector, lifted.current, idOf);
        const under = itemUnder(others, clientX);
        if (under) onMove(lifted.current, idOf(under.item), under.side);
      },
      onPointerUp: release,
      onPointerCancel: release,
      onPointerLeave: () => {
        if (lifted.current === null) stopHolding();
      },
      onContextMenu: (event) => {
        if (press.current || lifted.current !== null) event.preventDefault();
      },
      onClickCapture: (event) => {
        if (lifted.current === null && Date.now() >= droppedAt.current + CLICK_AFTER_DROP_MS)
          return;
        event.stopPropagation();
        event.preventDefault();
      },
    }),
    [release, stopHolding],
  );

  return { holdingId, liftedId, handlers };
}
