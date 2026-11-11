// What the mouse does on a preview: Ctrl + wheel zooms where the mouse is, the wheel alone goes over
// what is seen, and dragging moves it. It lives out of React: these events come by the dozen.

export const ZOOM_TIP =
  "Para acercar el flyer: Ctrl + ruedita (o pellizcá en el touchpad). También con + y −.";
const ZOOM_TIP_KEY = "fg_tip_zoom";

export interface ZoomLimits {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

export interface ZoomPanOptions {
  readonly pane: HTMLElement;
  /** What grows: the mouse stays over the same place of it. */
  readonly target: Element;
  readonly limits: ZoomLimits;
  readonly readZoom: () => number;
  /** Before it returns, the target has its new size: what is measured next depends on it. */
  readonly applyZoom: (zoom: number) => void;
  readonly onTip: (text: string) => void;
  /** With nothing to zoom, the wheel is the wheel and no more. */
  readonly canZoom?: () => boolean;
  /** Pressing on these does not drag. */
  readonly noDragOn?: string;
}

function nextZoom(zoom: number, steps: number, { min, max, step }: ZoomLimits): number {
  let result = zoom;
  for (let turn = 0; turn < Math.abs(steps); turn += 1) {
    result = steps > 0 ? Math.min(result * step, max) : Math.max(result / step, min);
  }
  return result;
}

function clampFraction(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

/** Once in this browser, and not to someone who was going over a long flyer. */
function tipOnce(pane: HTMLElement, onTip: (text: string) => void): void {
  if (pane.scrollHeight > pane.clientHeight + 2) return;
  try {
    if (localStorage.getItem(ZOOM_TIP_KEY)) return;
    localStorage.setItem(ZOOM_TIP_KEY, "1");
  } catch {
    return;
  }
  onTip(ZOOM_TIP);
}

/** Returns what takes the gestures away. */
export function attachZoomPanGestures({
  pane,
  target,
  limits,
  readZoom,
  applyZoom,
  onTip,
  canZoom = () => true,
  noDragOn = "button",
}: ZoomPanOptions): () => void {
  let pending = 0;
  let steps = 0;
  let mouseX = 0;
  let mouseY = 0;

  /**
   * It applies at once and not on the next frame: what is measured below would still have the old
   * size, the correction of the scroll would be 0 and the zoom would stop following the mouse
   * (invariant 1). This runs inside a frame already, so it is still once per frame.
   */
  const zoomNow = () => {
    pending = 0;
    const taken = steps;
    steps = 0;
    if (!taken) return;
    const before = target.getBoundingClientRect();
    const fractionX = clampFraction((mouseX - before.left) / before.width);
    const fractionY = clampFraction((mouseY - before.top) / before.height);
    const zoom = readZoom();
    const next = nextZoom(zoom, taken, limits);
    if (next === zoom) return;
    applyZoom(next);
    const after = target.getBoundingClientRect();
    pane.scrollLeft += after.left + fractionX * after.width - mouseX;
    pane.scrollTop += after.top + fractionY * after.height - mouseY;
  };

  const onWheel = (event: WheelEvent) => {
    if (!canZoom()) return;
    if (!(event.ctrlKey || event.metaKey)) {
      tipOnce(pane, onTip);
      return;
    }
    event.preventDefault();
    steps += event.deltaY < 0 ? 1 : -1;
    mouseX = event.clientX;
    mouseY = event.clientY;
    if (!pending) pending = requestAnimationFrame(zoomNow);
  };

  let dragging: { x: number; y: number; left: number; top: number } | null = null;
  const onMouseDown = (event: MouseEvent) => {
    if (event.button !== 0 || (event.target instanceof Element && event.target.closest(noDragOn))) {
      return;
    }
    dragging = { x: event.clientX, y: event.clientY, left: pane.scrollLeft, top: pane.scrollTop };
    pane.dataset.panning = "true";
    event.preventDefault();
  };
  const onMouseMove = (event: MouseEvent) => {
    if (!dragging) return;
    pane.scrollLeft = dragging.left - (event.clientX - dragging.x);
    pane.scrollTop = dragging.top - (event.clientY - dragging.y);
  };
  const stopDragging = () => {
    dragging = null;
    delete pane.dataset.panning;
  };

  pane.addEventListener("wheel", onWheel, { passive: false });
  pane.addEventListener("mousedown", onMouseDown);
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", stopDragging);
  document.addEventListener("mouseleave", stopDragging);
  return () => {
    if (pending) cancelAnimationFrame(pending);
    pane.removeEventListener("wheel", onWheel);
    pane.removeEventListener("mousedown", onMouseDown);
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", stopDragging);
    document.removeEventListener("mouseleave", stopDragging);
  };
}
