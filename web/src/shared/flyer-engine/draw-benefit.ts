// "Flyer Rubros": every line of the benefit box, drawn by the app so they all share one typography.
import { sumAmounts } from "./amounts.ts";
import { setFont } from "./fonts.ts";
import { type BenefitLine, type DrawPass, type FlyerValues } from "./types.ts";

const FAMILY = '"Figtree",Arial,sans-serif';
const SMALLEST_FONT = 8;
const DEFAULT_MAX_LINES = 3;
const HIGHLIGHTED_WEIGHT = 800;
const REGULAR_WEIGHT = 500;

interface Piece {
  text: string;
  highlighted: boolean;
}

type Row = readonly Piece[];

interface Texts {
  name: string;
  cap: string;
  secondCap: string;
}

interface Item {
  line: BenefitLine;
  pieces: readonly Piece[];
  base: number;
  size: number;
}

function piecesOf(text: string): Piece[] {
  const pieces: Piece[] = [];
  let last = 0;
  for (const match of text.matchAll(/\*\*([^*]+)\*\*/g)) {
    if (match.index > last)
      pieces.push({ text: text.slice(last, match.index), highlighted: false });
    pieces.push({ text: match[1] ?? "", highlighted: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) pieces.push({ text: text.slice(last), highlighted: false });
  return pieces;
}

function applyFont(pass: DrawPass, line: BenefitLine, piece: Piece, size: number): void {
  const weight = piece.highlighted
    ? pass.scene.calibration.benef.peso2 || HIGHLIGHTED_WEIGHT
    : line.peso || REGULAR_WEIGHT;
  setFont(pass.ctx, `${String(weight)} `, size, FAMILY);
}

function widthOf(pass: DrawPass, line: BenefitLine, row: Row, size: number): number {
  let width = 0;
  for (const piece of row) {
    applyFont(pass, line, piece, size);
    width += pass.ctx.measureText(piece.text).width;
  }
  return width;
}

function wordsOf(pieces: readonly Piece[]): Piece[] {
  return pieces.flatMap(({ text, highlighted }) =>
    text
      .split(/(\s+)/)
      .filter((part) => part !== "")
      .map((part) => ({ text: part, highlighted })),
  );
}

/** Splits in rows that fit, word by word, without losing which parts are highlighted. */
function rowsOf(
  pass: DrawPass,
  line: BenefitLine,
  pieces: readonly Piece[],
  size: number,
  maxWidth: number,
): Row[] {
  const rows: Row[] = [];
  let current: Piece[] = [];
  let width = 0;
  const close = () => {
    while (current.length > 0 && !current.at(-1)?.text.trim()) current.pop();
    if (current.length > 0) rows.push(current);
    current = [];
    width = 0;
  };
  for (const word of wordsOf(pieces)) {
    applyFont(pass, line, word, size);
    const wordWidth = pass.ctx.measureText(word.text).width;
    const isSpace = !word.text.trim();
    if (!isSpace && current.length > 0 && width + wordWidth > maxWidth) close();
    if (current.length > 0 || !isSpace) {
      current.push(word);
      width += wordWidth;
    }
  }
  close();
  return rows.length > 0 ? rows : [[]];
}

/** With no name, `{nombre}` goes away with its spaces and no hole is left before the sign. */
function withoutName(text: string): string {
  return text
    .replaceAll(/\*\*\s*\{nombre\}\s*\*\*/g, " ")
    .replaceAll(/\s*\{nombre\}\s*/g, " ")
    .replaceAll(/\s+([!?.,;:])/g, "$1")
    .replaceAll(/\s{2,}/g, " ")
    .trim();
}

function lineText(line: BenefitLine, { name, cap, secondCap }: Texts): string | null {
  const text = line.t;
  if (text.includes("{importe}") && !cap.trim()) return null;
  if (text.includes("{importe2}") && !secondCap.trim()) return null;
  const named = name ? text.replaceAll("{nombre}", () => name) : withoutName(text);
  const filled = named
    .replaceAll("{importe2}", () => secondCap)
    .replaceAll("{total}", () => sumAmounts(cap, secondCap))
    .replaceAll("{importe}", () => cap);
  return filled.trim() ? filled : null;
}

function smallestSize(effective: number): number {
  return Math.max(1, Math.round(SMALLEST_FONT * effective));
}

/** With line height, it first tries to wrap at full size and only shrinks if that is not enough. */
function fitWrapped(
  pass: DrawPass,
  line: BenefitLine,
  pieces: readonly Piece[],
  base: number,
  maxWidth: number,
): number {
  const smallest = smallestSize(pass.effective);
  const maxRows = line.maxLin || DEFAULT_MAX_LINES;
  let size = base;
  while (size > smallest) {
    const rows = rowsOf(pass, line, pieces, size, maxWidth);
    const widest = Math.max(0, ...rows.map((row) => widthOf(pass, line, row, size)));
    if (rows.length <= maxRows && widest <= maxWidth) break;
    size = Math.round((size - 0.5) * 2) / 2;
  }
  return Math.max(size, smallest);
}

function fitSingle(
  pass: DrawPass,
  line: BenefitLine,
  pieces: readonly Piece[],
  base: number,
  maxWidth: number,
): number {
  const width = widthOf(pass, line, pieces, base);
  if (width <= maxWidth) return base;
  return Math.max(Math.floor(((base * maxWidth) / width) * 2) / 2, smallestSize(pass.effective));
}

function itemOf(pass: DrawPass, line: BenefitLine, texts: Texts): Item | null {
  const text = lineText(line, texts);
  if (text === null) return null;
  const pieces = piecesOf(text);
  const base = Math.round(line.fs * pass.effective * 2) / 2;
  const maxWidth = Math.round(line.mw * pass.effective);
  const fit = line.lh ? fitWrapped : fitSingle;
  return { line, pieces, base, size: fit(pass, line, pieces, base, maxWidth) };
}

/** Lines of a group are one text in several lines: when one shrinks, the others follow. */
function shrinkGroups(items: readonly Item[], effective: number): void {
  const ratios = new Map<string, number>();
  for (const { line, size, base } of items) {
    if (line.g && base) {
      ratios.set(line.g, Math.min(ratios.get(line.g) ?? Infinity, size / base));
    }
  }
  for (const item of items) {
    const ratio = item.line.g ? (ratios.get(item.line.g) ?? 1) : 1;
    if (ratio < 1) {
      item.size = Math.max(smallestSize(effective), Math.round(item.base * ratio * 2) / 2);
    }
  }
}

function drawItem(pass: DrawPass, { line, pieces, size }: Item): void {
  const { ctx, effective, scene } = pass;
  const { color2 } = scene.calibration.benef;
  const maxWidth = Math.round(line.mw * effective);
  const rows = line.lh ? rowsOf(pass, line, pieces, size, maxWidth) : [pieces];
  const x = Math.round(line.x * effective);
  const y = Math.round(line.y * effective);
  const lineHeight = Math.round((line.lh || 0) * effective);
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  for (const [index, row] of rows.entries()) {
    // The block stays centered on the y of the line: it grows up and down alike.
    const rowY = Math.round(y + (index - (rows.length - 1) / 2) * lineHeight);
    let cursor = line.align === "center" ? x - widthOf(pass, line, row, size) / 2 : x;
    for (const piece of row) {
      applyFont(pass, line, piece, size);
      ctx.fillStyle = piece.highlighted ? color2 : line.color || "#000";
      ctx.fillText(piece.text, cursor, rowY);
      cursor += ctx.measureText(piece.text).width;
    }
  }
}

export function drawBenefit(pass: DrawPass, values: FlyerValues): void {
  const cap = values.importe || "";
  const texts: Texts = {
    name: (values.benefNombre ?? "").trim(),
    cap,
    secondCap: values.importe2 || cap,
  };
  const items = pass.scene.calibration.benef.lineas.flatMap((line) => {
    const item = itemOf(pass, line, texts);
    return item ? [item] : [];
  });
  shrinkGroups(items, pass.effective);
  for (const item of items) drawItem(pass, item);
}
