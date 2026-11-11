// The mouse and the finger on the flyer, out of the state of React (plan, rule 7). A click looks for
// the logo, dragging marks a box by hand. On a logo already changed, a click chooses it and dragging
// moves it. A finger only touches: dragging with it goes on scrolling the page.
import { boxOf, isAdjustable, logoAt } from "./change.ts";
import type { FlyerCoordinates } from "./coordinates.ts";
import type { LogoEditor } from "./editor-store.ts";
import { guidesFor, type MovingLogo } from "./guides.ts";

const DRAG_THRESHOLD = 8;
const CURSOR_MOVE = "move";

interface Press {
  readonly x: number;
  readonly y: number;
  readonly byFinger: boolean;
  readonly withShift: boolean;
  readonly zoneMode: boolean;
  moved: boolean;
  logo: number;
  moving: readonly MovingLogo[] | null;
  /** It started on what was chosen with Shift: those of the flyer become movable on dragging. */
  lift: { x: number; y: number } | null;
  groupReady: boolean;
}

function movingOf(editor: LogoEditor, indexes: readonly number[]): readonly MovingLogo[] {
  const list = editor.active();
  return indexes.flatMap((index) => {
    const entry = list[index];
    return entry ? [{ index, tx: boxOf(entry).tx, ty: boxOf(entry).ty }] : [];
  });
}

function isOnChosenPlace(
  editor: LogoEditor,
  point: { x: number; y: number },
  logo: number,
): boolean {
  const { places } = editor.getState();
  if (places.length === 0) return false;
  const onPlace = places.some(
    ({ x, y, w, h }) => point.x >= x && point.x <= x + w && point.y >= y && point.y <= y + h,
  );
  return onPlace || (logo >= 0 && editor.chosen().includes(logo));
}

/** Marks the box under the mouse: it shows whole, and the others stay faint. */
function markNear(layer: HTMLElement | null, event: PointerEvent | null): void {
  if (!layer) return;
  let hit: Element | null = null;
  if (event) {
    const markers = layer.querySelectorAll("[data-marker]");
    for (let index = markers.length - 1; index >= 0 && !hit; index -= 1) {
      const marker = markers[index];
      const box = marker?.getBoundingClientRect();
      const isIn =
        box &&
        event.clientX >= box.left &&
        event.clientX <= box.right &&
        event.clientY >= box.top &&
        event.clientY <= box.bottom;
      if (marker && isIn) hit = marker;
    }
  }
  for (const marker of layer.querySelectorAll("[data-near]")) {
    if (marker !== hit) marker.removeAttribute("data-near");
  }
  hit?.setAttribute("data-near", "");
}

function pressOn(event: PointerEvent, editor: LogoEditor, coordinates: FlyerCoordinates): Press {
  const point = coordinates.toPicture(event.clientX, event.clientY);
  const zoneMode = editor.getState().mode !== "none";
  // Placing a saved set, touching or dragging chooses the place: it does not move logos.
  const canTakeLogo = !zoneMode && !editor.getState().placement;
  const logo = point && canTakeLogo ? logoAt(editor.active(), point.x, point.y) : -1;
  const isFinger = event.pointerType === "touch";
  return {
    x: event.clientX,
    y: event.clientY,
    byFinger: isFinger && !zoneMode,
    withShift: event.shiftKey && !zoneMode,
    zoneMode,
    moved: false,
    logo,
    moving: null,
    lift: point && !zoneMode && !isFinger && isOnChosenPlace(editor, point, logo) ? point : null,
    groupReady: false,
  };
}

