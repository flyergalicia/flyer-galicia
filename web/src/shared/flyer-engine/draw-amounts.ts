import { largestAmount } from "./amounts.ts";
import { sampleBackground } from "./background-sample.ts";
import { fontWeightPrefix, setFont } from "./fonts.ts";
import { type AmountBox, type AmountsZone, type DrawPass, type FlyerValues } from "./types.ts";

const ROW_ABOVE = 5;
const DEFAULT_MIN_FONT = 28;

/** Where a box of the amounts starts: its own row, or that of all of them. */
export function amountBoxTop(zone: AmountsZone, box: AmountBox): number {
  return box.y ?? zone.y;
}

/** How tall a box of the amounts is: its own height, or that of all of them. */
export function amountBoxHeight(zone: AmountsZone, box: AmountBox): number {
  return box.mh ?? zone.mh;
}

function amountTexts(values: FlyerValues): readonly (string | number | null | undefined)[] {
  if (values.nocb) return ["", "", "", ""];
  return [values.m1, values.m2, values.m3, values.m4];
}

/**
 * The four boxes. They are covered even "sin cashback", in case the flyer has amounts printed below,
 * and each color is sampled before painting: in a 2x2 grid the lower box would take the color of the
 * upper one once covered.
 */
export function drawAmounts({ ctx, effective, scene }: DrawPass, values: FlyerValues): void {
  const zone = scene.calibration.montos;
  if (zone.off) return;
  const fontSize = Math.round(zone.fs * effective);
  const weight = fontWeightPrefix(zone.peso);
  const texts = amountTexts(values);
  const boxes = zone.boxes.map((box) => {
    const top = amountBoxTop(zone, box);
    const height = amountBoxHeight(zone, box);
    return {
      x: Math.round(box.xc * effective),
      width: Math.round(box.ew * effective),
      y: Math.round(top * effective),
      height: Math.round(height * effective),
      color: box.col,
      background: sampleBackground(
        scene,
        box.xc - box.ew / 2,
        box.xc + box.ew / 2,
        top - height / 2 - ROW_ABOVE,
        zone.bg,
      ),
    };
  });
  for (const [index, box] of boxes.entries()) {
    ctx.fillStyle = box.background;
    ctx.fillRect(box.x - box.width / 2, box.y - box.height / 2, box.width, box.height);
    setFont(ctx, weight, fontSize);
    ctx.fillStyle = box.color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // As in the old app: an absent amount writes "undefined" through fillText.
    ctx.fillText(String(texts[index]), box.x, box.y);
  }
}

/** The single amount of a salary flyer: the largest one, shrunk if it does not fit. */
export function drawCashback({ ctx, effective, scene }: DrawPass, values: FlyerValues): void {
  const zone = scene.calibration.cashback;
  if (zone.off) return;
  const x = Math.round(zone.xc * effective);
  const y = Math.round(zone.y * effective);
  const maxWidth = Math.round(zone.mw * effective);
  const height = Math.round(zone.mh * effective);
  ctx.fillStyle = sampleBackground(
    scene,
    zone.xc - zone.mw / 2,
    zone.xc + zone.mw / 2,
    zone.y - zone.mh / 2 - ROW_ABOVE,
    zone.bg,
  );
  ctx.fillRect(x - maxWidth / 2, y - height / 2, maxWidth, height);
  const text = largestAmount(values, scene);
  if (!text) return;
  let fontSize = Math.round(zone.fs * effective);
  const weight = fontWeightPrefix(zone.peso);
  setFont(ctx, weight, fontSize);
  const width = ctx.measureText(text).width;
  if (width > maxWidth) {
    const smallest = Math.max(1, Math.round((zone.minFs || DEFAULT_MIN_FONT) * effective));
    fontSize = Math.max(Math.floor((fontSize * maxWidth) / width), smallest);
    setFont(ctx, weight, fontSize);
  }
  ctx.fillStyle = zone.col || "#fa6400";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
}
