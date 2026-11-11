import { createCanvas } from "./canvas.ts";
import { renderPreview } from "./render.ts";
import { type DrawnFlyer, type FlyerFrame, type LogoSource } from "./types.ts";

export interface FlyerPreviewOptions {
  readonly canvas: HTMLCanvasElement;
  /** What to draw now, or null while no flyer can be shown. */
  readonly readFrame: () => FlyerFrame | null;
  readonly logos: LogoSource;
  readonly onDrawn?: (drawn: DrawnFlyer) => void;
}

export interface FlyerPreview {
  /** Draws before returning: the zoom anchors on the mouse, so it cannot wait for a frame (invariant 1). */
  drawNow(): void;
  /** Many calls within one frame become one draw. */
  requestDraw(): void;
  dispose(): void;
}

export function createFlyerPreview({
  canvas,
  readFrame,
  logos,
  onDrawn,
}: FlyerPreviewOptions): FlyerPreview {
  const work = createCanvas(0, 0);
  let pending = 0;

  const cancelPending = () => {
    if (pending) cancelAnimationFrame(pending);
    pending = 0;
  };
  const drawNow = () => {
    cancelPending();
    const frame = readFrame();
    if (!frame) return;
    const drawn = renderPreview(canvas, work, frame, logos);
    onDrawn?.(drawn);
  };

  return {
    drawNow,
    requestDraw: () => {
      if (!pending) pending = requestAnimationFrame(drawNow);
    },
    dispose: cancelPending,
  };
}
