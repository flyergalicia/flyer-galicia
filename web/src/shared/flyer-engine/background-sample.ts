// The real color behind a zone, so that covering it does not show a box around the text. It reads
// the picture, not the target: the color is the same at any zoom and in the downloaded flyer.
import { contextOf, createCanvas } from "./canvas.ts";
import { effectiveScale } from "./geometry.ts";
import { type FlyerArt, type FlyerScene } from "./types.ts";

const SAMPLES = 5;
const MEMORY_LIMIT = 400;

interface Memory {
  width: number;
  height: number;
  size: number;
  colors: Map<string, string>;
}

const memories = new WeakMap<FlyerArt, Memory>();
let sampler: CanvasRenderingContext2D | null = null;

function samplerOf(width: number): CanvasRenderingContext2D {
  if (!sampler) {
    sampler = contextOf(createCanvas(1, 1), { willReadFrequently: true });
  }
  // It only grows: giving the buffer a new size is expensive.
  if (sampler.canvas.width < width) sampler.canvas.width = width;
  return sampler;
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function channelMedian(data: Uint8ClampedArray, width: number, channel: number): number {
  const samples = Array.from({ length: SAMPLES }, (_unused, sample) => {
    const pixel = Math.min(width - 1, Math.floor((width * (sample + 0.5)) / SAMPLES));
    return Number(data[pixel * 4 + channel]);
  });
  return Number(samples.toSorted((a, b) => a - b)[Math.floor(SAMPLES / 2)]);
}

function readColor(scene: FlyerScene, from: number, to: number, y: number): string | null {
  try {
    const { art } = scene;
    const toPicture = effectiveScale(scene, 1);
    const row = clamp(Math.round(y * toPicture), 0, art.height - 1);
    const x0 = clamp(Math.round(from * toPicture), 0, art.width - 1);
    const x1 = Math.max(x0 + 1, Math.min(art.width, Math.round(to * toPicture)));
    const width = x1 - x0;
    const context = samplerOf(width);
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, width, 1);
    context.drawImage(art, x0, row, width, 1, 0, 0, width, 1);
    const { data } = context.getImageData(0, 0, width, 1);
    const [red, green, blue] = [0, 1, 2].map((channel) => channelMedian(data, width, channel));
    return `rgb(${String(red)},${String(green)},${String(blue)})`;
  } catch {
    // A picture loaded without CORS cannot be read.
    return null;
  }
}

function memoryOf(art: FlyerArt): Memory {
  const known = memories.get(art);
  if (known?.width === art.width && known.height === art.height && known.size <= MEMORY_LIMIT) {
    return known;
  }
  const fresh: Memory = { width: art.width, height: art.height, size: 0, colors: new Map() };
  memories.set(art, fresh);
  return fresh;
}

/**
 * The median of five points of a row, in calibration pixels: a loose letter does not change it. The
 * color of a fixed point of a fixed picture does not change either, so it is remembered; a failure
 * is not.
 */
export function sampleBackground(
  scene: FlyerScene,
  from: number,
  to: number,
  y: number,
  fallback: string,
): string {
  const memory = memoryOf(scene.art);
  const key = `${String(from)}|${String(to)}|${String(y)}|${String(effectiveScale(scene, 1))}`;
  const remembered = memory.colors.get(key);
  if (remembered !== undefined) return remembered;
  const color = readColor(scene, from, to, y);
  if (color === null) return fallback;
  memory.colors.set(key, color);
  memory.size += 1;
  return color;
}
