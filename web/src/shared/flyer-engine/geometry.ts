// Where things fall: calibrations are measured on a flyer of a reference width, anchored at the top
// or at the bottom of the picture.
import { type FlyerScene } from "./types.ts";

/** From calibration pixels to pixels of a target drawn at this scale. */
export function effectiveScale(scene: FlyerScene, scale: number): number {
  return (scale * scene.art.width) / scene.calibration.imgW;
}

/** A y anchored at the bottom, with the original height of the picture. */
export function bottomAnchoredRaw(scene: FlyerScene, yRef: number, scale: number): number {
  const scaledHeight = scene.art.height * scale;
  return scaledHeight - (scene.calibration.imgH - yRef) * effectiveScale(scene, scale);
}

/** A y anchored at the bottom: when the flyer grows, all of that goes down with it. */
export function bottomAnchored(
  scene: FlyerScene,
  yRef: number,
  scale: number,
  extra: number,
): number {
  return bottomAnchoredRaw(scene, yRef, scale) + extra * scale;
}
