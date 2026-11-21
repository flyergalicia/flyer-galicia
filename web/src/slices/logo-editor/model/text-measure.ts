// What a text measures on the flyer, with the same letter it is drawn with.
import { boxOf, type PlacedChange } from "./change.ts";

const FAMILY = "Figtree,Arial,sans-serif";
export const TEXT_LINE_HEIGHT = 1.18;
const DEFAULT_WEIGHT = 500;

let measurer: CanvasRenderingContext2D | null = null;

function context(): CanvasRenderingContext2D {
  if (measurer) return measurer;
  const made = document.createElement("canvas").getContext("2d");
  if (!made) throw new Error("No canvas here");
  measurer = made;
  return made;
}

type Weight = number | string | null | undefined;

export function textFont(weight: Weight, size: number): string {
  return `${String(weight || DEFAULT_WEIGHT)} ${String(size)}px ${FAMILY}`;
}

export function widthOfLines(text: string, weight: Weight, size: number): number {
  const ctx = context();
  ctx.font = textFont(weight, size);
  return Math.max(...text.split("\n").map((line) => ctx.measureText(line).width));
}

/** Gives a text its width and height, without moving its center. */
export function measured(change: PlacedChange, center?: { x: number; y: number }): PlacedChange {
  const { tx, ty, tw, th } = boxOf(change);
  const { fs: size = 0, texto = "", peso } = change;
  const lines = texto.split("\n");
  const x = center ? center.x : tx + tw / 2;
  const y = center ? center.y : ty + th / 2;
  const width = Math.max(4, Math.ceil(widthOfLines(texto, peso, size)) + 4);
  const height = Math.max(4, Math.ceil(lines.length * size * TEXT_LINE_HEIGHT));
  return { ...change, tw: width, th: height, tx: x - width / 2, ty: y - height / 2 };
}
