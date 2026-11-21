// "Flyer Rubros": the lines of the benefit box in the calibrator. They start from the template of the
// option and the whole block is centered on the box found on the picture.
import { normalizeName } from "@/shared/domain/company-registry/text.ts";
import {
  BENEFIT_FIELD_LABELS,
  BENEFIT_LINE_DEFAULTS,
  type BenefitLine,
  mergeZone,
} from "@/shared/flyer-engine/index.ts";
import { BENEFIT_TEMPLATES, type BenefitTemplate } from "./benefit-templates.ts";
import type { CalibratorCalibration } from "./calibration.ts";

export interface BenefitBox {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  /** Where the area of the text starts and ends, to the right of the drawing. */
  readonly textoX0: number;
  readonly textoX1: number;
  readonly cx: number;
  readonly cy: number;
}

interface WithBenefit {
  readonly cfg: CalibratorCalibration;
  readonly optionName: string;
}

const TEMPLATE_KEYS = Object.keys(BENEFIT_TEMPLATES);
const FIRST_TEMPLATE = TEMPLATE_KEYS[0] ?? "combustible";
const MIN_NAME = 4;
const CHARACTER_WIDTH = 0.55;
const SMALLEST_WIDTH = 40;
const BOX_ROOM = 16;
const TEXT_ROOM = 20;
const NARROWEST_TEXT = 200;
const SMALLEST_LINE_FONT = 6;

export function templateOf(key: string): BenefitTemplate {
  return BENEFIT_TEMPLATES[key] ?? BENEFIT_TEMPLATES[FIRST_TEMPLATE] ?? { nombre: "", lineas: [] };
}

function nameMatches(name: string, key: string): boolean {
  const label = normalizeName(templateOf(key).nombre);
  return (
    name.includes(key) ||
    name.includes(label) ||
    (name.length >= MIN_NAME && (key.includes(name) || label.includes(name)))
  );
}

/** The template a flyer starts with, by its name: "Combustible" → fuel, "Súper" → supermarket. */
export function templateForName(optionName: string): string {
  const name = normalizeName(optionName);
  if (name.includes("ambos") || (name.includes("combustible") && name.includes("super"))) {
    return "ambos";
  }
  return TEMPLATE_KEYS.find((key) => key !== "ambos" && nameMatches(name, key)) ?? FIRST_TEMPLATE;
}

/** The lines of a template, whole; the labels of its caps go to the calibration with them. */
export function linesOfTemplate(cfg: CalibratorCalibration, key: string): BenefitLine[] {
  const template = templateOf(key);
  cfg.benef.campos = mergeZone(BENEFIT_FIELD_LABELS, template.campos ?? null);
  return template.lineas.map((line) => mergeZone(BENEFIT_LINE_DEFAULTS, line));
}

/**
 * The lines being calibrated. With none saved they start with the template of the option: the old
 * calibration of two loose lines no longer applies, now the app draws the whole box.
 */
export function benefitLines({ cfg, optionName }: WithBenefit): BenefitLine[] {
  cfg.benef.lineas ??= linesOfTemplate(cfg, templateForName(optionName));
  return cfg.benef.lineas;
}

/** The width of a line without measuring it on a canvas: about half its size per letter. */
export function estimatedWidth(line: BenefitLine): number {
  const text = line.t
    .replaceAll("**", "")
    .replace("{nombre}", "EMPRESA EJEMPLO")
    .replace("{importe2}", "$30.000")
    .replace("{importe}", "$24.000");
  return Math.min(
    line.mw || 820,
    Math.max(SMALLEST_WIDTH, Math.round(text.length * line.fs * CHARACTER_WIDTH)),
  );
}

interface Block {
  readonly top: number;
  readonly bottom: number;
  readonly axis: number;
}

/** The block as it is: from its top to its bottom, and its axis (that of the lines without a shift). */
export function blockOf(lines: readonly BenefitLine[]): Block {
  let top = 1e9;
  let bottom = -1e9;
  let sum = 0;
  for (const line of lines) {
    top = Math.min(top, line.y - line.fs / 2);
    bottom = Math.max(bottom, line.y + line.fs / 2);
    const center = line.align === "left" ? line.x + estimatedWidth(line) / 2 : line.x;
    sum += line.dx === undefined || line.dx === null ? center : line.x - line.dx;
  }
  return { top, bottom, axis: Math.round(sum / lines.length) };
}

function hasShift(line: BenefitLine): line is BenefitLine & { dx: number } {
  return line.dx !== undefined && line.dx !== null;
}

/**
 * Centers the block on the box: every line on the axis of the area of text and the block in the
 * middle, keeping the gaps of the template (if it does not fit, gaps and letters shrink). Without a
 * box, the lines at least go on one same axis, so the whole block can be moved.
 */
export function centerLines(
  lines: BenefitLine[],
  findBox: (middle: number) => BenefitBox | null,
): BenefitBox | null {
  if (lines.length === 0) return null;
  const { top, bottom, axis } = blockOf(lines);
  const middle = (top + bottom) / 2;
  const box = findBox(middle);
  const x = box ? box.cx : axis;
  const y = box ? box.cy : middle;
  const room = box ? box.bottom - box.top - BOX_ROOM : 0;
  const tall = bottom - top;
  const shrink = box && tall > room && tall > 0 ? room / tall : 1;
  const widest = box ? Math.max(NARROWEST_TEXT, box.textoX1 - box.textoX0 - TEXT_ROOM) : 0;
  for (const line of lines) {
    if (hasShift(line)) line.x = x + line.dx;
    else {
      line.align = "center";
      line.x = x;
    }
    line.y = Math.round(y + (line.y - middle) * shrink);
    if (shrink < 1) line.fs = Math.max(SMALLEST_LINE_FONT, Math.round(line.fs * shrink * 2) / 2);
    if (widest && !hasShift(line) && line.mw > widest) line.mw = widest;
  }
  return box;
}

export type LineField = "t" | "fs" | "peso" | "color" | "align";

function numberAtLeast(value: string, least: number, parse: (text: string) => number) {
  const number = parse(value);
  return number >= least ? number : null;
}

/** A field of a line, as it is typed. What does not make sense is not taken. Says if it changed. */
export function editLine(line: BenefitLine, field: LineField, value: string): boolean {
  if (field === "t") {
    line.t = value;
    return true;
  }
  if (field === "align") {
    line.align = value === "left" ? "left" : "center";
    return true;
  }
  if (field === "color") {
    if (!/^#[0-9a-f]{6}$/i.test(value)) return false;
    line.color = value.toLowerCase();
    return true;
  }
  const number =
    field === "fs"
      ? numberAtLeast(value, SMALLEST_LINE_FONT, Number.parseFloat)
      : numberAtLeast(value, 100, (text) => Number.parseInt(text, 10));
  if (number === null) return false;
  if (field === "fs") line.fs = number;
  else line.peso = number;
  return true;
}

/** A new line under the last one, with its size and alignment. */
export function addLine(lines: BenefitLine[]): void {
  const last = lines.at(-1);
  lines.push(
    mergeZone(BENEFIT_LINE_DEFAULTS, {
      t: "Nueva línea",
      x: last ? last.x : 640,
      y: (last ? last.y : 2700) + 24,
      fs: last ? last.fs : 14.5,
      align: last ? last.align : "center",
    }),
  );
}
