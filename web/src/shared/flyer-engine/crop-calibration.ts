// The calibration of a cropped flyer. Officers and legal are anchored at the bottom, so with a shorter
// picture they go up by themselves and only what is above a cut makes up for it. What is anchored at
// the top and below a cut goes up, and what falls inside a cut is turned off.
import { resolveCalibration } from "./calibration.ts";
import { type BenefitLine, type Calibration, type Cut, type RawCalibration } from "./types.ts";

/** A line with nothing to say: an empty list would bring back the default lines. */
const EMPTY_BENEFIT_LINE: BenefitLine = {
  t: "",
  x: 0,
  y: -9999,
  fs: 12,
  peso: 500,
  color: "#000000",
  align: "center",
  mw: 10,
};
const BOTTOM_ANCHORED_CONTACT = ["ey", "y1", "y2", "y3"] as const;

interface CutPlace {
  cut: Cut;
  /** Picture pixels per calibration pixel. */
  toPicture: number;
  /** Height of the picture as the steps before left it. */
  heightBefore: number;
  referenceHeight: number;
}

/** A y anchored at the top after one cut, or null when it falls inside what was removed. */
function shiftedTop(y: number, { cut, toPicture }: CutPlace): number | null {
  const position = y * toPicture;
  const height = cut.h / toPicture;
  if (cut.ins) return position >= cut.y ? y + height : y;
  if (position >= cut.y + cut.h) return y - height;
  return position >= cut.y ? null : y;
}

/** A y anchored at the bottom after one cut. Inside what was removed, it goes to the edge of the cut. */
function shiftedBottom(y: number, place: CutPlace): number {
  const { cut, toPicture, heightBefore, referenceHeight } = place;
  const position = heightBefore - (referenceHeight - y) * toPicture;
  const height = cut.h / toPicture;
  if (cut.ins) return position < cut.y ? y - height : y;
  if (position < cut.y) return y + height;
  if (position >= cut.y + cut.h) return y;
  return referenceHeight - (heightBefore - cut.h - cut.y) / toPicture;
}

function shiftTopZones(calibration: Calibration, place: CutPlace): void {
  const { empresa, montos, cashback, benef } = calibration;
  const company = shiftedTop(empresa.yc, place);
  if (company === null) empresa.off = true;
  else empresa.yc = company;
  const amounts = shiftedTop(montos.y, place);
  if (amounts === null) montos.off = true;
  else montos.y = amounts;
  for (const box of montos.boxes) {
    if (box.y !== null && box.y !== undefined) {
      const y = shiftedTop(box.y, place);
      if (y === null) montos.off = true;
      else box.y = y;
    }
  }
  const single = shiftedTop(cashback.y, place);
  if (single === null) cashback.off = true;
  else cashback.y = single;
  benef.lineas = benef.lineas.flatMap((line) => {
    const y = shiftedTop(line.y, place);
    return y === null ? [] : [{ ...line, y }];
  });
  if (benef.lineas.length === 0) benef.lineas = [{ ...EMPTY_BENEFIT_LINE }];
}

function shiftBottomZones({ contacto, legal }: Calibration, place: CutPlace): void {
  for (const key of BOTTOM_ANCHORED_CONTACT) contacto[key] = shiftedBottom(contacto[key], place);
  legal.yStart = shiftedBottom(legal.yStart, place);
  legal.yEnd = shiftedBottom(legal.yEnd, place);
}

function shiftForCut(calibration: Calibration, place: CutPlace): void {
  const { cut } = place;
  shiftTopZones(calibration, place);
  shiftBottomZones(calibration, place);
  if (calibration.cropH > 0) {
    calibration.cropH = cut.ins
      ? calibration.cropH + cut.h
      : Math.max(1, calibration.cropH - cut.h);
  }
}

/**
 * A copy for the cropped flyer: the original is never touched. `width` and `height` are those of the
 * whole picture.
 */
export function cropCalibration(
  raw: RawCalibration,
  cuts: readonly Cut[],
  width: number,
  height: number,
): Calibration {
  // Through JSON, as in the current app: the copy has no undefined, and a default it shares with
  // another flyer is not written on.
  const calibration: Calibration = JSON.parse(JSON.stringify(resolveCalibration(raw)));
  const toPicture = width / calibration.imgW;
  let heightBefore = height;
  for (const cut of cuts) {
    shiftForCut(calibration, {
      cut,
      toPicture,
      heightBefore,
      referenceHeight: calibration.imgH,
    });
    heightBefore += cut.ins ? cut.h : -cut.h;
  }
  return resolveCalibration(calibration);
}
