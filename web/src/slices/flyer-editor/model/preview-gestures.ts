// What the mouse does on the preview: Ctrl + wheel zooms where the mouse is, the wheel alone goes
// over the flyer, and dragging moves it. It lives out of React: these events come by the dozen.
import {
  type FlyerWorkspace,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
} from "@/shared/lib/flyer-workspace/index.ts";

export const ZOOM_TIP =
  "Para acercar el flyer: Ctrl + ruedita (o pellizcá en el touchpad). También con + y −.";
const ZOOM_TIP_KEY = "fg_tip_zoom";

export interface PreviewGesturesOptions {
  readonly pane: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly workspace: Pick<FlyerWorkspace, "setZoom" | "drawNow"> & {
    readonly getState: () => { readonly zoom: number };
  };
  readonly onTip: (text: string) => void;
}

function nextZoom(zoom: number, steps: number): number {
  let result = zoom;
  for (let step = 0; step < Math.abs(steps); step += 1) {
    result =
      steps > 0 ? Math.min(result * ZOOM_STEP, ZOOM_MAX) : Math.max(result / ZOOM_STEP, ZOOM_MIN);
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
export function attachPreviewGestures({
  pane,
  canvas,
  workspace,
  onTip,
}: PreviewGesturesOptions): () => void {
  let pending = 0;
  let steps = 0;
  let mouseX = 0;
  let mouseY = 0;

  /**
   * It draws at once and not on the next frame: what is measured below would still have the old
   * size, the correction of the scroll would be 0 and the zoom would stop following the mouse
   * (invariant 1). This runs inside a frame already, so it is still one draw per frame.
   */
  const applyZoom = () => {
    pending = 0;
    const taken = steps;
    steps = 0;
    if (!taken) return;
    const before = canvas.getBoundingClientRect();
    const fractionX = clampFraction((mouseX - before.left) / before.width);
    const fractionY = clampFraction((mouseY - before.top) / before.height);
    const { zoom } = workspace.getState();
    const next = nextZoom(zoom, taken);
    if (next === zoom) return;
    workspace.setZoom(next);
    workspace.drawNow();
    const after = canvas.getBoundingClientRect();
    pane.scrollLeft += after.left + fractionX * after.width - mouseX;
    pane.scrollTop += after.top + fractionY * after.height - mouseY;
  };

  const onWheel = (event: WheelEvent) => {
    if (!(event.ctrlKey || event.metaKey)) {
      tipOnce(pane, onTip);
      return;
    }
    event.preventDefault();
    steps += event.deltaY < 0 ? 1 : -1;
    mouseX = event.clientX;
    mouseY = event.clientY;
    if (!pending) pending = requestAnimationFrame(applyZoom);
  };

  let dragging: { x: number; y: number; left: number; top: number } | null = null;
  const onMouseDown = (event: MouseEvent) => {
    if (event.button !== 0 || (event.target instanceof Element && event.target.closest("button"))) {
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
  const onMouseUp = () => {
    dragging = null;
    delete pane.dataset.panning;
  };

  pane.addEventListener("wheel", onWheel, { passive: false });
  pane.addEventListener("mousedown", onMouseDown);
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
  return () => {
    if (pending) cancelAnimationFrame(pending);
    pane.removeEventListener("wheel", onWheel);
    pane.removeEventListener("mousedown", onMouseDown);
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  };
}
