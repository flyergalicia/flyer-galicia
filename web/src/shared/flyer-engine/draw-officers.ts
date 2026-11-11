import { drawBranchOfficers } from "./draw-branch-officers.ts";
import { fontWeightPrefix, setFont } from "./fonts.ts";
import { bottomAnchored } from "./geometry.ts";
import { type Officer, officerRows, officersOf } from "./officers.ts";
import { type ContactZone, type DrawPass, type FlyerValues } from "./types.ts";

const COLUMN_MARGIN = 18;
const SMALLEST_FONT = 9;
const DEFAULT_ROW_HEIGHT = 130;

interface Band {
  left: number;
  width: number;
}

/** With three, the band widens to `ew3`, centered where it always is, so the emails fit. */
function bandFor(zone: ContactZone, count: number, referenceWidth: number): Band {
  if (count !== 3) return { left: zone.ex, width: zone.ew };
  const width = Math.min(referenceWidth, Math.max(zone.ew3 || zone.ew, zone.ew));
  let left = zone.ex + zone.ew / 2 - width / 2;
  if (left < 0) left = 0;
  if (left + width > referenceWidth) left = referenceWidth - width;
  return { left, width };
}

function columnsFor(zone: ContactZone, count: number, band: Band): { xs: number[]; width: number } {
  if (count === 1) return { xs: [zone.xSingle], width: zone.ew };
  if (count === 3) {
    const { left, width } = band;
    return { xs: [left + width / 6, left + width / 2, left + (5 * width) / 6], width: width / 3 };
  }
  return { xs: [zone.xLeft, zone.xRight], width: zone.ew / 2 };
}

/** Shrinks a text only if it does not fit in its column. */
function fittedSize(
  pass: DrawPass,
  text: string,
  size: number,
  prefix: string,
  maxWidth: number,
): number {
  if (!text) return size;
  setFont(pass.ctx, prefix, size);
  const width = pass.ctx.measureText(text).width;
  if (width <= maxWidth) return size;
  const smallest = Math.max(1, Math.round(SMALLEST_FONT * pass.effective));
  return Math.max(Math.floor((size * maxWidth) / width), smallest);
}

function drawOfficer(
  pass: DrawPass,
  officer: Officer,
  column: { x: number; width: number },
  rowOffset: number,
): void {
  const { ctx, effective, scale, scene, extra } = pass;
  const zone = scene.calibration.contacto;
  const x = Math.round(column.x * effective);
  const maxWidth = Math.round((column.width - COLUMN_MARGIN) * effective);
  const bold = fontWeightPrefix(zone.peso);
  const yOf = (yRef: number) => Math.round(bottomAnchored(scene, yRef, scale, extra)) + rowOffset;
  const regularSize = Math.round(zone.frReg * effective);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = zone.color;
  const nameSize = fittedSize(
    pass,
    officer.name,
    Math.round(zone.fnBold * effective),
    bold,
    maxWidth,
  );
  setFont(ctx, bold, nameSize);
  ctx.fillText(officer.name, x, yOf(zone.y1));
  if (officer.phone) {
    setFont(ctx, "", fittedSize(pass, officer.phone, regularSize, "", maxWidth));
    ctx.fillText(officer.phone, x, yOf(zone.y2));
  }
  if (officer.email) {
    setFont(ctx, "", fittedSize(pass, officer.email, regularSize, "", maxWidth));
    ctx.fillText(officer.email, x, yOf(zone.y3));
  }
}

/**
 * One centered, two side by side, three in a row, four in 2x2 (the flyer grows). Returns where the
 * block ends, in pixels of the target.
 */
export function drawOfficers(pass: DrawPass, values: FlyerValues): number {
  if (values.sedes) return drawBranchOfficers(pass, values);
  const { ctx, effective, scale, scene, extra } = pass;
  const zone = scene.calibration.contacto;
  const officers = officersOf(values);
  const count = officers.length;
  const rows = officerRows(count);
  const perRow = count >= 4 ? 2 : Math.max(count, 1);
  const rowHeight = zone.eh || DEFAULT_ROW_HEIGHT;
  const lastTop = Math.round(bottomAnchored(scene, zone.ey, scale, extra));
  const boxTop = lastTop - Math.round((rows - 1) * rowHeight * effective);
  const boxHeight = Math.round(rows * rowHeight * effective);
  const band = bandFor(zone, count, scene.calibration.imgW);
  ctx.fillStyle = zone.bg;
  ctx.fillRect(
    Math.round(band.left * effective),
    boxTop,
    Math.round(band.width * effective),
    boxHeight,
  );
  if (count === 0) return boxTop + boxHeight;
  const columns = columnsFor(zone, count, band);
  for (const [index, officer] of officers.entries()) {
    const row = Math.floor(index / perRow);
    const rowOffset = Math.round((row - (rows - 1)) * rowHeight * effective);
    const x = columns.xs[index % perRow] ?? 0;
    drawOfficer(pass, officer, { x, width: columns.width }, rowOffset);
  }
  return boxTop + boxHeight;
}