export function attachPointerController(
  canvas: HTMLCanvasElement,
  editor: LogoEditor,
  coordinates: FlyerCoordinates,
  layer: () => HTMLElement | null,
): () => void {
  let press: Press | null = null;

  const works = () => {
    const { on, clean } = editor.getState();
    return on && !clean;
  };

  const onPointerDown = (event: PointerEvent) => {
    if (!works() || event.button !== 0) return;
    if (editor.getState().mode === "insert") {
      event.preventDefault();
      event.stopPropagation();
      editor.pressPlacing(event.clientY, event.pointerType === "touch");
      return;
    }
    press = pressOn(event, editor, coordinates);
    const { logo, byFinger } = press;
    if (logo >= 0) {
      // On one already chosen it drags them all; if not, only that one.
      const group = editor.chosen();
      let indexes: readonly number[] = group;
      if (!group.includes(logo)) indexes = event.shiftKey ? [...group, logo] : [logo];
      press.moving = movingOf(editor, indexes);
      editor.startDrag();
    }
    if (!byFinger) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const liftChosenPlaces = (current: Press) => {
    const { lift } = current;
    if (!lift) return;
    current.lift = null;
    editor.liftPlaces();
    const logo = logoAt(editor.active(), lift.x, lift.y);
    if (logo >= 0) {
      current.logo = logo;
      current.moving = movingOf(editor, editor.chosen());
      editor.startDrag();
    }
  };

  const dragLogos = (current: Press, event: PointerEvent) => {
    const { moving, logo } = current;
    if (!moving || !isAdjustable(editor.active()[logo])) return;
    if (!current.groupReady) {
      current.groupReady = true;
      editor.chooseOne(logo, true);
      editor.setGroupForDrag(moving.map(({ index }) => index));
    }
    const screenScale = coordinates.screenScale();
    let dx = (event.clientX - current.x) / screenScale;
    let dy = (event.clientY - current.y) / screenScale;
    if (event.altKey) {
      editor.showGuides([]);
    } else {
      const guides = guidesFor({
        list: editor.active(),
        moving,
        main: logo,
        dx,
        dy,
        screenScale,
        flyerWidth: editor.picture()?.width ?? 0,
      });
      dx += guides.dx;
      dy += guides.dy;
      editor.showGuides(guides.lines);
    }
    editor.dragTo(moving, dx, dy);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!press) {
      hover(event);
      return;
    }
    if (Math.abs(event.clientX - press.x) + Math.abs(event.clientY - press.y) > DRAG_THRESHOLD) {
      press.moved = true;
    }
    if (!press.moved || press.byFinger) return;
    liftChosenPlaces(press);
    if (press.logo >= 0) {
      dragLogos(press, event);
    } else {
      const { left, top } = canvas.getBoundingClientRect();
      if (editor.getState().mode === "trim") {
        editor.setTrimBand({ y0: press.y - top, y1: event.clientY - top });
        return;
      }
      editor.setBox({
        x0: press.x - left,
        y0: press.y - top,
        x1: event.clientX - left,
        y1: event.clientY - top,
      });
    }
  };

  const hover = (event: PointerEvent) => {
    if (!works() || event.pointerType === "touch") return;
    const isOverCanvas = event.target === canvas;
    if (isOverCanvas) editor.hoverPlacing(event.clientY);
    if (isOverCanvas) {
      const point = coordinates.toPicture(event.clientX, event.clientY);
      const overLogo = point && logoAt(editor.active(), point.x, point.y) >= 0;
      canvas.style.cursor = overLogo ? CURSOR_MOVE : "";
    }
    markNear(layer(), isOverCanvas ? event : null);
  };

  const releaseLogo = (current: Press) => {
    if (current.moved) {
      editor.settle();
      return;
    }
    if (current.withShift) editor.toggleInGroup(current.logo);
    else {
      const group = editor.chosen();
      const keepGroup = group.includes(current.logo) && group.length >= 2;
      editor.chooseOne(current.logo, keepGroup);
    }
    editor.settle();
  };

  const releaseFree = (current: Press, event: PointerEvent) => {
    const from = coordinates.toPicture(
      Math.min(current.x, event.clientX),
      Math.min(current.y, event.clientY),
    );
    const to = coordinates.toPicture(
      Math.max(current.x, event.clientX),
      Math.max(current.y, event.clientY),
    );
    if (current.moved) {
      if (!from || !to) return;
      if (current.withShift) editor.chooseAllIn(from.x, from.y, to.x, to.y);
      else editor.openBox(from.x, from.y, to.x - from.x, to.y - from.y);
      return;
    }
    const point = coordinates.toPicture(current.x, current.y);
    if (!point) return;
    if (current.withShift) editor.togglePlaceAt(point.x, point.y);
    else editor.openPoint(point.x, point.y);
  };

  const releaseTrim = (current: Press, event: PointerEvent) => {
    if (current.moved) editor.trimDragged(current.y, event.clientY);
    else editor.trimUntouched();
  };

  const releaseZone = (current: Press, event: PointerEvent) => {
    if (editor.getState().mode === "trim") {
      releaseTrim(current, event);
      return;
    }
    if (!current.moved) {
      editor.touchedWhileMarking(coordinates.toPicture(event.clientX, event.clientY));
      return;
    }
    const from = coordinates.toPicture(
      Math.min(current.x, event.clientX),
      Math.min(current.y, event.clientY),
    );
    const to = coordinates.toPicture(
      Math.max(current.x, event.clientX),
      Math.max(current.y, event.clientY),
    );
    if (from && to) editor.markedStrip(from.x, from.y, to.x, to.y);
  };

  const releasePlacing = (current: Press, event: PointerEvent) => {
    const from = coordinates.toPicture(
      Math.min(current.x, event.clientX),
      Math.min(current.y, event.clientY),
    );
    const to = coordinates.toPicture(
      Math.max(current.x, event.clientX),
      Math.max(current.y, event.clientY),
    );
    const touched = coordinates.toPicture(event.clientX, event.clientY);
    if (current.moved && from && to) editor.placement.touched(from, to, true);
    else if (!current.moved && touched) editor.placement.touched(touched, touched, false);
  };

  const onPointerUp = (event: PointerEvent) => {
    if (!press) return;
    const current = press;
    press = null;
    editor.showGuides([]);
    editor.setBox(null);
    if (editor.getState().dragging) editor.endDrag();
    if (current.byFinger && current.moved) return;
    if (current.logo >= 0) releaseLogo(current);
    else if (current.zoneMode) releaseZone(current, event);
    else if (editor.getState().placement) releasePlacing(current, event);
    else releaseFree(current, event);
  };

  const onPointerCancel = () => {
    if (!press) return;
    press = null;
    editor.setBox(null);
    editor.setTrimBand(null);
    editor.showGuides([]);
    if (editor.getState().dragging) {
      editor.endDrag();
      editor.settle();
    }
  };

  const onMouseDown = (event: MouseEvent) => {
    // If not, the preview takes the mouse to go over the flyer.
    if (works()) {
      event.stopPropagation();
      event.preventDefault();
    }
  };

  const onDoubleClick = (event: MouseEvent) => {
    const { mode, picker, placement } = editor.getState();
    if (!works() || mode !== "none" || picker || placement) return;
    const point = coordinates.toPicture(event.clientX, event.clientY);
    const logo = point ? logoAt(editor.active(), point.x, point.y) : -1;
    if (logo < 0) return;
    event.preventDefault();
    event.stopPropagation();
    editor.chooseOne(logo, false);
    editor.changeChosen();
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("mousedown", onMouseDown);
  canvas.addEventListener("dblclick", onDoubleClick);
  document.addEventListener("pointermove", onPointerMove);
  document.addEventListener("pointerup", onPointerUp);
  document.addEventListener("pointercancel", onPointerCancel);
  return () => {
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("mousedown", onMouseDown);
    canvas.removeEventListener("dblclick", onDoubleClick);
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
    document.removeEventListener("pointercancel", onPointerCancel);
  };
}
