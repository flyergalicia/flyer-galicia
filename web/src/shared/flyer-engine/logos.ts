// The changes of Cambiar logos over the art of the flyer.
import { bottomAnchoredRaw } from "./geometry.ts";
import {
  type DrawPass,
  type FlyerArt,
  type FlyerValues,
  type LogoChange,
  type LogoSource,
} from "./types.ts";

const TEXT_FAMILY = "Figtree,Arial,sans-serif";
const TEXT_LINE_HEIGHT = 1.18;
const DEFAULT_TEXT_WEIGHT = 500;
const DEFAULT_TEXT_COLOR = "#1A1A1A";

export interface LogoPaintTarget {
  readonly ctx: CanvasRenderingContext2D;
  readonly scale: number;
  /** The picture the changes were made on. */
  readonly art: FlyerArt;
  readonly artKey: string;
  /** From this height of the picture down, things go down `extra` pixels. */
  readonly cutAt: number;
  readonly extra: number;
}

function drawText({ ctx, scale }: LogoPaintTarget, change: LogoChange, offset: number): void {
  const size = (change.fs ?? 0) * scale;
  const lines = (change.texto ?? "").split("\n");
  const lineHeight = size * TEXT_LINE_HEIGHT;
  const x = (change.tx + change.tw / 2) * scale;
  const y = (change.ty + offset + change.th / 2) * scale;
  ctx.font = `${String(change.peso || DEFAULT_TEXT_WEIGHT)} ${String(size)}px ${TEXT_FAMILY}`;
  ctx.fillStyle = change.color || DEFAULT_TEXT_COLOR;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const [index, line] of lines.entries()) {
    ctx.fillText(line, x, y + (index - (lines.length - 1) / 2) * lineHeight);
  }
}

/** The image of a change: null for a text, or for a logo that is not in memory yet. */
function imageOf(
  change: LogoChange,
  { art, artKey }: LogoPaintTarget,
  logos: LogoSource,
): CanvasImageSource | null {
  if (change.tipo === "txt" || !change.img) return null;
  const image = logos.imageFor(change.img, art, artKey);
  if (!image) logos.requestMissing(change.img);
  return image;
}

function needsNoImage(change: LogoChange): boolean {
  return change.tipo === "txt" || !change.img;
}

function cover(target: LogoPaintTarget, change: LogoChange): void {
  if (!(change.w > 0 && change.h > 0)) return;
  const { ctx, scale, cutAt, extra } = target;
  const offset = change.y >= cutAt ? extra : 0;
  ctx.fillStyle = change.bg;
  ctx.fillRect(
    Math.floor(change.x * scale),
    Math.floor((change.y + offset) * scale),
    Math.ceil(change.w * scale) + 1,
    Math.ceil(change.h * scale) + 1,
  );
}

/**
 * Two passes: first everything that changes is covered, and only then the new things are drawn. If
 * not, moving logo A to the place of B and then touching B would erase A. A logo that is not in
 * memory leaves the original in its place until it arrives.
 */
export function paintLogoChanges(
  target: LogoPaintTarget,
  changes: readonly LogoChange[],
  logos: LogoSource,
): void {
  const { ctx, scale, cutAt, extra } = target;
  const ready = changes.flatMap((change) => {
    const image = imageOf(change, target, logos);
    if (!image && !needsNoImage(change)) return [];
    cover(target, change);
    return [{ change, image }];
  });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  for (const { change, image } of ready) {
    const offset = change.ty + change.th / 2 >= cutAt ? extra : 0;
    if (change.tipo === "txt") {
      logos.requestTextFont();
      drawText(target, change, offset);
    } else if (image) {
      ctx.drawImage(
        image,
        Math.round(change.tx * scale),
        Math.round((change.ty + offset) * scale),
        Math.max(1, Math.round(change.tw * scale)),
        Math.max(1, Math.round(change.th * scale)),
      );
    }
  }
}

/** Over the art and under everything else, only on the picture they were made on (invariant 21). */
export function drawLogoChanges(
  { ctx, scale, scene, extra }: DrawPass,
  values: FlyerValues,
  logos: LogoSource,
): void {
  const changes = values.logos;
  if (!changes?.length || values.logosSrc !== scene.artKey) return;
  const cutAt =
    extra > 0 ? Math.round(bottomAnchoredRaw(scene, scene.calibration.contacto.ey, 1)) : Infinity;
  paintLogoChanges(
    { ctx, scale, art: scene.art, artKey: scene.artKey, cutAt, extra },
    changes,
    logos,
  );
}
