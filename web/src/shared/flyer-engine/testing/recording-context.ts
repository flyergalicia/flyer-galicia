// A real 2D context that also writes down what is asked of it, with the font and color of that moment.
import { contextOf, createCanvas } from "../canvas.ts";
import { effectiveScale } from "../geometry.ts";
import { type DrawPass, type FlyerScene } from "../types.ts";

export interface DrawnText {
  text: string;
  x: number;
  y: number;
  font: string;
  color: string;
  align: string;
  baseline: string;
}

export interface CoveredBox {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

export interface Recording {
  ctx: CanvasRenderingContext2D;
  texts: DrawnText[];
  boxes: CoveredBox[];
  images: unknown[][];
}

function colorOf(ctx: CanvasRenderingContext2D): string {
  const { fillStyle } = ctx;
  return typeof fillStyle === "string" ? fillStyle : "a pattern";
}

export function recordingContext(width = 1240, height = 6500): Recording {
  const real = contextOf(createCanvas(width, height));
  const texts: DrawnText[] = [];
  const boxes: CoveredBox[] = [];
  const images: unknown[][] = [];
  const ctx = new Proxy(real, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property);
      if (typeof value !== "function") return value;
      return (...args: unknown[]): unknown => {
        if (property === "fillText") {
          texts.push({
            text: String(args[0]),
            x: Number(args[1]),
            y: Number(args[2]),
            font: target.font,
            color: colorOf(target),
            align: target.textAlign,
            baseline: target.textBaseline,
          });
        }
        if (property === "fillRect") {
          boxes.push({
            x: Number(args[0]),
            y: Number(args[1]),
            width: Number(args[2]),
            height: Number(args[3]),
            color: colorOf(target),
          });
        }
        if (property === "drawImage") images.push(args);
        return Reflect.apply(value, target, args);
      };
    },
    set(target, property, value) {
      return Reflect.set(target, property, value);
    },
  });
  return { ctx, texts, boxes, images };
}

export function passOn(
  { ctx }: Pick<Recording, "ctx">,
  scene: FlyerScene,
  { scale = 1, extra = 0 }: { scale?: number; extra?: number } = {},
): DrawPass {
  return { ctx, scale, effective: effectiveScale(scene, scale), scene, extra };
}

export function textsOf({ texts }: Pick<Recording, "texts">): string[] {
  return texts.map(({ text }) => text);
}
