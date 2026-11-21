// A scene for tests, on a canvas of any size and color.
import { resolveCalibration } from "../calibration.ts";
import { contextOf, createCanvas } from "../canvas.ts";
import { type FlyerArt, type FlyerScene, type LogoSource, type RawCalibration } from "../types.ts";

export const TEST_ART_KEY = "https://flyers.invalid/flyer.jpg?v=1";

export function paintedCanvas(width: number, height: number, color = "#ffffff"): HTMLCanvasElement {
  const canvas = createCanvas(width, height);
  const ctx = contextOf(canvas);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  return canvas;
}

interface TestSceneOptions {
  readonly art?: FlyerArt;
  readonly calibration?: RawCalibration;
  readonly singleCashback?: boolean;
}

export function testScene(options: TestSceneOptions = {}): FlyerScene {
  const { art = paintedCanvas(1240, 6457), calibration = {}, singleCashback = false } = options;
  return {
    art,
    artKey: TEST_ART_KEY,
    calibration: resolveCalibration(calibration),
    singleCashback,
    whole: { art, artKey: TEST_ART_KEY, rawCalibration: calibration },
    cuts: [],
  };
}

const nothing = (): null => null;

export const NO_LOGOS: LogoSource = {
  imageFor: nothing,
  requestMissing: nothing,
  requestTextFont: nothing,
};

export function pixelAt(canvas: HTMLCanvasElement, x: number, y: number): number[] {
  return [...contextOf(canvas).getImageData(x, y, 1, 1).data];
}
