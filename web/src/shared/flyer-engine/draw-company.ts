import { sampleBackground } from "./background-sample.ts";
import { fontWeightPrefix, setFont } from "./fonts.ts";
import { type DrawPass } from "./types.ts";

const TOP_GAP = 4;
const COVER_GAP = 8;
const LEAD = "Por ser parte de";

/** "Por ser parte de <empresa>", in one line if it fits and in two if it does not. */
export function drawCompany({ ctx, effective, scene }: DrawPass, company: string): void {
  const zone = scene.calibration.empresa;
  if (zone.off) return;
  const xc = Math.round(zone.xc * effective);
  const yc = Math.round(zone.yc * effective);
  const lh = Math.round(zone.lh * effective);
  const mw = Math.round(zone.mw * effective);
  const fs = Math.round(zone.fs * effective);
  ctx.fillStyle = sampleBackground(
    scene,
    zone.ex,
    zone.ex + zone.mw,
    zone.yc - zone.lh - TOP_GAP,
    zone.bg,
  );
  ctx.fillRect(
    Math.round(zone.ex * effective),
    yc - lh,
    mw,
    lh * 2 + Math.round(COVER_GAP * effective),
  );
  const weight = fontWeightPrefix(zone.peso);
  setFont(ctx, weight, fs);
  ctx.fillStyle = zone.color || "#111";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const full = `${LEAD} ${company}`;
  if (ctx.measureText(full).width <= mw) {
    ctx.fillText(full, xc, yc);
    return;
  }
  ctx.fillText(LEAD, xc, yc - Math.round(lh * 0.5));
  const width = ctx.measureText(company).width;
  if (width > mw) setFont(ctx, weight, Math.floor(fs * (mw / width)));
  ctx.fillText(company, xc, yc + Math.round(lh * 0.5));
}
