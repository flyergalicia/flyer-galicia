// From the screen to the picture of the flyer and back. The flyer can be shown smaller than its
// canvas, and it opens a gap to fit more officers: what is under the gap goes down.
import { type FlyerScene, logoCutLine } from "@/shared/flyer-engine/index.ts";

export interface FlyerCoordinates {
  /** Pixels of screen per pixel of picture. */
  readonly screenScale: () => number;
  /** Null if it falls on the gap, or there is no flyer. */
  readonly toPicture: (clientX: number, clientY: number) => { x: number; y: number } | null;
  /** Relative to the canvas, for what goes over it. */
  readonly toLayer: (
    x: number,
    y: number,
    w: number,
    h: number,
  ) => { left: number; top: number; width: number; height: number };
  /** Where a point of the picture is on the screen. */
  readonly toClient: (x: number, y: number) => { x: number; y: number };
}

/** What it takes of the store. */
export interface CoordinatesSource {
  readonly getState: () => {
    readonly slot: { readonly scene: FlyerScene | null };
    readonly scale: number;
    readonly extra: number;
  };
}

export function flyerCoordinates(
  canvas: HTMLCanvasElement,
  workspace: CoordinatesSource,
): FlyerCoordinates {
  const cutLine = () => {
    const { slot, extra } = workspace.getState();
    return slot.scene ? logoCutLine(slot.scene, extra) : Number.POSITIVE_INFINITY;
  };
  const screenScale = () => {
    const { width } = canvas.getBoundingClientRect();
    return canvas.width ? (width / canvas.width) * workspace.getState().scale : 0;
  };
  const toLayer = (x: number, y: number, w: number, h: number) => {
    const factor = screenScale();
    const down = y >= cutLine() ? workspace.getState().extra : 0;
    return { left: x * factor, top: (y + down) * factor, width: w * factor, height: h * factor };
  };
  return {
    screenScale,
    toLayer,
    toClient: (x, y) => {
      const { left, top } = canvas.getBoundingClientRect();
      const place = toLayer(x, y, 0, 0);
      return { x: left + place.left, y: top + place.top };
    },
    toPicture: (clientX, clientY) => {
      const box = canvas.getBoundingClientRect();
      const { slot, scale, extra } = workspace.getState();
      if (!box.width || !box.height || !slot.scene) return null;
      const x = (((clientX - box.left) / box.width) * canvas.width) / scale;
      const y = (((clientY - box.top) / box.height) * canvas.height) / scale;
      const cut = cutLine();
      if (y < cut) return { x, y };
      return y < cut + extra ? null : { x, y: y - extra };
    },
  };
}
