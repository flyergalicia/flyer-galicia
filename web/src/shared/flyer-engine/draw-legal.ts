import { setFont } from "./fonts.ts";
import { bottomAnchored } from "./geometry.ts";
import { splitBold } from "./legal-text.ts";
import { type DrawPass } from "./types.ts";

interface Token {
  text: string;
  bold: boolean;
  width: number;
}

/** A line of tokens, or null for the gap of an empty paragraph. */
type LegalLine = readonly Token[] | null;

interface Layout {
  fontSize: number;
  lineHeight: number;
  gapHeight: number;
  lines: readonly LegalLine[];
}

const BOLD = "bold ";
const MEASURE_LIMIT = 20_000;
const LAYOUT_LIMIT = 24;
const COVER_LEFT = 2;
const COVER_TOP = 5;
const COVER_WIDTH = 20;
const COVER_HEIGHT = 30;

// A legal text has about a thousand words, and setting a font is expensive: measures and wrapped
// lines are remembered. They depend only on what their keys say, because the family is fixed.
const measures = new Map<string, number>();
const layouts = new Map<string, readonly LegalLine[]>();

function measured(
  ctx: CanvasRenderingContext2D,
  bold: boolean,
  size: number,
  text: string,
): number {
  const key = `${bold ? "b" : "n"}${String(size)}|${text}`;
  const known = measures.get(key);
  if (known !== undefined) return known;
  setFont(ctx, bold ? BOLD : "", size);
  if (measures.size > MEASURE_LIMIT) measures.clear();
  const width = ctx.measureText(text).width;
  measures.set(key, width);
  return width;
}

function wrapParagraph(
  ctx: CanvasRenderingContext2D,
  paragraph: string,
  size: number,
  maxWidth: number,
): LegalLine[] {
  const lines: LegalLine[] = [];
  let current: Token[] = [];
  let width = 0;
  for (const segment of splitBold(paragraph)) {
    const words = segment.text.split(" ");
    for (const [index, word] of words.entries()) {
      if (word) {
        const text = index < words.length - 1 ? `${word} ` : word;
        const tokenWidth = measured(ctx, segment.bold, size, text);
        if (width + tokenWidth > maxWidth && current.length > 0) {
          lines.push(current);
          current = [];
          width = 0;
        }
        current.push({ text, bold: segment.bold, width: tokenWidth });
        width += tokenWidth;
      }
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

function linesOf(
  ctx: CanvasRenderingContext2D,
  text: string,
  size: number,
  maxWidth: number,
): readonly LegalLine[] {
  const key = `${String(size)}|${String(maxWidth)}|${text}`;
  const known = layouts.get(key);
  if (known) return known;
  const lines = text
    .split("\n")
    .flatMap((paragraph) =>
      paragraph.trim() ? wrapParagraph(ctx, paragraph, size, maxWidth) : [null],
    );
  if (layouts.size > LAYOUT_LIMIT) layouts.clear();
  layouts.set(key, lines);
  return lines;
}

function layoutHeight(lines: readonly LegalLine[], lineHeight: number, gapHeight: number): number {
  return lines.reduce((total, line) => total + (line ? lineHeight : gapHeight), 0);
}

/** It tries the calibrated size, and if the text does not fit it shrinks down to the minimums. */
function fittedLayout(
  { ctx, effective, scene }: DrawPass,
  text: string,
  maxWidth: number,
  available: number,
): Layout {
  const zone = scene.calibration.legal;
  const fontSize = Math.round(zone.fs * effective);
  const lineHeight = Math.round(zone.lh * effective);
  const gapHeight = Math.round(zone.gap * effective);
  const lines = linesOf(ctx, text, fontSize, maxWidth);
  const total = layoutHeight(lines, lineHeight, gapHeight);
  if (total <= available || total <= 0) return { fontSize, lineHeight, gapHeight, lines };
  const ratio = available / total;
  const smaller = Math.max(Math.floor(fontSize * ratio), Math.round(zone.minFs * effective));
  return {
    fontSize: smaller,
    lineHeight: Math.max(Math.floor(lineHeight * ratio), Math.round(zone.minLh * effective)),
    gapHeight: Math.max(Math.floor(gapHeight * ratio), Math.round(zone.minGap * effective)),
    lines: linesOf(ctx, text, smaller, maxWidth),
  };
}

/** Returns where the last line ends, in pixels of the target; 0 if there is no text. */
export function drawLegal(pass: DrawPass, text: string): number {
  if (!text.trim()) return 0;
  const { ctx, effective, scale, scene, extra } = pass;
  const zone = scene.calibration.legal;
  const left = Math.round(zone.x0 * effective);
  const start = Math.round(bottomAnchored(scene, zone.yStart, scale, extra));
  const end = Math.round(bottomAnchored(scene, zone.yEnd, scale, extra));
  const maxWidth = Math.round(zone.maxW * effective);
  const available = end - start;
  ctx.fillStyle = zone.bg;
  ctx.fillRect(
    left - Math.round(COVER_LEFT * effective),
    start - Math.round(COVER_TOP * effective),
    maxWidth + Math.round(COVER_WIDTH * effective),
    available + Math.round(COVER_HEIGHT * effective),
  );
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const { fontSize, lineHeight, gapHeight, lines } = fittedLayout(pass, text, maxWidth, available);
  ctx.fillStyle = zone.color;
  let y = start;
  let lastBold: boolean | null = null;
  for (const line of lines) {
    if (line === null) {
      y += gapHeight;
    } else {
      let x = left;
      for (const token of line) {
        if (token.bold !== lastBold) {
          setFont(ctx, token.bold ? BOLD : "", fontSize);
          lastBold = token.bold;
        }
        ctx.fillText(token.text, x, y);
        x += token.width;
      }
      y += lineHeight;
    }
  }
  return y;
}
