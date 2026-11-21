// The zones of the calibrator: which ones each tab offers, where each one is on the picture, which one
// a click takes, and how a drag moves it. In pixels of the flyer (1240 wide).
import type { FlyerTab } from "@/shared/domain/flyer-options.ts";
import { amountBoxHeight, amountBoxTop, type AmountBox } from "@/shared/flyer-engine/index.ts";
import { benefitLines, estimatedWidth } from "./benefit.ts";
import type { CalibratorCalibration } from "./calibration.ts";

export interface Zone {
  readonly id: string;
  readonly label: string;
  readonly color: string;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** The corner of the legal text is a handle: it changes its width and where it ends. */
export interface Grip {
  readonly zone: string;
  readonly handle: "br" | null;
}

/** What the calibrator knows of the flyer it is adjusting. */
export interface CalibratorFrame {
  readonly cfg: CalibratorCalibration;
  readonly tab: FlyerTab;
  /** Its name: the template of the benefit goes by it. */
  readonly optionName: string;
  readonly imageHeight: number;
}

type ZoneId = "empresa" | "montos" | "cashback" | "asesores" | "legal";

const ZONES: Readonly<Record<ZoneId, Zone>> = {
  empresa: { id: "empresa", label: "Empresa", color: "#8e44ad" },
  montos: { id: "montos", label: "Montos (todo)", color: "#1d4070" },
  cashback: { id: "cashback", label: "Cashback", color: "#f5921e" },
  asesores: { id: "asesores", label: "Asesores", color: "#c0392b" },
  legal: { id: "legal", label: "Legales", color: "#0e8a5f" },
};

/** Flyer Sueldo draws one cashback instead of the four amounts: what is not drawn is not moved. */
const TAB_ZONES: Readonly<Record<FlyerTab, readonly ZoneId[]>> = {
  flyer: ["empresa", "montos", "asesores", "legal"],
  rubros: ["empresa", "montos", "asesores", "legal"],
  sueldo: ["empresa", "cashback", "asesores", "legal"],
};

const BOX_LABELS = ["Eminent Black", "Eminent Platinum", "Plus Gold", "Plus"];
const BOX_COLORS = ["#2f6fb0", "#7b5ea7", "#f5921e", "#b26a00"];
const LINE_COLORS = [
  "#f5921e",
  "#b26a00",
  "#7b4a12",
  "#c0392b",
  "#8e44ad",
  "#2c3e50",
  "#16a085",
  "#d35400",
];
const ALL_LINES: Zone = { id: "blAll", label: "Cartel (todo)", color: "#e30613" };
const LONGEST_LABEL = 18;
const HANDLE_REACH = 16;
const GROUP_AIR_X = 10;
const GROUP_AIR_Y = 8;

export function hasBenefit(tab: FlyerTab): boolean {
  return tab === "rubros";
}

export function lineColor(index: number): string {
  return LINE_COLORS[index % LINE_COLORS.length] ?? "";
}

/**
 * The boxes of the amounts, to move one by one (the 2×2 grid). Only where the amounts are drawn: in
 * Flyer Sueldo there would be four invisible zones over that of the cashback.
 */
export function amountBoxes({ cfg, tab }: Pick<CalibratorFrame, "cfg" | "tab">): AmountBox[] {
  return TAB_ZONES[tab].includes("montos") ? cfg.montos.boxes.slice(0, 4) : [];
}

function baseZones(frame: CalibratorFrame): Zone[] {
  return TAB_ZONES[frame.tab].flatMap((id) => {
    if (id !== "montos") return [ZONES[id]];
    const boxes = amountBoxes(frame).map((_box, index) => ({
      id: `mb${String(index)}`,
      label: BOX_LABELS[index] ?? `Monto ${String(index + 1)}`,
      color: BOX_COLORS[index % BOX_COLORS.length] ?? "",
    }));
    return [ZONES.montos].concat(boxes);
  });
}

/** What the chip of a line says: its text, without marks, cut if it is long. */
export function lineLabel(text: string, index: number): string {
  const plain = text
    .replaceAll("**", "")
    .replace("{nombre}", "NOMBRE")
    .replace("{importe2}", "$")
    .replace("{importe}", "$");
  if (!plain) return `Línea ${String(index + 1)}`;
  return plain.length > LONGEST_LABEL ? `${plain.slice(0, LONGEST_LABEL - 1)}…` : plain;
}

/** The chips, in order: in Flyer Rubros the whole box and each of its lines go first. */
export function zonesOf(frame: CalibratorFrame): Zone[] {
  if (!hasBenefit(frame.tab)) return baseZones(frame);
  const lines = benefitLines(frame).map((line, index) => ({
    id: `bl${String(index)}`,
    label: lineLabel(line.t, index),
    color: lineColor(index),
  }));
  return [ALL_LINES, ...lines, ...baseZones(frame)];
}

interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function around(bounds: Bounds | null): Rect | null {
  if (!bounds) return null;
  return {
    x: bounds.x0 - GROUP_AIR_X,
    y: bounds.y0 - GROUP_AIR_Y,
    w: bounds.x1 - bounds.x0 + 2 * GROUP_AIR_X,
    h: bounds.y1 - bounds.y0 + 2 * GROUP_AIR_Y,
  };
}

function grow(bounds: Bounds | null, { x, y, w, h }: Rect): Bounds {
  if (!bounds) return { x0: x, y0: y, x1: x + w, y1: y + h };
  return {
    x0: Math.min(bounds.x0, x),
    y0: Math.min(bounds.y0, y),
    x1: Math.max(bounds.x1, x + w),
    y1: Math.max(bounds.y1, y + h),
  };
}

function amountRects(cfg: CalibratorCalibration, rects: Record<string, Rect>): void {
  const zone = cfg.montos;
  let bounds: Bounds | null = null;
  for (const [index, box] of zone.boxes.entries()) {
    const top = amountBoxTop(zone, box);
    const height = amountBoxHeight(zone, box);
    const rect = { x: box.xc - box.ew / 2, y: top - height / 2, w: box.ew, h: height };
    rects[`mb${String(index)}`] = rect;
    bounds = grow(bounds, rect);
  }
  const group = around(bounds);
  if (group) rects.montos = group;
}

function benefitRects(frame: CalibratorFrame, rects: Record<string, Rect>): void {
  let bounds: Bounds | null = null;
  for (const [index, line] of benefitLines(frame).entries()) {
    const width = estimatedWidth(line);
    // With its own line height, the text takes several rows.
    const height = Math.round(line.lh ? line.lh * 2 : line.fs * 1.25);
    const rect = {
      x: line.align === "left" ? line.x : line.x - width / 2,
      y: line.y - height / 2,
      w: width,
      h: height,
    };
    rects[`bl${String(index)}`] = rect;
    bounds = grow(bounds, rect);
  }
  const group = around(bounds);
  if (group) rects.blAll = group;
}

/** Where each zone is. What is anchored at the bottom follows the height of the picture. */
export function zoneRects(frame: CalibratorFrame): Record<string, Rect> {
  const { cfg, imageHeight } = frame;
  const below = imageHeight - (cfg.imgH || 6457);
  const { empresa, contacto, legal, cashback } = cfg;
  const rects: Record<string, Rect> = {
    empresa: { x: empresa.ex, y: empresa.yc - empresa.lh, w: empresa.mw, h: empresa.lh * 2 },
    asesores: { x: contacto.ex, y: contacto.ey + below, w: contacto.ew, h: contacto.eh },
    legal: { x: legal.x0, y: legal.yStart + below, w: legal.maxW, h: legal.yEnd - legal.yStart },
    cashback: {
      x: cashback.xc - cashback.mw / 2,
      y: cashback.y - cashback.mh / 2,
      w: cashback.mw,
      h: cashback.mh,
    },
  };
  amountRects(cfg, rects);
  if (hasBenefit(frame.tab)) benefitRects(frame, rects);
  return rects;
}

function inside(rect: Rect | undefined, x: number, y: number): boolean {
  return Boolean(
    rect && x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h,
  );
}

function onLegalCorner(rects: Record<string, Rect>, x: number, y: number): boolean {
  const legal = rects.legal;
  return Boolean(
    legal &&
    Math.abs(x - (legal.x + legal.w)) < HANDLE_REACH &&
    Math.abs(y - (legal.y + legal.h)) < HANDLE_REACH,
  );
}

/** In what order a click looks: lines before the box, single amounts before the group of them. */
function hitOrder(frame: CalibratorFrame): string[] {
  const lines = hasBenefit(frame.tab)
    ? [...benefitLines(frame).map((_line, index) => `bl${String(index)}`), "blAll"]
    : [];
  const boxes = amountBoxes(frame).map((_box, index) => `mb${String(index)}`);
  const rest = baseZones(frame)
    .map(({ id }) => id)
    .filter((id) => !/^mb\d+$/.test(id));
  return [...lines, ...boxes, ...rest];
}

/** The zone under a click. With one chosen, only that one can be taken: the others are hidden. */
export function zoneAt(
  frame: CalibratorFrame,
  chosen: string | null,
  x: number,
  y: number,
): Grip | null {
  const rects = zoneRects(frame);
  if (chosen) {
    if (chosen === "legal" && onLegalCorner(rects, x, y)) return { zone: "legal", handle: "br" };
    return inside(rects[chosen], x, y) ? { zone: chosen, handle: null } : null;
  }
  if (onLegalCorner(rects, x, y)) return { zone: "legal", handle: "br" };
  const zone = hitOrder(frame).find((id) => inside(rects[id], x, y));
  return zone ? { zone, handle: null } : null;
}
