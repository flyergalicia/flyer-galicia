// The size of the calibrator (asked for by the administrator: with many lines in the benefit the
// picture was left in a strip). The bar between picture and controls fixes the height of the picture;
// the corner, the width and height of the editor. It is remembered by this browser; nothing saved is
// as it comes. On a narrow screen nothing is touched.
export const EDITOR_SIZE_KEY = "fg_cal_size";
const NARROW = 900;
const WINDOW_ROOM = 32;
const SMALLEST_WIDTH = 480;
const SMALLEST_HEIGHT = 320;
const SMALLEST_PICTURE = 150;
const SPLIT_HEIGHT = 9;
const CONTROLS_AT_LEAST = 60;
const NEARLY = 4;

export interface EditorSize {
  w?: number | null;
  h?: number | null;
  /** The height of the picture. */
  bh?: number | null;
}

export interface WindowSize {
  readonly width: number;
  readonly height: number;
}

interface SizeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function isSize(value: unknown): value is EditorSize {
  return typeof value === "object" && value !== null;
}

export function loadEditorSize(storage: SizeStorage): EditorSize {
  try {
    const saved: unknown = JSON.parse(storage.getItem(EDITOR_SIZE_KEY) ?? "null");
    return isSize(saved) ? saved : {};
  } catch {
    return {};
  }
}

export function saveEditorSize(storage: SizeStorage, size: EditorSize): void {
  try {
    storage.setItem(EDITOR_SIZE_KEY, JSON.stringify(size));
  } catch {
    // Without room it is as it comes the next time: nothing else depends on it.
  }
}

export interface EditorBox {
  /** Null: as it comes. */
  readonly width: number | null;
  readonly height: number | null;
}

/** The width and height of the editor, kept inside the window. */
export function editorBox(size: EditorSize, window: WindowSize): EditorBox {
  if (window.width <= NARROW) return { width: null, height: null };
  const room = { width: window.width - WINDOW_ROOM, height: window.height - WINDOW_ROOM };
  return {
    width: size.w ? Math.max(SMALLEST_WIDTH, Math.min(room.width, size.w)) : null,
    height: size.h ? Math.max(SMALLEST_HEIGHT, Math.min(room.height, size.h)) : null,
  };
}

/**
 * The height of the picture: at most what fits in the editor leaving the bar and 60 px of controls.
 * `editorHeight` is the inner height of the editor when it has one by hand.
 */
export function pictureHeight(
  size: EditorSize,
  window: WindowSize,
  editorHeight: number | null,
  pictureTop: number,
): number | null {
  if (window.width <= NARROW || !size.bh) return null;
  const top =
    (editorHeight ?? window.height - WINDOW_ROOM) - pictureTop - SPLIT_HEIGHT - CONTROLS_AT_LEAST;
  return Math.max(SMALLEST_PICTURE, Math.min(top, size.bh));
}

/** «Ampliar»: almost the whole window, or back to as it comes if it already is. */
export function enlarged(size: EditorSize, window: WindowSize): EditorSize {
  const room = { width: window.width - WINDOW_ROOM, height: window.height - WINDOW_ROOM };
  const isBig = (size.w ?? 0) >= room.width - NEARLY && (size.h ?? 0) >= room.height - NEARLY;
  return isBig ? {} : { w: room.width, h: room.height, bh: size.bh || null };
}

export interface DragStart {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly pictureHeight: number;
  /** The picture can grow until the controls keep 60 px. */
  readonly pictureMax: number;
}

export function pictureMaxOf(pictureHeightNow: number, controlsHeight: number): number {
  return pictureHeightNow + controlsHeight - CONTROLS_AT_LEAST;
}

/** The bar between picture and controls was dragged to this height of the pointer. */
export function splitDragged(size: EditorSize, start: DragStart, y: number): EditorSize {
  return {
    ...size,
    bh: Math.max(SMALLEST_PICTURE, Math.min(start.pictureMax, start.pictureHeight + (y - start.y))),
  };
}

/** The corner was dragged: the editor is centered, so it grows twice what the pointer moves. */
export function cornerDragged(
  size: EditorSize,
  start: DragStart,
  x: number,
  y: number,
): EditorSize {
  return { ...size, w: start.width + 2 * (x - start.x), h: start.height + 2 * (y - start.y) };
}

/** A double click on the bar or on the corner goes back to as it comes. */
export function sizeForgotten(size: EditorSize, part: "split" | "corner"): EditorSize {
  const kept = { ...size };
  if (part === "split") delete kept.bh;
  else {
    delete kept.w;
    delete kept.h;
  }
  return kept;
}
