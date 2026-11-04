import { contextOf, createCanvas } from "./canvas.ts";
import { drawFlyer } from "./draw-flyer.ts";
import { effectiveScale } from "./geometry.ts";
import { extraHeightFor } from "./officers.ts";
import {
  type DrawnFlyer,
  type FlyerFrame,
  type FlyerScene,
  type FlyerValues,
  type LogoSource,
} from "./types.ts";

const MIN_HEIGHT_SHARE = 0.25;

/** The final height, in base pixels: the last content plus some air, so a short legal text is shorter. */
export function finalHeight(scene: FlyerScene, { extra, contentBottom }: DrawnFlyer): number {
  const { calibration } = scene;
  const whole = scene.art.height + extra;
  if (calibration.cropH > 0) return Math.min(Math.round(calibration.cropH), whole);
  if (!contentBottom) return whole;
  const air = calibration.bottomMargin * effectiveScale(scene, 1);
  const height = Math.min(Math.ceil(contentBottom + air), whole);
  return Math.max(height, Math.round(whole * MIN_HEIGHT_SHARE));
}

function fitCanvas(canvas: HTMLCanvasElement, width: number, height: number): void {
  if (canvas.width === width && canvas.height === height) {
    contextOf(canvas).clearRect(0, 0, width, height);
  } else {
    canvas.width = width;
    canvas.height = height;
  }
}

// The whole flyer takes about 35 MB: batches would make and drop one per flyer.
let workCanvas: HTMLCanvasElement | null = null;

/** The flyer at its real size, with the white below it cut. The canvas it returns is new every time. */
export function renderFullResolution(
  scene: FlyerScene,
  values: FlyerValues,
  logos: LogoSource,
): HTMLCanvasElement {
  const { art } = scene;
  const width = art.width;
  workCanvas ??= createCanvas(width, 0);
  fitCanvas(workCanvas, width, Math.round(art.height + extraHeightFor(scene, values)));
  const context = contextOf(workCanvas);
  context.save();
  let drawn: DrawnFlyer;
  try {
    drawn = drawFlyer(context, { scene, values, scale: 1 }, logos);
  } finally {
    context.restore();
  }
  const output = createCanvas(
    width,
    Math.min(workCanvas.height, Math.round(finalHeight(scene, drawn))),
  );
  contextOf(output).drawImage(workCanvas, 0, 0);
  return output;
}

/**
 * The preview: the same drawing as a download, at the scale of the screen, copied to the canvas on
 * screen. `work` is kept by the caller and reused, because at a high zoom it takes about 150 MB. It
 * has no save and restore, as in the current app: once a logo was drawn, its high smoothing stays
 * on while the canvas keeps its size.
 */
export function renderPreview(
  target: HTMLCanvasElement,
  work: HTMLCanvasElement,
  frame: FlyerFrame,
  logos: LogoSource,
): DrawnFlyer {
  const { scene, values, scale } = frame;
  const width = Math.round(scene.art.width * scale);
  const fullHeight = Math.round((scene.art.height + extraHeightFor(scene, values)) * scale);
  fitCanvas(work, width, fullHeight);
  const drawn = drawFlyer(contextOf(work), frame, logos);
  const height = Math.min(fullHeight, Math.round(finalHeight(scene, drawn) * scale));
  fitCanvas(target, width, height);
  contextOf(target).drawImage(work, 0, 0);
  return drawn;
}
