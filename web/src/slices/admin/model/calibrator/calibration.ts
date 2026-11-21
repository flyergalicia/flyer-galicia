// The calibration the calibrator edits: the one of the factory with what was saved for that image on
// top. It is changed in place, as a drag changes it many times a second, and it is saved as it is.
import {
  type BenefitLine,
  type FactoryCalibration,
  factoryCalibration,
} from "@/shared/flyer-engine/index.ts";

export type CalibratorBenefit = FactoryCalibration["benef"] & {
  campos?: Readonly<Record<string, string>>;
  lineas: BenefitLine[] | null;
  [key: string]: unknown;
};

export type CalibratorCalibration = Omit<FactoryCalibration, "benef"> & {
  /** The final height chosen by hand; 0 or none: it is cut after the legal text. */
  cropH?: number;
  benef: CalibratorBenefit;
  [key: string]: unknown;
};

export function startingCalibration(): CalibratorCalibration {
  return factoryCalibration();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Never `__proto__` and the like: a saved file with those would change every object of the app. */
function isDangerousKey(key: string): boolean {
  return key === "__proto__" || key === "constructor" || key === "prototype";
}

function ownKeys(value: object): string[] {
  return Object.keys(value).filter((key) => !isDangerousKey(key));
}

/**
 * What was saved for the image goes over the calibration of the factory, zone by zone: a zone keeps
 * what it does not say. The old loose title and cap of the benefit no longer apply: the app draws the
 * whole box now.
 */
export function mergeSaved(base: CalibratorCalibration, saved: unknown): void {
  if (!isPlainObject(saved)) return;
  for (const key of ownKeys(saved)) {
    const value = saved[key];
    const target = base[key];
    if (isPlainObject(value) && isPlainObject(target)) {
      for (const inner of ownKeys(value)) target[inner] = value[inner];
    } else {
      base[key] = value;
    }
  }
  if (isPlainObject(base.benef)) {
    delete base.benef.titulo;
    delete base.benef.tope;
  }
}

/** The height typed in "Altura final": empty or nothing positive is automatic. */
export function finalHeightOf(typed: string): number {
  const height = Number.parseInt(typed, 10);
  return typed !== "" && height > 0 ? height : 0;
}
