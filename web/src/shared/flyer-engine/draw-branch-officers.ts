// "Oficiales por sede": up to eight officers in two columns, each with a location over the name, and
// a title over the grid. A branch of its own on purpose: the usual one stays as it is.
import { fontWeightPrefix, setFont } from "./fonts.ts";
import { bottomAnchoredRaw } from "./geometry.ts";
import { type Officer, officerRows, officersOf } from "./officers.ts";
import { type ContactZone, type DrawPass, type FlyerValues } from "./types.ts";

// Arial has no pin: with no fallback the browser would draw an empty square.
const LOCATION_FAMILY = 'Arial,"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
const BASE_FAMILY = "Arial,sans-serif";
const COLUMN_MARGIN = 24;
const SMALLEST_FONT = 9;
const SMALLEST_TITLE = 10;
const TITLE_MARGIN = 40;

interface Band {
  left: number;
  width: number;
}

interface TextLine {
  text: string;
  offset: number;
  size: number;
  bold: boolean;
  color: string;
  family: string;
}

function bandFor(zone: ContactZone, referenceWidth: number): Band {
  const width = Math.min(referenceWidth, zone.ewS || zone.ew3 || zone.ew);
  let left = zone.ex + zone.ew / 2 - width / 2;
  if (left < 0) left = 0;
  if (left + width > referenceWidth) left = referenceWidth - width;
  return { left, width };
}

function drawTitle(pass: DrawPass, title: string, band: Band, top: number, height: number): void {
  const { ctx, effective, scene } = pass;
  const zone = scene.calibration.contacto;
  const weight = `${String(zone.titPeso || 700)} `;
  let size = Math.round((zone.titFs || 27) * effective);
  const maxWidth = Math.round((band.width - TITLE_MARGIN) * effective);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = zone.titColor || zone.color;
  setFont(ctx, weight, size);
  const width = ctx.measureText(title).width;
  if (width > maxWidth) {
    size = Math.max(Math.round(SMALLEST_TITLE * effective), Math.floor((size * maxWidth) / width));
    setFont(ctx, weight, size);
  }
  ctx.fillText(
    title,
    Math.round((band.left + band.width / 2) * effective),
    top + Math.round((height * effective) / 2),
  );
}

function drawLine(
  pass: DrawPass,
  line: TextLine,
  position: { x: number; top: number },
  columnWidth: number,
): void {
  if (!line.text) return;
  const { ctx, effective, scene } = pass;
  const prefix = line.bold ? fontWeightPrefix(scene.calibration.contacto.peso) : "";
  const maxWidth = Math.round((columnWidth - COLUMN_MARGIN) * effective);
  setFont(ctx, prefix, line.size, line.family);
  const width = ctx.measureText(line.text).width;
  let size = line.size;
  if (width > maxWidth) {
    const smallest = Math.max(1, Math.round(SMALLEST_FONT * effective));
    size = Math.max(Math.floor((line.size * maxWidth) / width), smallest);
  }
  setFont(ctx, prefix, size, line.family);
  ctx.fillStyle = line.color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(line.text, position.x, position.top + Math.round(line.offset * effective));
}

function drawBranchOfficer(
  pass: DrawPass,
  officer: Officer,
  position: { x: number; top: number },
  columnWidth: number,
): void {
  const { effective, scene } = pass;
  const zone = scene.calibration.contacto;
  const name = Math.round(zone.fnBold * effective);
  const regular = Math.round(zone.frReg * effective);
  const base = { color: zone.color, family: BASE_FAMILY };
  const lines: TextLine[] = [
    {
      text: officer.location,
      offset: zone.sedeDy || 24,
      size: Math.round((zone.fnSede || 21) * effective),
      bold: true,
      color: zone.colSede || zone.color,
      family: LOCATION_FAMILY,
    },
    { ...base, text: officer.name, offset: zone.nomDy || 66, size: name, bold: true },
    { ...base, text: officer.phone, offset: zone.celDy || 96, size: regular, bold: false },
    { ...base, text: officer.email, offset: zone.mailDy || 124, size: regular, bold: false },
  ];
  for (const line of lines) drawLine(pass, line, position, columnWidth);
}

/** Returns where the block ends, in pixels of the target. */
export function drawBranchOfficers(pass: DrawPass, values: FlyerValues): number {
  const { ctx, effective, scale, scene } = pass;
  const zone = scene.calibration.contacto;
  const officers = officersOf(values);
  const title = (values.sedesTit ?? "").trim();
  const titleHeight = title ? zone.titH || 64 : 0;
  const perRow = officers.length > 1 ? 2 : 1;
  const rowHeight = zone.ehS || 160;
  const top = Math.round(bottomAnchoredRaw(scene, zone.ey, scale));
  const boxTop = top + Math.round(titleHeight * effective);
  const boxHeight = Math.round(officerRows(officers.length, true) * rowHeight * effective);
  const band = bandFor(zone, scene.calibration.imgW);
  ctx.fillStyle = zone.bg;
  ctx.fillRect(
    Math.round(band.left * effective),
    top,
    Math.round(band.width * effective),
    Math.round(titleHeight * effective) + boxHeight,
  );
  if (title) drawTitle(pass, title, band, top, titleHeight);
  const columns =
    perRow === 1
      ? [band.left + band.width / 2]
      : [band.left + band.width / 4, band.left + (3 * band.width) / 4];
  for (const [index, officer] of officers.entries()) {
    const column = columns[index % perRow] ?? 0;
    const rowTop = boxTop + Math.round(Math.floor(index / perRow) * rowHeight * effective);
    const position = { x: Math.round(column * effective), top: rowTop };
    drawBranchOfficer(pass, officer, position, band.width / perRow);
  }
  return boxTop + boxHeight;
}
