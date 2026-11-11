// The size, weight and color of each zone, written in the calibration of that flyer. A single box of
// the amounts has its own: its width and height say how much of the art is covered.
import { factoryCalibration } from "@/shared/flyer-engine/index.ts";
import type { CalibratorCalibration } from "./calibration.ts";

export type PropertyKind = "number" | "weight" | "color" | "colors";

export interface PropertyField {
  readonly key: string;
  readonly kind: PropertyKind;
  readonly label: string;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  /** The color shown while there is none. */
  readonly fallback?: string;
}

export interface ZoneProperties {
  /** Which object of the calibration it is. */
  readonly zone: "empresa" | "montos" | "cashback" | "contacto" | "legal";
  /** A box of the amounts: an element of `montos.boxes`. */
  readonly box?: number;
  readonly fields: readonly PropertyField[];
}

const size = (label: string, min: number, max: number, step = 1): PropertyField => ({
  key: "fs",
  kind: "number",
  label,
  min,
  max,
  step,
});
const weight = (label = "Peso"): PropertyField => ({ key: "peso", kind: "weight", label });

const PROPERTIES: Readonly<Record<string, ZoneProperties>> = {
  empresa: {
    zone: "empresa",
    fields: [
      size("Letra px", 10, 160),
      weight(),
      { key: "color", kind: "color", label: "Color", fallback: "#111111" },
      { key: "mw", kind: "number", label: "Ancho máx.", min: 100, max: 1240, step: 5 },
    ],
  },
  montos: {
    zone: "montos",
    fields: [
      size("Letra px", 10, 160),
      weight(),
      { key: "mh", kind: "number", label: "Alto caja", min: 20, max: 220, step: 1 },
      { key: "boxes", kind: "colors", label: "Color de cada monto" },
    ],
  },
  cashback: {
    zone: "cashback",
    fields: [
      size("Letra px", 10, 240),
      weight(),
      { key: "col", kind: "color", label: "Color", fallback: "#fa6400" },
      { key: "mw", kind: "number", label: "Ancho máx.", min: 100, max: 1240, step: 5 },
    ],
  },
  asesores: {
    zone: "contacto",
    fields: [
      { key: "fnBold", kind: "number", label: "Nombre px", min: 8, max: 90, step: 1 },
      { key: "frReg", kind: "number", label: "Cel./mail px", min: 8, max: 90, step: 1 },
      weight("Peso del nombre"),
      { key: "color", kind: "color", label: "Color", fallback: "#111111" },
    ],
  },
  legal: {
    zone: "legal",
    fields: [
      size("Letra px", 5, 48, 0.5),
      { key: "lh", kind: "number", label: "Interlineado", min: 6, max: 70, step: 0.5 },
      { key: "color", kind: "color", label: "Color", fallback: "#222222" },
    ],
  },
};

const BOX_FIELDS: readonly PropertyField[] = [
  { key: "ew", kind: "number", label: "Ancho caja", min: 40, max: 1240, step: 5 },
  { key: "mh", kind: "number", label: "Alto caja", min: 20, max: 220, step: 1 },
  { key: "col", kind: "color", label: "Color", fallback: "#1d4070" },
];

export const WEIGHTS: readonly { readonly value: number; readonly label: string }[] = [
  { value: 400, label: "400 fina" },
  { value: 500, label: "500" },
  { value: 600, label: "600" },
  { value: 700, label: "700" },
  { value: 800, label: "800 negrita" },
];

/** What the chosen zone lets change; none for the lines of the benefit, which have their own table. */
export function propertiesOf(zone: string | null): ZoneProperties | null {
  const box = /^mb(\d+)$/.exec(zone ?? "");
  if (box) return { zone: "montos", box: Number(box[1]), fields: BOX_FIELDS };
  return (zone && PROPERTIES[zone]) || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** The object of the calibration those properties are written in. */
export function propertiesTarget(
  cfg: Readonly<Record<string, unknown>>,
  properties: ZoneProperties,
): Record<string, unknown> | null {
  const zone = cfg[properties.zone];
  if (!isRecord(zone)) return null;
  if (properties.box === undefined) return zone;
  const boxes = zone.boxes;
  const box: unknown = Array.isArray(boxes) ? boxes[properties.box] : null;
  return isRecord(box) ? box : null;
}

/** "#abc" is "#aabbcc": a color field only takes six digits. Anything else shows the fallback. */
export function sixDigitColor(value: unknown, fallback = "#000000"): string {
  const text = typeof value === "string" ? value.trim() : "";
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(text);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  return /^#[0-9a-f]{6}$/i.test(text) ? text : fallback;
}

/** Writes a field as it is typed: a number as a number (or 0), anything else as text. */
export function setProperty(
  cfg: CalibratorCalibration,
  zone: string,
  field: PropertyField,
  value: string,
): void {
  const properties = propertiesOf(zone);
  const target = properties && propertiesTarget(cfg, properties);
  if (!target) return;
  target[field.key] = field.kind === "number" ? Number.parseFloat(value) || 0 : value;
}

/** The color of one of the boxes, from the field of the whole group. */
export function setBoxColor(cfg: CalibratorCalibration, index: number, value: string): void {
  const box = cfg.montos.boxes[index];
  if (box) box.col = value;
}

/** Restablecer: the zone goes back to the values of the factory, without moving from its place. */
export function resetProperties(cfg: CalibratorCalibration, zone: string): void {
  const properties = propertiesOf(zone);
  const target = properties && propertiesTarget(cfg, properties);
  const factory = properties && propertiesTarget(factoryCalibration(), properties);
  if (!properties || !target || !factory) return;
  for (const field of properties.fields) {
    if (field.kind === "colors") resetColors(cfg, factory);
    else if (factory[field.key] !== undefined && factory[field.key] !== null) {
      target[field.key] = factory[field.key];
    }
  }
}

function resetColors(cfg: CalibratorCalibration, factory: Record<string, unknown>): void {
  const boxes = Array.isArray(factory.boxes) ? factory.boxes : [];
  for (const [index, box] of cfg.montos.boxes.entries()) {
    const original: unknown = boxes[index];
    if (isRecord(original) && typeof original.col === "string") box.col = original.col;
  }
}
