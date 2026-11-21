// The canvas of the calibrator, out of the state of React: it draws when the calibration changes, a
// drag draws at most once per frame, Ctrl + wheel zooms (the wheel alone scrolls: the flyer is tall)
// and the arrows of the keyboard move the chosen zone.
import { type CalibratorStore, nextScale } from "../../model/calibrator/calibrator-store.ts";
import { drawCalibrator } from "../../model/calibrator/draw.ts";
import { arrowStep } from "../../model/calibrator/moves.ts";
import type { Grip } from "../../model/calibrator/zones.ts";

const WHEEL_STEP = 1.15;

export interface CalibratorCanvas {
  /** factor > 1 brings it closer, < 1 farther, 0 back to the start. Keeps the point under it fixed. */
  readonly zoom: (factor: number, at?: { readonly x: number; readonly y: number }) => void;
  readonly detach: () => void;
}

interface Drag {
  grip: Grip;
  x: number;
  y: number;
}

function pointOf(canvas: HTMLCanvasElement, store: CalibratorStore, event: MouseEvent) {
  const box = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - box.left) / store.scale(),
    y: (event.clientY - box.top) / store.scale(),
  };
}

function frameDrawer(store: CalibratorStore, canvas: HTMLCanvasElement) {
  let pending: number | null = null;
  const now = () => {
    if (pending !== null) cancelAnimationFrame(pending);
    pending = null;
    drawCalibrator(canvas, store);
  };
  return {
    now,
    soon: () => {
      pending ??= requestAnimationFrame(() => {
        pending = null;
        drawCalibrator(canvas, store);
      });
    },
    /** A drag that ended: a draw that was waiting is done now, where the zone was let go. */
    settle: () => {
      if (pending !== null) now();
    },
    stop: () => {
      if (pending !== null) cancelAnimationFrame(pending);
    },
  };
}

function zoomer(store: CalibratorStore, canvas: HTMLCanvasElement, area: HTMLElement) {
  return (factor: number, at?: { readonly x: number; readonly y: number }) => {
    const scale = store.scale();
    const next = nextScale(scale, store.startScale(), factor);
    if (Math.abs(next - scale) < 1e-6) return;
    // The fixed point: the one given, or the middle of what can be seen.
    const x = at?.x ?? (area.scrollLeft + area.clientWidth / 2 - canvas.offsetLeft) / scale;
    const y = at?.y ?? (area.scrollTop + area.clientHeight / 2 - canvas.offsetTop) / scale;
    const left = x * scale - area.scrollLeft + canvas.offsetLeft;
    const top = y * scale - area.scrollTop + canvas.offsetTop;
    // It draws at once, at the new size: only then can it scroll there.
    store.setScale(next);
    area.scrollLeft = x * next + canvas.offsetLeft - left;
    area.scrollTop = y * next + canvas.offsetTop - top;
  };
}

/**
 * The pinch of a trackpad sends the wheel with Ctrl many times a second: the factor is gathered and
 * applied once per frame, or the browser would freeze for seconds.
 */
function wheelZoom(
  store: CalibratorStore,
  canvas: HTMLCanvasElement,
  zoom: CalibratorCanvas["zoom"],
) {
  let pending: number | null = null;
  let factor = 1;
  let at = { x: 0, y: 0 };
  const onWheel = (event: WheelEvent) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    factor *= event.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP;
    at = pointOf(canvas, store, event);
    pending ??= requestAnimationFrame(() => {
      pending = null;
      const gathered = factor;
      factor = 1;
      zoom(gathered, at);
    });
  };
  canvas.addEventListener("wheel", onWheel, { passive: false });
  return () => {
    canvas.removeEventListener("wheel", onWheel);
    if (pending !== null) cancelAnimationFrame(pending);
  };
}

function pointerDrag(
  store: CalibratorStore,
  canvas: HTMLCanvasElement,
  draw: ReturnType<typeof frameDrawer>,
) {
  let dragging: Drag | null = null;
  const down = (event: PointerEvent) => {
    event.preventDefault();
    const point = pointOf(canvas, store, event);
    const grip = store.grab(point.x, point.y);
    if (!grip) return;
    dragging = { grip, ...point };
    canvas.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent) => {
    if (!dragging) return;
    event.preventDefault();
    const point = pointOf(canvas, store, event);
    store.drag(dragging.grip, point.x - dragging.x, point.y - dragging.y);
    dragging.x = point.x;
    dragging.y = point.y;
    draw.soon();
  };
  const up = () => {
    if (!dragging) return;
    dragging = null;
    draw.settle();
  };
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  return () => {
    canvas.removeEventListener("pointerdown", down);
    canvas.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  };
}

/** Arrows: one pixel, ten with Shift, wherever the focus is (as today). */
function arrowKeys(store: CalibratorStore, draw: ReturnType<typeof frameDrawer>) {
  const onKey = (event: KeyboardEvent) => {
    const zone = store.chosen();
    const step = zone ? arrowStep(event.key, event.shiftKey) : null;
    if (!zone || !step) return;
    event.preventDefault();
    store.drag({ zone, handle: null }, step[0], step[1]);
    draw.soon();
  };
  document.addEventListener("keydown", onKey);
  return () => {
    document.removeEventListener("keydown", onKey);
  };
}

export function attachCalibratorCanvas(
  store: CalibratorStore,
  canvas: HTMLCanvasElement,
  area: HTMLElement,
): CalibratorCanvas {
  const draw = frameDrawer(store, canvas);
  const zoom = zoomer(store, canvas, area);
  const stops = [
    store.onDraw(draw.now),
    wheelZoom(store, canvas, zoom),
    pointerDrag(store, canvas, draw),
    arrowKeys(store, draw),
    draw.stop,
  ];
  draw.now();
  return {
    zoom,
    detach: () => {
      for (const stop of stops) stop();
    },
  };
}
