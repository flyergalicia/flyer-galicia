import { drawAmounts, drawCashback } from "./draw-amounts.ts";
import { drawBenefit } from "./draw-benefit.ts";
import { drawCompany } from "./draw-company.ts";
import { drawLegal } from "./draw-legal.ts";
import { drawOfficers } from "./draw-officers.ts";
import { bottomAnchoredRaw, effectiveScale } from "./geometry.ts";
import { legalWithValues } from "./legal-text.ts";
import { drawLogoChanges } from "./logos.ts";
import { extraHeightFor } from "./officers.ts";
import { type DrawnFlyer, type DrawPass, type FlyerFrame, type LogoSource } from "./types.ts";

/**
 * With more officers the flyer grows: the art is cut right above their band, everything below goes
 * down, and the gap is filled by stretching the last row above the cut, so the background goes on
 * with no seam.
 */
function drawGrownArt({ ctx, scale, scene, extra }: DrawPass): void {
  const { art } = scene;
  const width = Math.round(art.width * scale);
  const raw = Math.round(bottomAnchoredRaw(scene, scene.calibration.contacto.ey, 1));
  const split = Math.max(1, Math.min(art.height - 1, raw));
  const gapY = Math.round(split * scale);
  const gapHeight = Math.round(extra * scale) + 1;
  ctx.drawImage(art, 0, 0, art.width, split, 0, 0, width, gapY);
  ctx.fillStyle = scene.calibration.contacto.bg || "#ffffff";
  ctx.fillRect(0, gapY, width, gapHeight);
  ctx.drawImage(art, 0, split - 1, art.width, 1, 0, gapY, width, gapHeight);
  ctx.drawImage(
    art,
    0,
    split,
    art.width,
    art.height - split,
    0,
    gapY + Math.round(extra * scale),
    width,
    Math.round((art.height - split) * scale),
  );
}

function drawArt(pass: DrawPass): void {
  const { ctx, scale, scene, extra } = pass;
  if (extra > 0) {
    drawGrownArt(pass);
    return;
  }
  const { art } = scene;
  ctx.drawImage(art, 0, 0, Math.round(art.width * scale), Math.round(art.height * scale));
}

/**
 * One whole flyer on a target, always through here: the preview, the downloads and the batches draw
 * the same thing (invariant 16). Nothing stays behind between two calls.
 */
export function drawFlyer(
  ctx: CanvasRenderingContext2D,
  { scene, values, scale }: FlyerFrame,
  logos: LogoSource,
): DrawnFlyer {
  const extra = extraHeightFor(scene, values);
  const pass: DrawPass = {
    ctx,
    scale,
    effective: effectiveScale(scene, scale),
    scene,
    extra,
  };
  drawArt(pass);
  drawLogoChanges(pass, values, logos);
  drawCompany(pass, values.empresa);
  if (values.cashUnico ?? scene.singleCashback) drawCashback(pass, values);
  else drawAmounts(pass, values);
  if (values.benef) drawBenefit(pass, values);
  const officersBottom = drawOfficers(pass, values);
  const legalBottom = drawLegal(pass, legalWithValues(values.legal, values, scene));
  const bottom = Math.max(officersBottom, legalBottom);
  return { extra, contentBottom: scale > 0 ? bottom / scale : bottom };
}
