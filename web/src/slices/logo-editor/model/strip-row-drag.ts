// Ordering "Tu selección" by dragging. With the mouse it goes from anywhere on the row, once it moved
// a few pixels, so that a click on an arrow is still a click; with a finger, from the handle, or the
// list could not be scrolled. A line marks where it is going to fall.
import { droppedAt } from "./strip-selection.ts";
import type { StripSession } from "./strip-session.ts";

const START_AFTER = 5;

export interface RowDragLooks {
  readonly line: string;
  readonly lifted: string;
  readonly ordering: string;
}

interface Drag {
  readonly row: HTMLElement;
  readonly from: number;
  readonly startY: number;
  readonly pointer: number;
  isOn: boolean;
  to: number | null;
  rows: readonly DOMRect[];
}

function closest(target: EventTarget | null, selector: string): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>(selector) : null;
}

function rowsOf(list: HTMLElement): HTMLElement[] {
  return [...list.querySelectorAll<HTMLElement>("[data-strip-row]")];
}

/** It falls before the first row whose center is under the pointer. */
function targetFor(rows: readonly DOMRect[], y: number): number {
  const at = rows.findIndex(({ top, height }) => y < top + height / 2);
  return at >= 0 ? at : rows.length;
}

export function attachRowDrag(
  list: HTMLElement,
  session: StripSession,
  looks: RowDragLooks,
): { readonly justDropped: () => boolean; readonly detach: () => void } {
  let drag: Drag | null = null;
  let droppedAtTime = 0;
  const line = document.createElement("div");
  line.className = looks.line;

  const start = (current: Drag) => {
    current.isOn = true;
    current.row.dataset["lifted"] = "";
    current.row.classList.add(looks.lifted);
    list.classList.add(looks.ordering);
    current.rows = rowsOf(list).map((row) => row.getBoundingClientRect());
    try {
      list.setPointerCapture(current.pointer);
    } catch {
      // A pointer that is gone: the drag ends by itself.
    }
    list.append(line);
  };

  const finish = (drop: boolean) => {
    if (!drag) return;
    const current = drag;
    drag = null;
    line.remove();
    list.classList.remove(looks.ordering);
    if (!current.isOn) return;
    current.row.classList.remove(looks.lifted);
    current.row.style.transform = "";
    droppedAtTime = Date.now();
    const { to, from } = current;
    if (drop && to !== null) session.change((choice) => droppedAt(choice, from, to));
  };

  const onDown = (event: PointerEvent) => {
    const row = closest(event.target, "[data-strip-row]");
    if (!row || closest(event.target, "button")) return;
    const onHandle = Boolean(closest(event.target, "[data-strip-handle]"));
    if (event.pointerType === "mouse" ? event.button !== 0 : !onHandle) return;
    drag = {
      row,
      from: Number(row.dataset["index"]),
      startY: event.clientY,
      pointer: event.pointerId,
      isOn: false,
      to: null,
      rows: [],
    };
    if (onHandle) {
      event.preventDefault();
      start(drag);
    }
  };

  const onMove = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    if (!drag.isOn) {
      if (Math.abs(event.clientY - drag.startY) < START_AFTER) return;
      start(drag);
    }
    event.preventDefault();
    drag.row.style.transform = `translateY(${String(event.clientY - drag.startY)}px)`;
    const to = targetFor(drag.rows, event.clientY);
    drag.to = to;
    const target = drag.rows[to];
    const edge = target ? target.top : (drag.rows.at(-1)?.bottom ?? 0);
    line.style.top = `${String(Math.round(edge - list.getBoundingClientRect().top + list.scrollTop - 3))}px`;
    line.hidden = to === drag.from || to === drag.from + 1;
  };

  const onUp = () => {
    finish(true);
  };
  const onCancel = () => {
    finish(false);
  };
  const onLost = () => {
    if (drag?.isOn) finish(true);
  };

  list.addEventListener("pointerdown", onDown);
  list.addEventListener("pointermove", onMove);
  list.addEventListener("pointerup", onUp);
  list.addEventListener("pointercancel", onCancel);
  list.addEventListener("lostpointercapture", onLost);
  return {
    justDropped: () => Date.now() - droppedAtTime < 350,
    detach: () => {
      list.removeEventListener("pointerdown", onDown);
      list.removeEventListener("pointermove", onMove);
      list.removeEventListener("pointerup", onUp);
      list.removeEventListener("pointercancel", onCancel);
      list.removeEventListener("lostpointercapture", onLost);
    },
  };
}
